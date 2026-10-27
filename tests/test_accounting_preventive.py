"""Money and company-boundary regressions. Only fresh temporary databases."""
import hashlib
import asyncio
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI

from app.database import Base
from app.models import (BankAccount, Branch, Currency, Customer, FleetAccount,
                        FleetDamageRecord, FleetTransaction, FleetVehicle,
                        JournalEntry, Movement, Role, Shift, Vault, ApprovalRequest)
from app.routers import business as b, fleet as f, operations as o
from scripts_check_calculations import read_only_connection
from scripts_check_system_accounting import scan


class PreventiveAccounting(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite:///:memory:',connect_args={'check_same_thread':False},poolclass=StaticPool)
        @event.listens_for(self.engine,'connect')
        def foreign_keys(con, _):
            con.execute('PRAGMA foreign_keys=ON')
        Base.metadata.create_all(self.engine)
        self.db=sessionmaker(bind=self.engine,autoflush=False)()
        self.actor=SimpleNamespace(name='Test',username='test',role='manager',branch='branch')
        self.db.add(Role(name='manager',permissions=['اعتماد الإقفالات','إدارة شركة بيان']))
        self.db.add(Branch(id='branch',name='Branch',city='-',address='-',phone='-',manager='Test'))
        for c in ('LYD','USD'):
            self.db.add(Currency(code=c,name_ar=c,name_en=c,symbol=c,country='-',flag='-'))
        self.db.commit()
        self.db.add(Customer(id='c',name='Customer',type='individual',phone='',id_number='',address='',balances={'LYD':0,'USD':0},debt_limit=0))
        self.db.add(Vault(id='v',name='Vault',type='main',branch='branch',manager='Test',balances={'LYD':10000,'USD':1000},opening_balances={}))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def call(self, fn, *args, company='bayan', **kw):
        return fn(*args, actor=self.actor, db=self.db, company=company, **kw)

    def car(self, company='bayan', price=0, **kw):
        data=dict(name='Car',type='car',currency='LYD',purchase_price=price,purchase_date='2026-01-01',purchase_payment_method='cash' if price>0 else None)
        data.update(kw)
        result=self.call(f.create_fleet_vehicle,f.FleetVehicleCreate(**data),company=company)
        return self.db.get(FleetVehicle,result.data['id'])

    def account(self, id='a', company='bayan', active=True):
        a=FleetAccount(id=id,company=company,name=id,currency='LYD',account_type='company',balance=1000,is_active=active,created_by='Test',timestamp='2026-01-01')
        self.db.add(a); self.db.commit()
        return a

    def income(self, car, **kw):
        data=dict(type='income',category='Rental',amount=100,currency='LYD',date='2026-01-02')
        data.update(kw)
        r=self.call(f.create_fleet_transaction,car.id,f.FleetTransactionCreate(**data),company=car.company)
        return self.db.get(FleetTransaction,r.data['id'])

    def bank(self, id='bank', currency='LYD'):
        bank_id,name,branch_id,branch_name=b._ensure_other_bank(self.db)
        a=BankAccount(id=id,bank_id=bank_id,bank_name=name,branch_id=branch_id,branch_name=branch_name,account_name=id,account_number=id,currency=currency,balance=1000,is_active=True)
        self.db.add(a); self.db.commit()
        return a

    def error(self, code, fn, *args, **kw):
        with self.assertRaises(b.APIError) as raised:
            fn(*args,**kw)
        self.assertEqual(raised.exception.detail['code'],code)
        self.db.rollback()

    def test_cross_company_ids_cannot_read_change_or_delete(self):
        v=self.car('imtiaz')
        t=self.income(v)
        a=self.account(company='imtiaz')
        d=self.call(f.create_fleet_damage_record,v.id,f.FleetDamageCreate(date='2026-01-01',description='Damage',cost=10,currency='LYD'),company='imtiaz').data['id']
        cases=[
            (f.list_fleet_transactions,(v.id,)),
            (f.update_fleet_vehicle,(v.id,f.FleetVehicleUpdate(name='Changed',type='car',currency='LYD'))),
            (f.sell_fleet_vehicle,(v.id,f.FleetVehicleSell(buyer_name='Buyer',sale_price=150,sale_date='2026-01-03',sale_payment_method='cash'))),
            (f.reverse_fleet_vehicle_sale,(v.id,f.ReverseEntryRequest(reason='Test'))),
            (f.delete_fleet_vehicle,(v.id,)),
            (f.create_fleet_transaction,(v.id,f.FleetTransactionCreate(type='income',category='Rental',amount=10,currency='LYD',date='2026-01-02'))),
            (f.edit_fleet_transaction,(t.id,f.FleetTransactionEdit(amount=10,category='Rental',date='2026-01-02',reason='Test'))),
            (f.reverse_fleet_transaction,(t.id,f.ReverseEntryRequest(reason='Test'))),
            (f.delete_fleet_transaction,(t.id,)),
            (f.update_fleet_account,(a.id,f.FleetAccountCreate(name='Changed',currency='LYD',account_type='company'))),
            (f.delete_fleet_account,(a.id,)),
            (f.toggle_fleet_account_active,(a.id,)),
            (f.list_fleet_damage_records,(v.id,)),
            (f.create_fleet_damage_record,(v.id,f.FleetDamageCreate(date='2026-01-02',description='X',currency='LYD'))),
            (f.update_fleet_damage_status,(d,f.FleetDamageStatusUpdate(status='Fixed'))),
            (f.edit_fleet_damage_record,(d,f.FleetDamageEdit(date='2026-01-02',description='X',cost=20,reason='Test'))),
            (f.delete_fleet_damage_record,(d,)),
        ]
        for fn,args in cases:
            with self.subTest(endpoint=fn.__name__):
                self.error('NOT_FOUND',self.call,fn,*args)
        self.assertEqual(v.name,'Car')
        self.assertEqual(a.balance,1000)
        self.assertIsNotNone(self.db.get(FleetDamageRecord,d))

    def test_company_posting_and_normal_cash_paths(self):
        for company in ('bayan','imtiaz','itqan'):
            v=self.car(company,price=100)
            self.income(v)
            wallet=f._get_cash_wallet(self.db,'LYD',company)
            self.assertEqual(wallet.balance,0)
            self.assertTrue(self.call(f.list_fleet_transactions,v.id,company=company).success)

    def test_foreign_and_disabled_posting_accounts_are_rejected(self):
        a=self.account(company='imtiaz')
        self.error('NOT_FOUND',self.car,price=100,purchase_payment_method='bank',purchase_account_id=a.id)
        a.company='bayan'; a.is_active=False; self.db.commit()
        self.error('ACCOUNT_INACTIVE',self.car,price=100,purchase_payment_method='bank',purchase_account_id=a.id)
        self.assertEqual(a.balance,1000)

    def test_edit_to_foreign_account_rolls_back_old_leg(self):
        a=self.account(company='imtiaz'); v=self.car(); t=self.income(v)
        wallet=f._get_cash_wallet(self.db,'LYD')
        self.error('NOT_FOUND',self.call,f.edit_fleet_transaction,t.id,f.FleetTransactionEdit(amount=200,category='Rental',date=t.date,reason='Test',account_id=a.id))
        self.assertEqual(wallet.balance,100)
        self.assertEqual(t.amount,100)
        self.assertEqual(a.balance,1000)

    def test_inactive_accounts_can_still_undo_own_existing_entries(self):
        a=self.account(); v=self.car(); t=self.income(v,account_id=a.id)
        a.is_active=False; self.db.commit()
        self.call(f.reverse_fleet_transaction,t.id,f.ReverseEntryRequest(reason='Test'))
        self.assertEqual(a.balance,1000)

    def test_generated_purchase_and_sale_cannot_be_deleted(self):
        v=self.car(price=100)
        p=self.db.scalar(select(FleetTransaction).where(FleetTransaction.vehicle_id==v.id))
        self.error('NOT_EDITABLE_HERE',self.call,f.delete_fleet_transaction,p.id)
        self.call(f.sell_fleet_vehicle,v.id,f.FleetVehicleSell(buyer_name='Buyer',sale_price=150,sale_date='2026-01-03',sale_payment_method='cash'))
        s=self.db.scalar(select(FleetTransaction).where(FleetTransaction.vehicle_id==v.id,FleetTransaction.category==SALE))
        self.error('NOT_EDITABLE_HERE',self.call,f.delete_fleet_transaction,s.id)
        self.assertEqual(f._get_cash_wallet(self.db,'LYD').balance,50)
        self.assertEqual(v.sale_price,150)
        self.call(f.reverse_fleet_vehicle_sale,v.id,f.ReverseEntryRequest(reason='Test'))
        self.assertEqual(f._get_cash_wallet(self.db,'LYD').balance,-100)
        self.assertIsNone(v.sale_price)

    def test_manual_categories_cannot_impersonate_generated_entries(self):
        v=self.car(); t=self.income(v)
        for category in (PURCHASE,SALE):
            self.error('RESERVED_CATEGORY',self.income,v,category=' '+category+' ')
            self.error('RESERVED_CATEGORY',self.call,f.edit_fleet_transaction,t.id,f.FleetTransactionEdit(amount=200,category=category,date=t.date,reason='Test'))
        self.assertEqual(f._get_cash_wallet(self.db,'LYD').balance,100)

    def test_empty_edited_account_moves_income_to_cash(self):
        a=self.account(); v=self.car(); t=self.income(v,account_id=a.id)
        self.call(f.edit_fleet_transaction,t.id,f.FleetTransactionEdit(amount=100,category='Rental',date=t.date,reason='Test',account_id=''))
        self.assertEqual(a.balance,1000)
        self.assertEqual(f._get_cash_wallet(self.db,'LYD').balance,100)
        self.assertIsNotNone(t.account_id)

    def test_negative_and_nonfinite_costs_are_rejected(self):
        v=self.car()
        for n in (-1,float('nan'),float('inf')):
            self.error('INVALID_AMOUNT',self.car,price=n)
            self.error('INVALID_AMOUNT',self.call,f.create_fleet_damage_record,v.id,f.FleetDamageCreate(date='2026-01-01',description='X',currency='LYD',cost=n))

    def test_partial_currency_change_blocked_and_date_edit_synchronized(self):
        v=self.car(price=100)
        self.error('CURRENCY_LOCKED',self.call,f.update_fleet_vehicle,v.id,f.FleetVehicleUpdate(name=v.name,type=v.type,currency='USD'))
        self.assertEqual(v.currency,'LYD')
        self.call(f.update_fleet_vehicle,v.id,f.FleetVehicleUpdate(name=v.name,type=v.type,currency='LYD',purchase_price=100,purchase_payment_method='cash',purchase_date='2026-02-01'))
        p=self.db.scalar(select(FleetTransaction).where(FleetTransaction.vehicle_id==v.id))
        self.assertEqual((v.purchase_date,p.date),('2026-02-01','2026-02-01'))
        self.assertEqual(f._get_cash_wallet(self.db,'LYD').balance,-100)

    def test_currency_mismatch_rejects_both_bank_operation_paths(self):
        a=self.bank()
        for kind in ('deposit','withdraw'):
            self.error('CURRENCY_MISMATCH',b._run_customer_account_op,kind,'c',b.CustomerAccountOp(currency='USD',amount=100,bank_account_id=a.id),self.actor,self.db)
            self.error('CURRENCY_MISMATCH',b._run_bank_account_op,kind,a.id,b.CustomerAccountOp(currency='USD',amount=100),self.actor,self.db)
        self.assertEqual(a.balance,1000)
        self.assertEqual(self.db.get(Customer,'c').balances,{'LYD':0,'USD':0})

    def test_generic_reversal_refuses_customer_deposit_and_dedicated_reversal_works(self):
        e=b._run_customer_account_op('deposit','c',b.CustomerAccountOp(currency='LYD',amount=100,vault_id='v'),self.actor,self.db)
        self.db.commit()
        self.error('USE_DEDICATED_REVERSAL',b.apply_transaction_reversal,self.db,e.id,self.actor.name,'Test')
        self.assertEqual(self.db.get(Customer,'c').balances['LYD'],100)
        self.assertEqual(self.db.get(Vault,'v').balances['LYD'],10100)
        b._reverse_customer_entry(self.db,e.id,self.actor.name,'Test'); self.db.commit()
        self.assertEqual(self.db.get(Customer,'c').balances['LYD'],0)
        self.assertEqual(self.db.get(Vault,'v').balances['LYD'],10000)

    def test_explicit_bank_number_cannot_adopt_company_balance(self):
        a=self.bank()
        self.error('BANK_ACCOUNT_IN_USE',b.create_customer,b.CustomerCreate(id='new',name='New',type='individual',phone='',id_number='',address='',debt_limit=0,balances={},bank_account_number=a.account_number),self.actor,self.db)
        self.assertIsNone(a.customer_id)
        self.assertEqual(a.balance,1000)
        self.assertIsNone(self.db.get(Customer,'new'))

    def test_interest_is_one_time_and_legacy_credits_also_block(self):
        a=self.bank()
        d=b.create_bank_deposit(a.id,b.BankDepositCreate(amount=1000,interest_rate=10),self.actor,self.db).data['id']
        b.calculate_bank_deposit_interest(d,self.actor,self.db)
        b.credit_bank_deposit_interest(d,self.actor,self.db)
        self.error('INTEREST_ALREADY_CREDITED',b.calculate_bank_deposit_interest,d,self.actor,self.db)
        self.error('INTEREST_ALREADY_CREDITED',b.credit_bank_deposit_interest,d,self.actor,self.db)
        self.assertEqual(a.balance,1100)
        second=b.create_bank_deposit(a.id,b.BankDepositCreate(amount=1000,interest_rate=10),self.actor,self.db).data['id']
        self.db.add(JournalEntry(id='legacy',date='2026-01-01',tx_type='Interest',reference='int_'+second+'_123_ab',description='',user='Test',status='approved',lines=[]))
        self.db.commit()
        self.error('INTEREST_ALREADY_CREDITED',b.calculate_bank_deposit_interest,second,self.actor,self.db)

    def test_unique_interest_claim_blocks_a_stale_precheck(self):
        a=self.bank()
        d=b.create_bank_deposit(a.id,b.BankDepositCreate(amount=1000,interest_rate=10),self.actor,self.db).data['id']
        b.calculate_bank_deposit_interest(d,self.actor,self.db)
        b.credit_bank_deposit_interest(d,self.actor,self.db)
        from app.models import BankDeposit
        self.db.get(BankDeposit,d).accrued_interest=100
        self.db.commit()
        with patch.object(b,'_ensure_interest_uncredited',return_value='int_once_'+d):
            self.error('INTEREST_ALREADY_CREDITED',b.credit_bank_deposit_interest,d,self.actor,self.db)
        self.assertEqual(a.balance,1100)

    def test_shift_approval_preserves_later_receipts_and_new_currencies(self):
        o.open_shift(o.ShiftOpen(id='s',cashier='Test',branch='branch',vault_id='v',vault_name='Vault',opening_balances={'LYD':10000}),self.actor,self.db)
        v=self.db.get(Vault,'v'); v.balances={'LYD':10500,'USD':1200}; self.db.commit()
        o.execute_approval_action('apr_shiftopen_s','approve',self.actor,self.db)
        shift=self.db.get(Shift,'s')
        self.assertEqual(v.balances,{'LYD':10500,'USD':1200})
        self.assertEqual(shift.opening_balances,v.balances)
        self.assertEqual(shift.expected_balances,v.balances)
        self.error('ALREADY_PROCESSED',o.execute_approval_action,'apr_shiftopen_s','approve',self.actor,self.db)
        self.error('ALREADY_PROCESSED',o.execute_approval_action,'apr_shiftopen_s','reject',self.actor,self.db)
        self.assertEqual(self.db.get(ApprovalRequest,'apr_shiftopen_s').status,'approved')

    def test_shift_count_correction_applies_only_its_delta(self):
        o.open_shift(o.ShiftOpen(id='s',cashier='Test',branch='branch',vault_id='v',vault_name='Vault',opening_balances={'LYD':9900}),self.actor,self.db)
        v=self.db.get(Vault,'v'); v.balances={'LYD':10500,'USD':1200}; self.db.commit()
        o.execute_approval_action('apr_shiftopen_s','approve',self.actor,self.db)
        self.assertEqual(v.balances,{'LYD':10400,'USD':1200})
        self.assertEqual(self.db.get(Shift,'s').expected_balances,v.balances)

    def test_legacy_pending_shift_without_snapshot_keeps_live_cash(self):
        self.db.add(Shift(id='s',cashier='Test',branch='branch',vault_id='v',vault_name='Vault',opening_balances={'LYD':9900},expected_balances={'LYD':9900},actual_balances={},differences={},status='pending_open',start_time=''))
        self.db.add(ApprovalRequest(id='legacy',type='shift_open',title='Open',amount=0,requested_by='Test',timestamp='2026-01-01',status='pending',reference_id='s'))
        self.db.commit()
        o.execute_approval_action('legacy','approve',self.actor,self.db)
        self.assertEqual(self.db.get(Vault,'v').balances['LYD'],10000)

    def test_shift_delta_cannot_overdraw_current_vault(self):
        o.open_shift(o.ShiftOpen(id='s',cashier='Test',branch='branch',vault_id='v',vault_name='Vault',opening_balances={'LYD':9000}),self.actor,self.db)
        v=self.db.get(Vault,'v'); v.balances={'LYD':500,'USD':1000}; self.db.commit()
        self.error('INVALID_OPENING_BALANCE',o.execute_approval_action,'apr_shiftopen_s','approve',self.actor,self.db)
        self.assertEqual(v.balances['LYD'],500)
        self.assertEqual(self.db.get(Shift,'s').status,'pending_open')

    def test_http_company_dependency_is_bound_to_route_not_query(self):
        from app.auth_deps import get_current_user
        from app.database import get_db
        v=self.car('imtiaz')
        app=FastAPI()
        app.include_router(f.router,prefix='/api')
        app.include_router(f.router,prefix='/api/imtiaz')
        app.include_router(f.router,prefix='/api/itqan')
        app.include_router(f.router,prefix='/api/co/extra')
        from app.models import FleetCompanyDef
        self.db.add(FleetCompanyDef(id='extra',name='Extra',permission='Manage Extra',created_by='Test',timestamp='2026-01-01'))
        self.db.commit()
        async def db_override():
            return self.db
        async def actor_override():
            return self.actor
        app.dependency_overrides[get_db]=db_override
        app.dependency_overrides[get_current_user]=actor_override

        async def request(path, method='GET', data=None, query=b''):
            events=[]
            delivered=False
            async def receive():
                nonlocal delivered
                if delivered:
                    await asyncio.Event().wait()
                delivered=True
                return {'type':'http.request','body':json.dumps(data).encode() if data is not None else b'','more_body':False}
            async def send(message):
                events.append(message)
            scope={'type':'http','asgi':{'version':'3.0','spec_version':'2.4'},'http_version':'1.1','method':method,'scheme':'http','path':path,'raw_path':path.encode(),'root_path':'','query_string':query,'headers':[(b'content-type',b'application/json')],'client':('test',1),'server':('test',80)}
            await asyncio.wait_for(app(scope,receive,send),timeout=10)
            return next(e['status'] for e in events if e['type']=='http.response.start'), b''.join(e.get('body',b'') for e in events if e['type']=='http.response.body')

        status, body=asyncio.run(request('/api/fleet/vehicles/'+v.id+'/transactions',query=b'company=imtiaz'))
        self.assertEqual(status,404)  # cannot override the company with a query string
        status, body=asyncio.run(request('/api/imtiaz/fleet/vehicles/'+v.id+'/transactions'))
        self.assertEqual(status,403)  # actual permission dependency is still enforced
        for prefix in ('/api/itqan','/api/co/extra'):
            status, body=asyncio.run(request(prefix+'/fleet/vehicles'))
            self.assertEqual(status,403)
        role=self.db.get(Role,'manager')
        role.permissions=role.permissions+['Manage Extra']; self.db.commit()
        extra=self.car('extra')
        status, body=asyncio.run(request('/api/co/extra/fleet/vehicles/'+extra.id+'/transactions'))
        self.assertEqual(status,200,body)
        status, body=asyncio.run(request('/api/co/extra/fleet/vehicles/'+v.id+'/transactions'))
        self.assertEqual(status,404)
        status, body=asyncio.run(request('/api/fleet/vehicles','POST',{'name':'HTTP car','type':'car','currency':'LYD','purchase_price':100,'purchase_payment_method':'cash'}))
        self.assertEqual(status,200,body)
        new_id=json.loads(body)['data']['id']
        status, body=asyncio.run(request('/api/fleet/vehicles/'+new_id+'/transactions'))
        self.assertEqual(status,200,body)
        for format in ('xlsx','pdf'):
            status, body=asyncio.run(request('/api/fleet/statement/export',query=('format='+format).encode()))
            self.assertEqual(status,200,body[:150])
            self.assertTrue(body.startswith(b'PK' if format=='xlsx' else b'%PDF'))

    def test_impact_checker_read_only_and_finds_synthetic_corruption(self):
        v=self.car(price=100)
        a=self.account(company='imtiaz')
        t=self.db.scalar(select(FleetTransaction).where(FleetTransaction.vehicle_id==v.id)); t.account_id=a.id; t.currency='USD'; self.db.commit()
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'db #1.sqlite'
            con=sqlite3.connect(str(path))
            with self.engine.connect() as source:
                source.connection.driver_connection.backup(con)
            con.close()
            before=hashlib.sha256(path.read_bytes()).hexdigest()
            con=read_only_connection(path)
            checks={c['id']:c for c in scan(con)}
            self.assertEqual(checks['F1/F2.company_links']['count'],1)
            self.assertGreater(checks['F3/F4/F7/F8/F10.generated']['count'],0)
            self.assertTrue(all(c['coverage']=='covered' for c in checks.values()))
            with self.assertRaises(sqlite3.DatabaseError):
                con.execute('UPDATE fleet_accounts SET balance=0')
            con.close()
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),before)

    def test_impact_checker_marks_missing_schema_unavailable(self):
        con=sqlite3.connect(':memory:')
        try:
            self.assertTrue(all(c['coverage']=='unavailable' for c in scan(con)))
        finally:
            con.close()


PURCHASE='شراء المركبة/المعدة'
SALE='بيع المركبة/المعدة'
