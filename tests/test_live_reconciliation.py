"""Standard-library tests for the read-only reconciliation report."""
import hashlib
import contextlib
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from decimal import Decimal

from scripts_check_calculations import read_only_connection
from scripts_reconcile_live import TABLES, build_report, main


class ReconciliationReport(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.row_factory=sqlite3.Row
        for table,fields in TABLES.items():
            self.db.execute('CREATE TABLE "{}" ({})'.format(table,','.join('"{}" TEXT'.format(f) for f in fields.split())))

    def tearDown(self):
        self.db.close()

    def add(self, table, **data):
        self.db.execute('INSERT INTO "{}" ({}) VALUES ({})'.format(table,','.join('"{}"'.format(f) for f in data),','.join('?' for _ in data)),tuple(data.values()))

    def report(self, deposits=(), accounts=(), limit=12):
        return build_report(self.db,deposits,accounts,limit)

    def deposit(self):
        self.add('customers',id='c',name='Customer',balances='{"LYD":10}')
        self.add('vaults',id='v',name='Vault',balances='{"LYD":1005}')
        self.add('transactions',id='d',type='deposit',status='reversed',customer_id='c',amount=100,from_currency='LYD',timestamp='2026-01-01')
        self.add('customer_account_entries',id='d',customer_id='c',currency='LYD',amount=100,balance_before=0,balance_after=100)
        for kind,eid,before,after,later_before,later_after in [('customer','c',0,100,0,10),('vault','v',1000,1100,1000,1005)]:
            self.add('movements',id='m_'+eid,timestamp='2026-01-01 10:00',entity_type=kind,entity_id=eid,currency='LYD',type='Deposit',status='reversed',amount_in=100,amount_out=0,balance_before=before,balance_after=after,reference_id='d')
            self.add('movements',id='next_'+eid,timestamp='2026-01-02 10:00',entity_type=kind,entity_id=eid,currency='LYD',type='Other',status='active',amount_in=later_after-later_before,amount_out=0,balance_before=later_before,balance_after=later_after,reference_id='other')
        self.add('journal_entries',id='JV-d',reference='d',status='reversed',date='2026-01-01',tx_type='Deposit',lines='[]')
        self.add('audit_logs',id='1',entity_type='Movement',entity_id='d',action='REVERSE',username='Test',created_at='2026-01-01 11:00',description='Reversed deposit')

    def vehicle(self,id='car',company='bayan',currency='LYD',price=0,**extra):
        values=dict(id=id,company=company,name=id,currency=currency,purchase_price=price,sale_price=None,sale_currency=None,sale_client_account_id=None)
        values.update(extra); self.add('fleet_vehicles',**values)

    def account(self, balance=250, kind='manual'):
        self.add('fleet_accounts',id='a',company='bayan',name='Bank 12345678',currency='LYD',account_type=kind,bank_name=None,account_number='12345678',balance=balance,is_active=1)

    def ledger(self,id,amount,date='2026-01-01',after=0,vehicle='car',**extra):
        values=dict(id=id,vehicle_id=vehicle,account_id='a',type='income',category='Rental',currency='LYD',amount=amount,date=date,timestamp=date+' 10:00',balance_after=after)
        values.update(extra); self.add('fleet_transactions',**values)

    def test_unrecorded_undo_gap_is_a_hint_not_a_balance_correction(self):
        self.deposit()
        r=self.report(deposits=('d',))
        self.assertTrue(r['complete'])
        d=r['deposits'][0]['data']
        self.assertEqual(d['recorded_movement_count'],2)
        self.assertEqual(len(d['legs']),2)
        for leg in d['legs']:
            self.assertEqual(leg['reference_net'],Decimal(100))
            self.assertEqual(leg['matching_undo_gap_candidates']['total'],1)
            self.assertIn('not proof',leg['interpretation'])
        self.assertEqual(d['audit_history']['total'],1)
        self.assertEqual(self.db.execute('SELECT balances FROM customers').fetchone()[0],'{"LYD":10}')

    def test_no_undo_evidence_does_not_claim_wallet_was_restored(self):
        self.deposit()
        self.db.execute("UPDATE movements SET balance_before=100,balance_after=110 WHERE id='next_c'")
        self.db.execute("UPDATE customers SET balances='{\"LYD\":110}'")
        legs=self.report(deposits=('d',))['deposits'][0]['data']['legs']
        c=next(x for x in legs if x['entity_type']=='customer')
        self.assertEqual(c['matching_undo_gap_candidates']['total'],0)
        self.assertIn('No conclusive',c['interpretation'])

    def test_recorded_countermovements_cancel_both_sides(self):
        self.deposit()
        for kind,id,before,after in [('customer','c',100,0),('vault','v',1100,1000)]:
            self.add('movements',id='m_rev_'+id,timestamp='2026-01-01 11:00',entity_type=kind,entity_id=id,currency='LYD',type='عكس — Deposit',status='reversed',amount_in=0,amount_out=100,balance_before=before,balance_after=after,reference_id='d')
        legs=self.report(deposits=('d',))['deposits'][0]['data']['legs']
        self.assertTrue(all(x['reference_net']==0 and x['counter_movement_present'] for x in legs))

    def test_stale_snapshot_with_consistent_live_ledger(self):
        self.vehicle(); self.account()
        self.ledger('first',200,after=250)
        self.ledger('last',50,date='2026-01-02',after=150)
        a=self.report(accounts=('a',))['fleet_accounts'][0]['data']
        self.assertEqual(a['stored_latest_to_live_delta'],100)
        self.assertEqual(a['live_minus_surviving_net_including_drawdowns'],0)
        self.assertTrue(a['internally_matches_zero_opening'])
        self.assertEqual([r['displayed_balance_after'] for r in a['recent_ledger']['rows']],[250,200])
        self.assertNotIn('12345678',json.dumps(a,default=str))

    def test_client_drawdown_is_included_without_fabricating_cash_rows(self):
        self.vehicle(sale_price=100,sale_client_account_id='a',sale_currency='LYD')
        self.account(balance=-10,kind='client'); self.ledger('deposit',90,after=90)
        a=self.report(accounts=('a',))['fleet_accounts'][0]['data']
        self.assertTrue(a['internally_matches_zero_opening'])
        self.assertEqual(a['implicit_client_sale_drawdowns'],100)
        self.assertIsNone(a['recent_ledger']['rows'][0]['displayed_balance_after'])

    def test_multiple_bank_hints_are_only_current_metadata_evidence(self):
        self.account(balance=-300)
        self.vehicle('one',price=100,purchase_bank_details='البنك: First — رقم الحساب: 12345678')
        self.vehicle('two',price=200,purchase_bank_details='البنك: Second — رقم الحساب: 22222222')
        self.ledger('p1',100,vehicle='one',type='expense',category='شراء المركبة/المعدة',after=-100)
        self.ledger('p2',200,vehicle='two',type='expense',category='شراء المركبة/المعدة',after=-300)
        a=self.report(accounts=('a',))['fleet_accounts'][0]['data']
        self.assertTrue(a['multiple_current_bank_identities_in_legacy_tracker'])
        self.assertEqual(len(a['current_vehicle_bank_hints']),2)
        self.assertNotIn('12345678',json.dumps(a,default=str))
        self.assertNotIn('22222222',json.dumps(a,default=str))

    def test_usage_census_distinguishes_foreign_sales_and_placeholder_depreciation(self):
        self.vehicle(currency='USD',price=100,sale_price=600,sale_currency='LYD')
        self.add('fixed_assets',id='asset',currency='LYD',status='نشط',purchase_price=100,current_value=100)
        self.add('depreciation_records',asset_id='asset',accumulated_depreciation=0,current_book_value=100)
        usage=self.report()['usage']
        self.assertEqual(usage['fleet_fx']['data']['sold_with_foreign_amounts']['total'],1)
        self.assertEqual(usage['assets']['data']['depreciation_records'],1)
        self.assertEqual(usage['assets']['data']['depreciation_with_nonzero_accumulated'],0)
        self.assertEqual(usage['assets']['data']['journal_records_with_direct_asset_reference'],0)

    def test_foreign_interest_movement_is_usage_even_without_a_journal(self):
        self.add('movements',id='interest',reference_id='int_old',entity_type='bank_account',type='إضافة فائدة وديعة بنكية',amount_in=10,amount_out=0,currency='USD')
        d=self.report()['usage']['interest']['data']
        self.assertEqual(d['priority'],'REVIEW_FOREIGN_INTEREST')
        self.assertEqual(d['foreign_interest_movement_rows'],1)

    def test_other_asset_registry_is_not_classified_unused(self):
        self.add('vehicles',id='registered-car')
        self.assertEqual(self.report()['usage']['assets']['data']['priority'],'ASSET_ACTIVITY_PRESENT_REVIEW_POSTING_REQUIREMENTS')

    def test_missing_schema_and_missing_target_are_not_zero_usage(self):
        self.db.execute('DROP TABLE bank_deposits')
        r=self.report(deposits=('missing',))
        self.assertFalse(r['complete'])
        self.assertEqual(r['usage']['interest']['coverage'],'unavailable')
        self.assertNotIn('data',r['usage']['interest'])
        self.assertEqual(r['deposits'][0]['coverage'],'unavailable')

    def test_invalid_money_marks_the_section_unavailable(self):
        self.deposit()
        self.db.execute("UPDATE movements SET amount_in='not-money' WHERE id='m_c'")
        r=self.report(deposits=('d',))
        self.assertFalse(r['complete'])
        self.assertEqual(r['deposits'][0]['coverage'],'unavailable')

    def test_unknown_fleet_type_is_not_assumed_to_be_expense(self):
        self.vehicle(); self.account(); self.ledger('invalid',100,type='unknown')
        r=self.report(accounts=('a',))
        self.assertFalse(r['complete'])
        self.assertEqual(r['fleet_accounts'][0]['coverage'],'unavailable')

    def test_missing_database_is_not_created(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'missing.sqlite'
            output=io.StringIO()
            with contextlib.redirect_stdout(output):
                code=main(['--db',str(path),'--json'])
            self.assertEqual(code,2)
            self.assertFalse(path.exists())
            self.assertFalse(json.loads(output.getvalue())['complete'])

    def test_display_truncation_does_not_change_ledger_arithmetic(self):
        self.vehicle(); self.account(balance=300)
        for i in range(3):
            self.ledger(str(i),100,date='2026-01-0'+str(i+1),after=(i+1)*100)
        a=self.report(accounts=('a',),limit=1)['fleet_accounts'][0]['data']
        self.assertEqual(a['recent_ledger']['shown'],1)
        self.assertEqual(a['recent_ledger']['total'],3)
        self.assertEqual(a['valid_primary_net'],300)

    def test_no_usage_is_record_scoped_and_wallet_method_is_not_assumed_debt(self):
        empty=self.report()['usage']
        self.assertEqual(empty['interest']['data']['priority'],'NO_RECORDED_WORKFLOW_USAGE')
        self.add('transactions',id='trade',type='buy',payment_method='customer_account',commission=0,status='approved')
        trade=self.report()['usage']['pos_credit_commissions']['data']
        self.assertEqual(trade['debt_method_records'],0)
        self.assertEqual(trade['customer_account_method_records'],1)

    def test_read_only_report_preserves_database_and_denies_writes(self):
        self.deposit(); self.db.commit()
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'production #copy.sqlite'
            target=sqlite3.connect(str(path))
            try:
                self.db.backup(target)
            finally:
                target.close()
            before=hashlib.sha256(path.read_bytes()).hexdigest()
            con=read_only_connection(path)
            try:
                self.assertTrue(build_report(con,('d',),())['complete'])
                with self.assertRaises(sqlite3.DatabaseError):
                    con.execute('UPDATE customers SET balances=\'{}\'')
            finally:
                con.close()
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),before)


if __name__=='__main__':
    unittest.main()
