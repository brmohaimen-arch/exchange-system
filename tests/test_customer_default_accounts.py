"""Customer defaults and profile-link regressions, using an isolated SQLite DB.

Run: python -m unittest discover -s tests -v
Uses the project's regular dependencies; never opens sql_app.db.
"""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import AuditLog, BankAccount, Currency, Customer, JournalEntry, Movement
from app.routers import business as b
from app.tracking import verify_audit_chain


class CustomerDefaultAccounts(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        for code in ("LYD", "USD", "EUR"):
            self.db.add(Currency(code=code, name_ar=code, name_en=code, symbol=code, country="-", flag="-"))
        self.db.commit()
        self.actor = SimpleNamespace(name="Test", username="test")

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def payload(self, id="001", **kw):
        data = dict(id=id, name="Customer " + id, type="individual", phone="", id_number="", address="", debt_limit=0, balances={})
        data.update(kw)
        return b.CustomerCreate(**data)

    def accounts(self, id="001"):
        return self.db.scalars(select(BankAccount).where(BankAccount.customer_id == id)).all()

    def create(self, id="001", **kw):
        return b.create_customer(self.payload(id, **kw), self.actor, self.db)

    def save(self, id="001", **kw):
        customer = self.db.get(Customer, id)
        data = b.customer_to_dict(customer)
        payload = self.payload(id, name=data["name"], balances=dict(customer.balances),
                               bank_name=customer.bank_name, bank_account_number=customer.bank_account_number)
        return b.update_customer(id, payload.model_copy(update=kw), self.actor, self.db)

    def test_no_bank_details_creates_USD_LYD_and_one_LYD_bank(self):
        response = self.create()
        self.assertEqual(response.data["balances"], {"USD": 0.0, "LYD": 0.0})
        account, = self.accounts()
        self.assertEqual((account.currency, account.balance, account.account_number), ("LYD", 0, "001"))
        self.assertEqual(account.bank_name, b._OTHER_BANK_NAME)
        self.assertIsNone(self.db.get(Customer, "001").bank_account_number)
        self.assertEqual(b.bank_account_to_dict(account)["customerId"], "001")
        self.assertEqual(self.db.scalar(select(func.count()).select_from(Movement)), 0)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(JournalEntry)), 0)
        self.assertTrue(verify_audit_chain(self.db)["valid"])

    def test_existing_opening_balances_and_other_currencies_are_preserved(self):
        self.create(balances={"USD": 17, "EUR": 25, "LYD": -10})
        self.assertEqual(self.db.get(Customer, "001").balances, {"USD": 17, "EUR": 25, "LYD": -10})

    def test_explicit_bank_details_create_only_one_account(self):
        self.create(bank_name="Bank", bank_account_number="123456", bank_currency="LYD")
        account, = self.accounts()
        self.assertEqual((account.bank_name, account.account_number, account.currency), ("Bank", "123456", "LYD"))

    def test_explicit_existing_bank_currency_behavior_is_preserved(self):
        self.create(bank_name="Bank", bank_account_number="USD-123", bank_currency="USD")
        self.assertEqual(self.accounts()[0].currency, "USD")
        self.save(bank_currency="LYD")  # profile form's default is not a conversion
        self.assertEqual(len(self.accounts()), 1)
        self.assertEqual(self.accounts()[0].currency, "USD")

    def test_repeated_profile_saves_keep_id_owner_and_nonzero_bank_balance(self):
        self.create()
        account, = self.accounts(); original_id = account.id
        account.balance = 1234.5; self.db.commit()
        for _ in range(3): self.save(bank_name=None, bank_account_number=None)
        account, = self.accounts()
        self.assertEqual((account.id, account.balance), (original_id, 1234.5))
        self.assertEqual(self.db.scalar(select(func.count()).select_from(BankAccount)), 1)
        self.assertTrue(verify_audit_chain(self.db)["valid"])

    def test_clearing_real_bank_number_and_name_does_not_unlink_or_relabel(self):
        self.create(bank_name="Bank", bank_account_number="123")
        account, = self.accounts(); original_id = account.id
        account.balance = 50; self.db.commit()
        self.save(bank_name="", bank_account_number="")
        account, = self.accounts()
        self.assertEqual((account.id, account.bank_name, account.account_number, account.balance), (original_id, "Bank", "123", 50))

    def test_bank_name_change_works_and_keeps_audit_chain(self):
        self.create()
        original_id = self.accounts()[0].id
        self.save(bank_name="New Bank")
        account, = self.accounts()
        self.assertEqual((account.id, account.bank_name), (original_id, "New Bank"))
        self.assertTrue(verify_audit_chain(self.db)["valid"])

    def test_changing_number_does_not_turn_older_account_into_company_asset(self):
        self.create(bank_name="Bank", bank_account_number="old")
        old, = self.accounts(); old.balance = 250; self.db.commit()
        self.save(bank_account_number="new")
        self.assertEqual(len(self.accounts()), 2)
        self.assertEqual((old.customer_id, old.account_number, old.balance), ("001", "old", 250))
        self.save(bank_account_number="new")
        self.assertEqual(len(self.accounts()), 2)

    def test_multiple_accounts_blank_profile_does_not_pick_arbitrary_bank(self):
        self.create(bank_name="First", bank_account_number="first")
        self.save(bank_name="Second", bank_account_number="second")
        before = {a.id:(a.bank_name,a.account_number,a.balance) for a in self.accounts()}
        self.save(bank_account_number="", bank_name="Third")
        self.assertEqual(before, {a.id:(a.bank_name,a.account_number,a.balance) for a in self.accounts()})

    def test_generated_customer_code_never_adopts_company_account(self):
        bank_id, bank_name, branch_id, branch_name = b._ensure_other_bank(self.db)
        company = BankAccount(id="company", bank_id=bank_id, bank_name=bank_name, branch_id=branch_id,
                              branch_name=branch_name, account_name="Company", account_number="001", currency="LYD", balance=300)
        self.db.add(company); self.db.commit()
        self.create()
        self.assertEqual(len(self.accounts()), 1)
        self.assertIsNone(company.customer_id)
        self.assertEqual(company.balance, 300)

    def test_duplicate_customer_retry_does_not_create_second_bank_account(self):
        self.create()
        with self.assertRaises(b.APIError) as error: self.create()
        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(len(self.accounts()), 1)

    def test_bank_creation_failure_rolls_back_customer_and_audit(self):
        with patch.object(b, "_customer_bank_and_branch", side_effect=RuntimeError("simulated bank failure")):
            with self.assertRaises(RuntimeError): self.create()
        self.db.rollback()
        for model in (Customer, BankAccount, AuditLog):
            self.assertEqual(self.db.scalar(select(func.count()).select_from(model)), 0)

    def test_import_defaults_duplicate_rows_and_retry(self):
        rows=[b.CustomerImportRow(id="001", name="One"),
              b.CustomerImportRow(id="002", name="Two", opening_balance_currency="USD", opening_balance_amount=7),
              b.CustomerImportRow(id="001", name="Duplicate")]
        result=b.import_customers(b.CustomerImportRequest(rows=rows), self.actor, self.db)
        self.assertEqual(result.data, {"created":["001","002"], "skipped":["001"]})
        self.assertEqual(self.db.get(Customer,"002").balances, {"USD":7,"LYD":0})
        self.assertEqual(len(self.accounts("001")), 1)
        self.assertEqual(len(self.accounts("002")), 1)
        result=b.import_customers(b.CustomerImportRequest(rows=rows), self.actor, self.db)
        self.assertEqual(result.data["created"], [])
        self.assertEqual(self.db.scalar(select(func.count()).select_from(BankAccount)), 2)
        self.assertTrue(verify_audit_chain(self.db)["valid"])

    def test_import_failure_rolls_back_entire_batch(self):
        real=b._sync_customer_bank_account
        def fail_second(db,customer,*args,**kwargs):
            if customer.id=="002": raise RuntimeError("second customer fails")
            return real(db,customer,*args,**kwargs)
        with patch.object(b,"_sync_customer_bank_account",side_effect=fail_second):
            with self.assertRaises(RuntimeError):
                b.import_customers(b.CustomerImportRequest(rows=[b.CustomerImportRow(id="001",name="One"),b.CustomerImportRow(id="002",name="Two")]),self.actor,self.db)
        self.db.rollback()
        self.assertEqual(self.db.scalar(select(func.count()).select_from(Customer)),0)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(BankAccount)),0)

    def test_edit_legacy_customer_does_not_backfill_or_reset_wallet(self):
        payload=self.payload(balances={"LYD":987})
        old=Customer(**payload.model_dump(exclude={"bank_currency"})); self.db.add(old); self.db.commit()
        self.save(name="Edited", bank_name=None, bank_account_number=None)
        self.assertEqual(self.accounts(), [])
        self.assertEqual(old.balances, {"LYD":987})

    def test_bank_wallet_and_USD_operations_remain_separate_with_reversal(self):
        self.create()
        account, = self.accounts()
        b._run_bank_account_op("deposit", account.id, b.CustomerAccountOp(currency="LYD",amount=500), self.actor, self.db)
        customer = self.db.get(Customer,"001")
        self.assertEqual(customer.balances, {"USD":0,"LYD":0})
        b._run_customer_account_op("deposit","001",b.CustomerAccountOp(currency="LYD",amount=200,other_source="External"),self.actor,self.db)
        self.assertEqual(account.balance,500)
        entry=b._run_customer_account_op("deposit","001",b.CustomerAccountOp(currency="LYD",amount=100,bank_account_id=account.id),self.actor,self.db)
        self.assertEqual((account.balance,customer.balances["LYD"]),(400,300))
        b._reverse_customer_entry(self.db,entry.id,self.actor.name,"test")
        self.db.commit()
        self.assertEqual((account.balance,customer.balances["LYD"]),(500,200))
        b._run_customer_account_op("deposit","001",b.CustomerAccountOp(currency="USD",amount=10,other_source="External"),self.actor,self.db)
        self.assertEqual((account.balance,customer.balances),(500,{"USD":10,"LYD":200}))
        headers,rows=b._entity_daily_ledger_rows(self.db,"bank_account",account.id,"","","LYD")
        self.assertEqual(float(rows[-1][headers.index("الرصيد بالأرقام")].replace(",","")),500)
        self.assertFalse(any("تعديل رصيد يدوي" in str(row) for row in rows))

    def test_bank_withdrawal_edit_and_reverse_work_for_new_default(self):
        self.create()
        account, = self.accounts()
        b._run_bank_account_op("deposit",account.id,b.CustomerAccountOp(currency="LYD",amount=500),self.actor,self.db)
        _,ref=b._run_bank_account_op("withdraw",account.id,b.CustomerAccountOp(currency="LYD",amount=125),self.actor,self.db)
        self.assertEqual(account.balance,375)
        replacement=b._edit_movement_entries(self.db,ref,50,None,self.actor.name,"test")
        self.db.commit()
        self.assertEqual(account.balance,450)
        b._reverse_movement_entries(self.db,replacement[0].reference_id,self.actor.name,"test")
        self.db.commit()
        self.assertEqual(account.balance,500)
        headers,rows=b._entity_daily_ledger_rows(self.db,"bank_account",account.id,"","","LYD")
        self.assertEqual(float(rows[-1][headers.index("الرصيد بالأرقام")].replace(",","")),500)
        self.assertFalse(any("تعديل رصيد يدوي" in str(row) for row in rows))


if __name__ == "__main__": unittest.main()
