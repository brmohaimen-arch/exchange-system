"""Read-only statement reconstruction, FX validation and tracker regressions."""
import unittest
from sqlalchemy import select

from app.models import ExchangeRate, FleetAccount, FleetTransaction, FleetVehicle
from app.routers import fleet as f
import test_accounting_preventive as fixtures


class FleetConsistency(unittest.TestCase):
    setUp=fixtures.PreventiveAccounting.setUp
    tearDown=fixtures.PreventiveAccounting.tearDown
    call=fixtures.PreventiveAccounting.call
    car=fixtures.PreventiveAccounting.car
    account=fixtures.PreventiveAccounting.account
    income=fixtures.PreventiveAccounting.income
    error=fixtures.PreventiveAccounting.error

    def edit(self,t,**kw):
        data=dict(amount=t.amount,category=t.category,date=t.date,reason='Correction')
        data.update(kw)
        return self.call(f.edit_fleet_transaction,t.id,f.FleetTransactionEdit(**data))

    def test_edit_earlier_row_updates_screen_and_statement_without_rewriting_snapshots(self):
        v=self.car(); first=self.income(v,amount=100,date='2026-01-01'); last=self.income(v,amount=50,date='2026-01-02')
        self.edit(first,amount=200)
        stored=last.balance_after
        balances=f._statement_balances(self.db,'bayan')
        self.assertEqual((balances[first.id],balances[last.id]),(200,250))
        self.assertEqual(last.balance_after,stored)
        self.assertEqual(stored,150)
        rows=self.call(f.list_fleet_transactions,v.id).data
        self.assertEqual([r['balanceAfter'] for r in rows],[250,200])
        all_rows=self.call(f.list_all_fleet_transactions).data
        self.assertEqual([r['balanceAfter'] for r in all_rows],[250,200])
        sections,_=f._fleet_statement_sections(self.db,'','','bayan')
        self.assertEqual([r[11] for r in sections[0][2]],['200.00','250.00'])
        self.assertFalse(self.db.dirty)

    def test_deletion_and_account_change_leave_remaining_balances_consistent(self):
        v=self.car(); first=self.income(v,amount=100,date='2026-01-01'); last=self.income(v,amount=50,date='2026-01-02')
        a=self.account()
        self.edit(first,account_id=a.id)
        balances=f._statement_balances(self.db,'bayan')
        self.assertEqual(balances[last.id],50)
        self.assertEqual(balances[first.id],1100)
        self.call(f.delete_fleet_transaction,first.id)
        self.assertEqual(f._statement_balances(self.db,'bayan')[last.id],50)
        self.assertEqual(a.balance,1000)

    def test_filters_use_full_account_history_including_other_vehicles(self):
        v=self.car(); other=self.car()
        self.income(other,amount=100,date='2026-01-01')
        t=self.income(v,amount=50,date='2026-01-02')
        self.income(other,amount=20,date='2026-01-03')
        self.assertEqual(self.call(f.list_fleet_transactions,v.id).data[0]['balanceAfter'],150)
        filtered=self.call(f.list_all_fleet_transactions,date_from='2026-01-02',date_to='2026-01-02').data
        self.assertEqual([(r['id'],r['balanceAfter']) for r in filtered],[(t.id,150)])
        sections,_=f._fleet_statement_sections(self.db,'2026-01-02','2026-01-02','bayan')
        self.assertEqual(sections[0][2][0][11],'150.00')

    def test_currencies_accounts_and_company_boundaries_stay_separate(self):
        v=self.car(); lyd=self.income(v)
        usd=self.income(v,amount=20,currency='USD')
        other=self.car('imtiaz'); self.income(other,amount=1000)
        balances=f._statement_balances(self.db,'bayan')
        self.assertEqual(balances[lyd.id],100)
        self.assertEqual(balances[usd.id],20)
        self.assertEqual(len(balances),2)

    def test_backdated_entries_replay_by_date_and_same_minute_creation_order(self):
        v=self.car(); later=self.income(v,amount=50,date='2026-01-02'); early=self.income(v,amount=100,date='2026-01-01')
        balances=f._statement_balances(self.db,'bayan')
        self.assertEqual((balances[early.id],balances[later.id]),(100,150))
        # IDs encode ordering when timestamps tie, regardless of lexical suffix.
        later.date=early.date
        early.id='fleettx_1700000000000_ffffff'
        later.id='fleettx_1700000000001_000000'
        self.db.commit()
        self.assertLess(f._ledger_order(early),f._ledger_order(later))

    def test_client_balances_are_hidden_because_sale_drawdowns_have_no_own_rows(self):
        a=self.account(); a.account_type='client'; self.db.commit()
        v=self.car(); t=self.income(v,account_id=a.id)
        self.assertIsNone(f._statement_balances(self.db,'bayan')[t.id])
        self.assertIsNone(self.call(f.list_fleet_transactions,v.id).data[0]['balanceAfter'])

    def test_manual_trackers_use_bank_and_number_and_preserve_legacy(self):
        legacy=FleetAccount(id='legacy',name='Old merged tracker',company='bayan',currency='LYD',account_number='123',account_type='manual',balance=777,created_by='Test',timestamp='2026-01-01')
        self.db.add(legacy); self.db.commit()
        first=f._get_manual_account(self.db,'bayan','LYD','البنك: First Bank — رقم الحساب: 123 — صاحب الحساب: Owner A')
        self.db.commit()
        same=f._get_manual_account(self.db,'bayan','LYD','البنك: FIRST   BANK — رقم الحساب: 123 — صاحب الحساب: Owner B')
        different=f._get_manual_account(self.db,'bayan','LYD','البنك: Second Bank — رقم الحساب: 123 — صاحب الحساب: Owner A')
        self.db.commit()
        self.assertEqual(first.id,same.id)
        self.assertNotEqual(first.id,different.id)
        self.assertNotEqual(first.id,legacy.id)
        self.assertEqual(legacy.balance,777)
        self.assertIsNone(legacy.bank_name)

    def test_unstructured_manual_details_do_not_collide_after_truncation(self):
        first=f._get_manual_account(self.db,'bayan','LYD','x'*160+'A')
        self.db.commit()
        second=f._get_manual_account(self.db,'bayan','LYD','x'*160+'B')
        self.assertNotEqual(first.id,second.id)
        self.assertLessEqual(len(first.account_number),100)

    def test_missing_invalid_and_valid_fx_rate(self):
        self.error('MISSING_EXCHANGE_RATE',f._to_lyd,self.db,'USD',100)
        self.assertEqual(f._Rates(self.db).lyd('USD',0),0)
        r=ExchangeRate(id='usd',from_currency='USD',to_currency='LYD',buy_rate=5,sell_rate=0,min_rate=0,max_rate=0,valid_from='2026-01-01',valid_to='2099-01-01',last_updated='2026-01-01',updated_by='Test')
        self.db.add(r); self.db.commit()
        self.error('MISSING_EXCHANGE_RATE',f._to_lyd,self.db,'USD',100)
        r.sell_rate=5.2; self.db.commit()
        self.assertEqual(f._to_lyd(self.db,'USD',100),520)
        self.assertEqual(f._Rates(self.db).lyd('USD',100),520)

    def test_sale_that_cannot_be_valued_does_not_commit_any_money(self):
        v=self.car(price=100,currency='USD')
        self.error('MISSING_EXCHANGE_RATE',self.call,f.sell_fleet_vehicle,v.id,f.FleetVehicleSell(buyer_name='Buyer',sale_price=600,sale_currency='LYD',sale_date='2026-01-03',sale_payment_method='cash'))
        self.assertIsNone(self.db.get(FleetVehicle,v.id).sale_price)
        self.assertEqual(self.db.scalar(select(FleetTransaction).where(FleetTransaction.vehicle_id==v.id)).type,'expense')
        self.assertEqual(len(self.db.scalars(select(FleetTransaction).where(FleetTransaction.vehicle_id==v.id)).all()),1)

    def test_vehicle_edit_valuation_failure_rolls_back_metadata(self):
        self.db.add(ExchangeRate(id='usd',from_currency='USD',to_currency='LYD',buy_rate=5,sell_rate=5.2,min_rate=0,max_rate=0,valid_from='2026-01-01',valid_to='2099-01-01',last_updated='2026-01-01',updated_by='Test'))
        self.db.commit()
        v=self.car(price=100,currency='USD')
        self.call(f.sell_fleet_vehicle,v.id,f.FleetVehicleSell(buyer_name='Buyer',sale_price=600,sale_currency='LYD',sale_date='2026-01-03',sale_payment_method='cash'))
        self.db.get(ExchangeRate,'usd').sell_rate=0; self.db.commit()
        self.error('MISSING_EXCHANGE_RATE',self.call,f.update_fleet_vehicle,v.id,f.FleetVehicleUpdate(name='Changed',type=v.type,currency='USD'))
        self.assertEqual(v.name,'Car')
        self.assertEqual(v.sale_price,600)
