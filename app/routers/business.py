import io
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_
from ..database import get_db
from ..models import (
    Bank, BankBranch, BankAccount, BankDeposit, Customer, Debt, DebtPaymentRecord, Advance, AdvancePaymentRecord, Transaction, Movement, JournalEntry,
    Vault, AuditAction, Shift, ExchangeRate, User, ComplianceFlag, SystemSetting, Role, ApprovalRequest, CustomerDocument, CommissionRule,
    CustomerAccountEntry, Transfer
)
from ..tracking import create_audit_log
from ..core.responses import success_response, error_response
from ..core.errors import APIError
from ..core.export_labels import TX_TYPE_LABELS_AR, PAYMENT_METHOD_LABELS_AR, TX_STATUS_LABELS_AR
from ..auth_deps import get_current_user, require_permission
from ..id_gen import new_id
from ..export_utils import build_excel, build_pdf, build_receipt_pdf, build_statement_pdf, build_sectioned_excel, build_sectioned_pdf, ArabicFontUnavailable
from ..file_storage import save_upload, resolve_path
from ..whatsapp_gateway import send_manager_alert, send_whatsapp_document, get_setting as get_whatsapp_setting
from ..telegram_gateway import send_manager_alert as send_telegram_alert
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

router = APIRouter(tags=["Business & Transactions"])

# Request bodies
class BankCreate(BaseModel):
    id: str
    name: str
    code: str
    country: str
    city: str
    phone: str
    is_active: bool = True
    notes: str | None = None

class BankBranchCreate(BaseModel):
    id: str
    bank_id: str
    bank_name: str
    name: str
    city: str
    address: str
    phone: str
    manager: str
    is_active: bool = True

class BankAccountCreate(BaseModel):
    id: str
    bank_id: str
    bank_name: str
    branch_id: str
    branch_name: str
    account_name: str
    account_number: str
    account_type: str = "individual"  # individual, corporate
    currency: str
    balance: float
    is_active: bool = True
    notes: str | None = None
    customer_id: str | None = None  # set to make this a customer-owned account instead of a company one

class CustomerCreate(BaseModel):
    id: str
    name: str
    type: str
    phone: str
    id_number: str
    address: str
    debt_limit: float
    balances: Dict[str, float]
    profit_pct: float = 0.0
    notes: str | None = None
    bank_name: str | None = None
    bank_account_number: str | None = None
    bank_currency: str | None = None  # only used to fund/link the auto-created customer bank account below — not stored on Customer itself
    passport_number: str | None = None
    is_active: bool = True

class DebtCreate(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    currency: str
    amount: float
    start_date: str
    due_date: str
    payment_period: str = "monthly"  # monthly, daily, none
    payment_amount: float = 0.0
    notes: str | None = None
    transaction_id: str | None = None

class DebtPayment(BaseModel):
    amount: float
    notes: str | None = None

class AdvanceCreate(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    currency: str
    amount: float
    vault_id: str | None = None
    bank_account_id: str | None = None
    notes: str | None = None

class AdvancePaymentOp(BaseModel):
    amount: float
    vault_id: str | None = None
    bank_account_id: str | None = None
    notes: str | None = None

class POSOperation(BaseModel):
    type: str  # buy, sell, exchange
    vaultId: str
    customerId: str
    fromCurrency: str
    toCurrency: str
    amount: float
    rate: float
    commission: float
    paymentMethod: str  # cash, customer_account, bank_account, debt
    bankAccountId: str | None = None
    notes: str | None = None
    id: str | None = None
    user: str | None = None

# Helpers for serialization
def bank_to_dict(b: Bank):
    return {
        "id": b.id,
        "name": b.name,
        "code": b.code,
        "country": b.country,
        "city": b.city,
        "phone": b.phone,
        "isActive": b.is_active,
        "notes": b.notes
    }

def bank_branch_to_dict(bb: BankBranch):
    return {
        "id": bb.id,
        "bankId": bb.bank_id,
        "bankName": bb.bank_name,
        "name": bb.name,
        "city": bb.city,
        "address": bb.address,
        "phone": bb.phone,
        "manager": bb.manager,
        "isActive": bb.is_active
    }

def bank_account_to_dict(ba: BankAccount):
    return {
        "id": ba.id,
        "bankId": ba.bank_id,
        "bankName": ba.bank_name,
        "branchId": ba.branch_id,
        "branchName": ba.branch_name,
        "accountName": ba.account_name,
        "accountNumber": ba.account_number,
        "accountType": ba.account_type,
        "currency": ba.currency,
        "balance": ba.balance,
        "isActive": ba.is_active,
        "notes": ba.notes,
        "lastMovement": ba.last_movement,
        "customerId": ba.customer_id,
    }

def bank_deposit_to_dict(d: BankDeposit):
    return {
        "id": d.id,
        "bankAccountId": d.bank_account_id,
        "amount": d.amount,
        "currency": d.currency,
        "interestRate": d.interest_rate,
        "depositDate": d.deposit_date,
        "accruedInterest": d.accrued_interest,
        "lastCalculated": d.last_calculated,
        "status": d.status,
        "notes": d.notes
    }

def customer_to_dict(c: Customer):
    return {
        "id": c.id,
        "name": c.name,
        "type": c.type,
        "phone": c.phone,
        "idNumber": c.id_number,
        "address": c.address,
        "debtLimit": c.debt_limit,
        "balances": c.balances,
        "isActive": c.is_active,
        "profitPct": c.profit_pct,
        "notes": c.notes,
        "bankName": c.bank_name,
        "bankAccountNumber": c.bank_account_number,
        "passportNumber": c.passport_number,
    }

def debt_to_dict(d: Debt):
    return {
        "id": d.id,
        "customerId": d.customer_id,
        "customerName": d.customer_name,
        "currency": d.currency,
        "amount": d.amount,
        "paidAmount": d.paid_amount,
        "remainingAmount": d.remaining_amount,
        "startDate": d.start_date,
        "dueDate": d.due_date,
        "status": d.status,
        "paymentPeriod": d.payment_period,
        "paymentAmount": d.payment_amount,
        "notes": d.notes,
        "transactionId": d.transaction_id,
        "createdBy": d.created_by,
    }

def transaction_to_dict(t: Transaction):
    return {
        "id": t.id,
        "type": t.type,
        "vaultId": t.vault_id,
        "vaultName": t.vault_name,
        "shiftId": t.shift_id,
        "customerId": t.customer_id,
        "customerName": t.customer_name,
        "fromCurrency": t.from_currency,
        "toCurrency": t.to_currency,
        "amount": t.amount,
        "rate": t.rate,
        "commission": t.commission,
        "totalAmount": t.total_amount,
        "paymentMethod": t.payment_method,
        "status": t.status,
        "notes": t.notes,
        "user": t.user,
        "branch": t.branch,
        "timestamp": t.timestamp,
        "expectedProfit": t.expected_profit
    }

def movement_to_dict(m: Movement):
    return {
        "id": m.id,
        "timestamp": m.timestamp,
        "entityType": m.entity_type,
        "entityId": m.entity_id,
        "entityName": m.entity_name,
        "currency": m.currency,
        "type": m.type,
        "amountIn": m.amount_in,
        "amountOut": m.amount_out,
        "balanceBefore": m.balance_before,
        "balanceAfter": m.balance_after,
        "referenceId": m.reference_id,
        "user": m.user
    }

# ----------------- BANKS -----------------
@router.get("/banks")
def list_banks(db: Session = Depends(get_db)):
    res = db.scalars(select(Bank)).all()
    return success_response(data=[bank_to_dict(b) for b in res])

@router.post("/banks")
def create_bank(data: BankCreate, db: Session = Depends(get_db)):
    bank = Bank(**data.model_dump())
    db.add(bank)
    db.commit()
    return success_response(data=bank_to_dict(bank))

@router.put("/banks/{bank_id}")
def update_bank(bank_id: str, data: BankCreate, db: Session = Depends(get_db)):
    bank = db.get(Bank, bank_id)
    if not bank:
        raise APIError(code="NOT_FOUND", message_ar="البنك غير موجود", message_en="Bank not found", status_code=404)
    for k, v in data.model_dump().items():
        setattr(bank, k, v)
    db.commit()
    return success_response(data=bank_to_dict(bank))

@router.delete("/banks/{bank_id}")
def delete_bank(bank_id: str, db: Session = Depends(get_db)):
    bank = db.get(Bank, bank_id)
    if not bank:
        raise APIError(code="NOT_FOUND", message_ar="البنك غير موجود", message_en="Bank not found", status_code=404)
    db.delete(bank)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="Bank", entity_id=bank_id, description=f"تم حذف البنك: {bank.name}")
    db.commit()
    return success_response(data={"deleted": True})

@router.get("/bank_branches")
def list_bank_branches(db: Session = Depends(get_db)):
    res = db.scalars(select(BankBranch)).all()
    return success_response(data=[bank_branch_to_dict(bb) for bb in res])

@router.post("/bank_branches")
def create_bank_branch(data: BankBranchCreate, db: Session = Depends(get_db)):
    branch = BankBranch(**data.model_dump())
    db.add(branch)
    db.commit()
    return success_response(data=bank_branch_to_dict(branch))

@router.put("/bank_branches/{branch_id}")
def update_bank_branch(branch_id: str, data: BankBranchCreate, db: Session = Depends(get_db)):
    branch = db.get(BankBranch, branch_id)
    if not branch:
        raise APIError(code="NOT_FOUND", message_ar="فرع البنك غير موجود", message_en="Bank branch not found", status_code=404)
    for k, v in data.model_dump().items():
        setattr(branch, k, v)
    db.commit()
    return success_response(data=bank_branch_to_dict(branch))

@router.delete("/bank_branches/{branch_id}")
def delete_bank_branch(branch_id: str, db: Session = Depends(get_db)):
    branch = db.get(BankBranch, branch_id)
    if not branch:
        raise APIError(code="NOT_FOUND", message_ar="فرع البنك غير موجود", message_en="Bank branch not found", status_code=404)
    db.delete(branch)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="BankBranch", entity_id=branch_id, description=f"تم حذف فرع البنك: {branch.name}")
    db.commit()
    return success_response(data={"deleted": True})

@router.get("/bank_accounts")
def list_bank_accounts(db: Session = Depends(get_db)):
    res = db.scalars(select(BankAccount)).all()
    return success_response(data=[bank_account_to_dict(ba) for ba in res])

def _validate_bank_account_customer(db: Session, customer_id: str | None):
    if customer_id and not db.get(Customer, customer_id):
        raise APIError(code="CUSTOMER_NOT_FOUND", message_ar="العميل المحدد غير موجود", message_en="Customer not found", status_code=400)

@router.post("/bank_accounts")
def create_bank_account(data: BankAccountCreate, db: Session = Depends(get_db)):
    _validate_bank_account_customer(db, data.customer_id)
    ac = BankAccount(**data.model_dump())
    db.add(ac)
    db.commit()
    return success_response(data=bank_account_to_dict(ac))

@router.put("/bank_accounts/{account_id}")
def update_bank_account(account_id: str, data: BankAccountCreate, db: Session = Depends(get_db)):
    account = db.get(BankAccount, account_id)
    if not account:
        raise APIError(code="NOT_FOUND", message_ar="الحساب البنكي غير موجود", message_en="Bank account not found", status_code=404)
    _validate_bank_account_customer(db, data.customer_id)
    for k, v in data.model_dump().items():
        setattr(account, k, v)
    db.commit()
    return success_response(data=bank_account_to_dict(account))

class BankDepositCreate(BaseModel):
    amount: float
    interest_rate: float = 0.0
    deposit_date: str | None = None
    notes: str | None = None

@router.get("/bank_accounts/{account_id}/deposits")
def list_bank_deposits(account_id: str, db: Session = Depends(get_db)):
    res = db.scalars(select(BankDeposit).where(BankDeposit.bank_account_id == account_id).order_by(BankDeposit.deposit_date.desc())).all()
    return success_response(data=[bank_deposit_to_dict(d) for d in res])

@router.post("/bank_accounts/{account_id}/deposits")
def create_bank_deposit(account_id: str, data: BankDepositCreate, actor: User = Depends(require_permission("إدارة البنوك")), db: Session = Depends(get_db)):
    """Records a fixed/term deposit placed into a foreign-currency bank account, with
    the interest rate that specific deposit carries — banks quote a rate per deposit,
    not one blanket annual rate for the whole account. Purely a record for interest
    tracking; it does not move cash (use the deposit endpoint above for that)."""
    account = db.get(BankAccount, account_id)
    if not account:
        raise APIError(code="NOT_FOUND", message_ar="الحساب البنكي غير موجود", message_en="Bank account not found", status_code=404)
    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون المبلغ أكبر من صفر", message_en="Amount must be positive", status_code=400)
    if data.interest_rate < 0:
        raise APIError(code="INVALID_RATE", message_ar="لا يمكن أن تكون نسبة الفائدة سالبة", message_en="Interest rate cannot be negative", status_code=400)

    deposit = BankDeposit(
        id=new_id(f"bdep_{account_id}"), bank_account_id=account.id, amount=data.amount, currency=account.currency,
        interest_rate=data.interest_rate, deposit_date=data.deposit_date or datetime.utcnow().strftime("%Y-%m-%d"),
        accrued_interest=0.0, last_calculated=None, status="active", notes=data.notes
    )
    db.add(deposit)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="BankDeposit", entity_id=deposit.id, description=f"تم تسجيل وديعة بقيمة {data.amount} {account.currency} بنسبة فائدة {data.interest_rate}% على حساب {account.account_name}")
    db.commit()
    return success_response(data=bank_deposit_to_dict(deposit), message_ar="تم تسجيل الوديعة بنجاح")

@router.post("/bank_deposits/{deposit_id}/calculate_interest")
def calculate_bank_deposit_interest(deposit_id: str, actor: User = Depends(require_permission("إدارة البنوك")), db: Session = Depends(get_db)):
    """Computes this deposit's interest as a flat percentage of its own amount —
    each deposit carries its own contractual rate the bank quoted at the time it
    was made (e.g. a fixed-term deposit), not a daily/annual accrual that builds
    up over time. So it's a straight one-time amount, calculable instantly and
    unaffected by how much time has passed. Never touches the account's actual
    cash balance — crediting into the balance is a separate step."""
    deposit = db.get(BankDeposit, deposit_id)
    if not deposit:
        raise APIError(code="NOT_FOUND", message_ar="الوديعة غير موجودة", message_en="Deposit not found", status_code=404)
    if deposit.interest_rate <= 0:
        raise APIError(code="INTEREST_NOT_CONFIGURED", message_ar="لم يتم تحديد نسبة فائدة لهذه الوديعة", message_en="This deposit has no interest rate set", status_code=400)

    interest = deposit.amount * (deposit.interest_rate / 100.0)
    deposit.accrued_interest = interest
    deposit.last_calculated = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    account = db.get(BankAccount, deposit.bank_account_id)
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="BankDeposit", entity_id=deposit_id, description=f"تم احتساب فائدة الوديعة: {interest:.2f} {deposit.currency} على وديعة بحساب {account.account_name if account else deposit.bank_account_id}")
    db.commit()
    return success_response(data=bank_deposit_to_dict(deposit), message_ar=f"تم احتساب فائدة بقيمة {interest:.2f} {deposit.currency}")

@router.post("/bank_deposits/{deposit_id}/credit_interest")
def credit_bank_deposit_interest(deposit_id: str, actor: User = Depends(require_permission("إدارة البنوك")), db: Session = Depends(get_db)):
    """Moves this deposit's running accrued_interest into the bank account's actual cash
    balance — a deliberate, separate step so the balance only changes once someone
    confirms the bank has actually paid the interest."""
    deposit = db.get(BankDeposit, deposit_id)
    if not deposit:
        raise APIError(code="NOT_FOUND", message_ar="الوديعة غير موجودة", message_en="Deposit not found", status_code=404)
    if deposit.accrued_interest <= 0:
        raise APIError(code="NO_ACCRUED_INTEREST", message_ar="لا توجد فائدة متراكمة لإضافتها", message_en="No accrued interest to credit", status_code=400)

    account = db.get(BankAccount, deposit.bank_account_id)
    if not account:
        raise APIError(code="NOT_FOUND", message_ar="الحساب البنكي غير موجود", message_en="Bank account not found", status_code=404)

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    interest_amount = deposit.accrued_interest
    balance_before = account.balance
    account.balance += interest_amount
    account.last_movement = timestamp
    deposit.accrued_interest = 0.0

    entry_id = new_id(f"int_{deposit_id}")
    db.add(Movement(
        id=new_id(f"m_bank_{entry_id}"), timestamp=timestamp, entity_type="bank_account", entity_id=account.id,
        entity_name=account.account_name, currency=account.currency, type="إضافة فائدة وديعة بنكية",
        amount_in=interest_amount, amount_out=0.0, balance_before=balance_before, balance_after=account.balance,
        reference_id=entry_id, user=actor.name
    ))
    db.add(JournalEntry(
        id=f"JV-{entry_id}", date=timestamp, tx_type="فائدة بنكية", reference=entry_id,
        description=f"إضافة فائدة وديعة بقيمة {interest_amount:.2f} {account.currency} إلى حساب {account.account_name}",
        user=actor.name, status="approved",
        lines=[
            {"accountName": f"حساب بنكي {account.bank_name} - {account.account_name}", "currency": account.currency, "debit": interest_amount, "credit": 0.0, "originalAmount": interest_amount, "exchangeRate": 1.0, "equivalentLYD": interest_amount},
            {"accountName": "إيراد فوائد بنكية", "currency": account.currency, "debit": 0.0, "credit": interest_amount, "originalAmount": interest_amount, "exchangeRate": 1.0, "equivalentLYD": interest_amount},
        ]
    ))
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="BankDeposit", entity_id=deposit_id, description=f"تم إضافة فائدة مستحقة بقيمة {interest_amount:.2f} {account.currency} لرصيد الحساب {account.account_name}")
    db.commit()
    return success_response(data=bank_account_to_dict(account), message_ar=f"تم إضافة {interest_amount:.2f} {account.currency} لرصيد الحساب")

@router.delete("/bank_accounts/{account_id}")
def delete_bank_account(account_id: str, db: Session = Depends(get_db)):
    account = db.get(BankAccount, account_id)
    if not account:
        raise APIError(code="NOT_FOUND", message_ar="الحساب البنكي غير موجود", message_en="Bank account not found", status_code=404)
    db.delete(account)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="BankAccount", entity_id=account_id, description=f"تم حذف الحساب البنكي: {account.account_name}")
    db.commit()
    return success_response(data={"deleted": True})

def _sync_customer_bank_account(db: Session, customer: Customer, bank_name: str | None, account_number: str | None, currency: str | None, actor_name: str):
    """Keeps the customer's own external bank account (a BankAccount row tagged
    via customer_id, kept separate from the company's own accounts) in sync with
    the bank_name/bank_account_number typed into their profile. An existing
    unlinked account matching the IBAN is linked; otherwise a new Bank/Branch/
    BankAccount is created for it. If the customer already had a different
    account linked and the IBAN changed (or was cleared), that old account is
    unlinked — never deleted, since it may carry real balance/movement history."""
    previous = db.scalar(select(BankAccount).where(BankAccount.customer_id == customer.id))
    new_number = (account_number or "").strip()

    if previous and previous.account_number != new_number:
        previous.customer_id = None
        previous = None

    if not new_number or previous:
        return

    existing = db.scalar(select(BankAccount).where(BankAccount.account_number == new_number, BankAccount.customer_id.is_(None)))
    if existing:
        existing.customer_id = customer.id
        return

    safe_bank_name = (bank_name or "").strip() or "بنك العميل"
    bank = db.scalar(select(Bank).where(func.lower(Bank.name) == safe_bank_name.lower()))
    if not bank:
        bank = Bank(id=new_id("bank_cust"), name=safe_bank_name, code="-", country="-", city="-", phone="-",
                    is_active=True, notes="أُنشئ تلقائياً من بيانات حساب عميل")
        db.add(bank)
        db.flush()

    branch = db.scalar(select(BankBranch).where(BankBranch.bank_id == bank.id, BankBranch.name == "حسابات العملاء"))
    if not branch:
        branch = BankBranch(id=new_id("bbr_cust"), bank_id=bank.id, bank_name=bank.name, name="حسابات العملاء",
                            city="-", address="-", phone="-", manager="-", is_active=True)
        db.add(branch)
        db.flush()

    account = BankAccount(
        id=new_id("ba_cust"), bank_id=bank.id, bank_name=bank.name, branch_id=branch.id, branch_name=branch.name,
        account_name=customer.name, account_number=new_number, account_type="individual",
        currency=(currency or "LYD"), balance=0.0, is_active=True,
        notes="حساب بنكي خاص بالعميل — أُنشئ تلقائياً", customer_id=customer.id,
    )
    db.add(account)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="BankAccount", entity_id=account.id,
                     description=f"تم إنشاء حساب بنكي تلقائياً للعميل {customer.name} في {bank.name}", username=actor_name)

# ----------------- CUSTOMERS -----------------
@router.get("/customers")
def list_customers(db: Session = Depends(get_db)):
    res = db.scalars(select(Customer)).all()
    return success_response(data=[customer_to_dict(c) for c in res])

@router.get("/customers/next_code")
def next_customer_code(db: Session = Depends(get_db)):
    """Suggests the next sequential customer code (001, 002, ...) for the "new
    customer" form to pre-fill. Looks only at existing ids that are purely
    numeric — an older or manually-typed id like "C-1024" doesn't participate
    in the sequence, it just doesn't collide with it either since new codes
    are zero-padded plain digits."""
    ids = db.scalars(select(Customer.id)).all()
    numeric_ids = [int(cid) for cid in ids if cid.isdigit()]
    next_num = (max(numeric_ids) + 1) if numeric_ids else 1
    return success_response(data={"code": f"{next_num:03d}"})

@router.post("/customers")
def create_customer(data: CustomerCreate, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    if db.get(Customer, data.id):
        raise APIError(code="CUSTOMER_EXISTS", message_ar="رمز العميل موجود بالفعل", message_en="Customer ID already exists", status_code=400)
    c = Customer(**data.model_dump(exclude={"bank_currency"}))
    db.add(c)
    db.flush()
    _sync_customer_bank_account(db, c, data.bank_name, data.bank_account_number, data.bank_currency, actor.name)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="Customer", entity_id=c.id, description=f"تمت إضافة عميل جديد: {c.name}", username=actor.username)
    db.commit()
    return success_response(data=customer_to_dict(c))

@router.put("/customers/{customer_id}")
def update_customer(customer_id: str, data: CustomerCreate, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    c = db.get(Customer, customer_id)
    if not c:
        raise APIError(code="NOT_FOUND", message_ar="العميل غير موجود", message_en="Customer not found", status_code=404)
    c.name = data.name
    c.type = data.type
    c.phone = data.phone
    c.id_number = data.id_number
    c.address = data.address
    c.debt_limit = data.debt_limit
    c.balances = data.balances
    c.profit_pct = data.profit_pct
    c.notes = data.notes
    c.bank_name = data.bank_name
    c.bank_account_number = data.bank_account_number
    c.passport_number = data.passport_number
    was_active = c.is_active
    c.is_active = data.is_active
    _sync_customer_bank_account(db, c, data.bank_name, data.bank_account_number, data.bank_currency, actor.name)
    action_desc = f"تم تعديل بيانات العميل: {c.name}"
    if was_active and not data.is_active:
        action_desc = f"تم إيقاف العميل: {c.name}"
    elif not was_active and data.is_active:
        action_desc = f"تمت إعادة تفعيل العميل: {c.name}"
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="Customer", entity_id=c.id, description=action_desc, username=actor.username)
    db.commit()
    return success_response(data=customer_to_dict(c))

@router.delete("/customers/{customer_id}")
def delete_customer(customer_id: str, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise APIError(code="NOT_FOUND", message_ar="العميل غير موجود", message_en="Customer not found", status_code=404)
    for linked_account in db.scalars(select(BankAccount).where(BankAccount.customer_id == customer_id)).all():
        linked_account.customer_id = None
    db.delete(customer)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="Customer", entity_id=customer_id, description=f"تم حذف العميل: {customer.name}", username=actor.username)
    db.commit()
    return success_response(data={"deleted": True})

# ----------------- CUSTOMER ACCOUNT: STANDALONE DEPOSIT / WITHDRAWAL -----------------
# Doc requirement: "Customer Deposit" / "Customer Withdrawal" are their own operations,
# distinct from a currency trade — money moving between a customer's account and cash
# with nothing bought or sold. Kept in one currency (no rate involved).
class CustomerAccountOp(BaseModel):
    id: str | None = None
    vault_id: str | None = None
    bank_account_id: str | None = None
    other_source: str | None = None  # a free-text label when neither a vault nor a bank account tracks this money
    currency: str
    amount: float
    notes: str | None = None

class CustomerTransferOp(BaseModel):
    to_customer_id: str
    currency: str
    amount: float
    notes: str | None = None

def customer_account_entry_to_dict(e: CustomerAccountEntry):
    return {
        "id": e.id,
        "type": e.type,
        "customerId": e.customer_id,
        "customerName": e.customer_name,
        "vaultId": e.vault_id,
        "vaultName": e.vault_name,
        "bankAccountId": e.bank_account_id,
        "bankAccountName": e.bank_account_name,
        "otherSource": e.other_source,
        "currency": e.currency,
        "amount": e.amount,
        "balanceBefore": e.balance_before,
        "balanceAfter": e.balance_after,
        "notes": e.notes,
        "user": e.user,
        "shiftId": e.shift_id,
        "timestamp": e.timestamp,
    }

def _run_customer_account_op(op_type: str, customer_id: str, data: CustomerAccountOp, actor: User, db: Session) -> CustomerAccountEntry:
    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون المبلغ أكبر من صفر", message_en="Amount must be positive", status_code=400)
    sources_given = sum(1 for s in (data.vault_id, data.bank_account_id, data.other_source) if s)
    if sources_given != 1:
        raise APIError(code="INVALID_SOURCE", message_ar="يجب تحديد مصدر واحد فقط للعملية: خزنة أو حساب بنكي أو مصدر آخر", message_en="Provide exactly one of vault_id, bank_account_id, or other_source", status_code=400)

    customer = db.get(Customer, customer_id)
    if not customer:
        raise APIError(code="CUSTOMER_NOT_FOUND", message_ar="العميل غير موجود", message_en="Customer not found", status_code=404)
    if not customer.is_active:
        raise APIError(code="CUSTOMER_INACTIVE", message_ar="لا يمكن تنفيذ عملية على عميل غير نشط", message_en="Cannot operate on an inactive customer", status_code=400)

    is_deposit = op_type == "deposit"
    cust_before = customer.balances.get(data.currency, 0.0)

    # A vault/bank source has a real tracked balance to move and check; an "other"
    # source is just a record-keeping label (e.g. petty cash, an owner's personal
    # top-up) — there's nothing to move or check sufficiency against on that side.
    vault = None
    bank_acc = None
    source_before = source_after = None
    if data.vault_id:
        vault = db.get(Vault, data.vault_id)
        if not vault:
            raise APIError(code="VAULT_NOT_FOUND", message_ar="الخزنة المحددة غير موجودة", message_en="Vault not found", status_code=400)
        source_before = vault.balances.get(data.currency, 0.0)
    elif data.bank_account_id:
        bank_acc = db.get(BankAccount, data.bank_account_id)
        if not bank_acc:
            raise APIError(code="BANK_ACCOUNT_NOT_FOUND", message_ar="الحساب البنكي المحدد غير موجود", message_en="Bank account not found", status_code=400)
        if not bank_acc.is_active:
            raise APIError(code="ACCOUNT_INACTIVE", message_ar="لا يمكن تنفيذ عملية على حساب بنكي غير نشط", message_en="Cannot operate on an inactive bank account", status_code=400)
        source_before = bank_acc.balance

    # Note the source (vault/bank) side moves OPPOSITE to the customer's own balance:
    # a "deposit" to the customer's account is funded by the office paying it out of
    # the vault/bank (source decreases), and a "withdraw" from the customer's account
    # returns that cash to the vault/bank (source increases).
    if is_deposit:
        cust_after = cust_before + data.amount
        if source_before is not None:
            if source_before < data.amount:
                raise APIError(code="INSUFFICIENT_BALANCE", message_ar=f"الرصيد المتاح غير كافٍ لصرف المبلغ ({source_before} {data.currency})", message_en="Insufficient balance to pay out", status_code=400)
            source_after = source_before - data.amount
    else:
        # A customer can withdraw more than they have on account — it's a running
        # trust relationship, not a hard prepaid limit — so this deliberately allows
        # the balance to go negative (e.g. -1,500 withdrawing 5,000 more becomes
        # -6,500) rather than blocking the withdrawal.
        if source_before is not None:
            source_after = source_before + data.amount
        cust_after = cust_before - data.amount

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    entry_id = data.id or new_id(f"cae_{op_type}")

    cust_bals = customer.balances.copy()
    cust_bals[data.currency] = cust_after
    customer.balances = cust_bals

    shift = None
    if vault:
        v_bals = vault.balances.copy()
        v_bals[data.currency] = source_after
        vault.balances = v_bals
        vault.last_movement = timestamp
        shift = db.scalar(select(Shift).where(Shift.vault_id == vault.id, Shift.status == "open"))
        if shift:
            expected = shift.expected_balances.copy()
            expected[data.currency] = expected.get(data.currency, 0.0) + (-data.amount if is_deposit else data.amount)
            shift.expected_balances = expected
    elif bank_acc:
        bank_acc.balance = source_after
        bank_acc.last_movement = timestamp

    bank_acc_label = f"{bank_acc.bank_name} - {bank_acc.account_name}" if bank_acc else None
    entry = CustomerAccountEntry(
        id=entry_id, type=op_type, customer_id=customer.id, customer_name=customer.name,
        vault_id=vault.id if vault else None, vault_name=vault.name if vault else None,
        bank_account_id=bank_acc.id if bank_acc else None, bank_account_name=bank_acc_label,
        other_source=data.other_source if not (vault or bank_acc) else None,
        currency=data.currency, amount=data.amount,
        balance_before=cust_before, balance_after=cust_after, notes=data.notes, user=actor.name,
        shift_id=shift.id if shift else None, timestamp=timestamp
    )
    db.add(entry)

    db.add(Movement(
        id=new_id(f"m_cust_{entry_id}"), timestamp=timestamp, entity_type="customer", entity_id=customer.id,
        entity_name=customer.name, currency=data.currency,
        type="إيداع حساب عميل" if is_deposit else "سحب من حساب عميل",
        amount_in=data.amount if is_deposit else 0.0, amount_out=0.0 if is_deposit else data.amount,
        balance_before=cust_before, balance_after=cust_after, reference_id=entry_id, user=actor.name
    ))
    if vault:
        db.add(Movement(
            id=new_id(f"m_vault_{entry_id}"), timestamp=timestamp, entity_type="vault", entity_id=vault.id,
            entity_name=vault.name, currency=data.currency,
            type="دفع نقدي لإيداع حساب عميل" if is_deposit else "تحصيل نقدي من سحب حساب عميل",
            amount_in=0.0 if is_deposit else data.amount, amount_out=data.amount if is_deposit else 0.0,
            balance_before=source_before, balance_after=source_after, reference_id=entry_id, user=actor.name
        ))
    elif bank_acc:
        db.add(Movement(
            id=new_id(f"m_bank_{entry_id}"), timestamp=timestamp, entity_type="bank_account", entity_id=bank_acc.id,
            entity_name=bank_acc_label, currency=data.currency,
            type="دفع من حساب بنكي لإيداع حساب عميل" if is_deposit else "تحصيل لحساب بنكي من سحب حساب عميل",
            amount_in=0.0 if is_deposit else data.amount, amount_out=data.amount if is_deposit else 0.0,
            balance_before=source_before, balance_after=source_after, reference_id=entry_id, user=actor.name
        ))
    # No Movement for an "other" source — there's no tracked balance on that side to log against.

    # Also recorded as a Transaction so it shows up in the same history/reports/shift-session
    # view as buy/sell/exchange — only possible when funded from a vault (Transaction.vault_id
    # is required); a bank-funded entry is still fully tracked via the records above and its
    # own receipt (get_transaction_receipt falls back to CustomerAccountEntry when no Transaction exists).
    if vault:
        db.add(Transaction(
            id=entry_id, type=op_type, vault_id=vault.id, vault_name=vault.name, shift_id=shift.id if shift else None,
            customer_id=customer.id, customer_name=customer.name, from_currency=data.currency, to_currency=data.currency,
            amount=data.amount, rate=1.0, commission=0.0, total_amount=data.amount, payment_method="cash",
            status="approved", notes=data.notes, user=actor.name, branch=vault.branch, timestamp=timestamp, expected_profit=0.0
        ))

    equivalent_lyd = data.amount
    if data.currency != "LYD":
        rate_row = db.scalar(select(ExchangeRate).where(ExchangeRate.from_currency == data.currency, ExchangeRate.to_currency == "LYD"))
        if rate_row:
            equivalent_lyd = data.amount * rate_row.sell_rate

    source_label = vault.name if vault else bank_acc_label if bank_acc else (data.other_source or "مصدر آخر")
    source_kind = "خزينة" if vault else "حساب بنكي" if bank_acc else "مصدر آخر"
    lines = [
        {
            "accountName": f"{source_kind} {source_label} - {data.currency}", "currency": data.currency,
            "debit": 0.0 if is_deposit else data.amount, "credit": data.amount if is_deposit else 0.0,
            "originalAmount": data.amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd
        },
        {
            "accountName": f"حساب العميل {customer.name} - {data.currency}", "currency": data.currency,
            "debit": data.amount if is_deposit else 0.0, "credit": 0.0 if is_deposit else data.amount,
            "originalAmount": data.amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd
        },
    ]
    db.add(JournalEntry(
        id=f"JV-{datetime.utcnow().strftime('%Y%m%d')}-{entry_id}", date=timestamp,
        tx_type="إيداع حساب عميل" if is_deposit else "سحب من حساب عميل", reference=entry_id,
        description=f"{'إيداع' if is_deposit else 'سحب'} {data.amount} {data.currency} {'في' if is_deposit else 'من'} حساب العميل {customer.name}",
        user=actor.name, status="approved", lines=lines
    ))

    create_audit_log(
        db, action=AuditAction.CREATE, entity_type="CustomerAccountEntry", entity_id=entry_id,
        description=f"{'إيداع' if is_deposit else 'سحب'} {data.amount} {data.currency} {'في' if is_deposit else 'من'} حساب العميل {customer.name} عبر {source_kind} {source_label}",
        username=actor.username
    )
    db.commit()
    return entry

@router.post("/customers/{customer_id}/deposit")
def deposit_to_customer(customer_id: str, data: CustomerAccountOp, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    entry = _run_customer_account_op("deposit", customer_id, data, actor, db)
    return success_response(data=customer_account_entry_to_dict(entry), message_ar="تم تسجيل الإيداع بنجاح")

@router.post("/customers/{customer_id}/withdraw")
def withdraw_from_customer(customer_id: str, data: CustomerAccountOp, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    entry = _run_customer_account_op("withdraw", customer_id, data, actor, db)
    return success_response(data=customer_account_entry_to_dict(entry), message_ar="تم تسجيل السحب بنجاح")

@router.post("/customers/{customer_id}/transfer")
def transfer_between_customers(customer_id: str, data: CustomerTransferOp, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    """Moves money directly from one customer's account to another's, in the same
    currency — no vault or bank involved on either side, unlike deposit/withdraw."""
    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون المبلغ أكبر من صفر", message_en="Amount must be positive", status_code=400)
    if data.to_customer_id == customer_id:
        raise APIError(code="SAME_CUSTOMER", message_ar="لا يمكن التحويل لنفس العميل", message_en="Cannot transfer to the same customer", status_code=400)

    from_customer = db.get(Customer, customer_id)
    if not from_customer:
        raise APIError(code="CUSTOMER_NOT_FOUND", message_ar="العميل المرسل غير موجود", message_en="Sending customer not found", status_code=404)
    if not from_customer.is_active:
        raise APIError(code="CUSTOMER_INACTIVE", message_ar="لا يمكن التحويل من عميل غير نشط", message_en="Cannot transfer from an inactive customer", status_code=400)

    to_customer = db.get(Customer, data.to_customer_id)
    if not to_customer:
        raise APIError(code="RECIPIENT_NOT_FOUND", message_ar="العميل المستلم غير موجود", message_en="Recipient customer not found", status_code=404)
    if not to_customer.is_active:
        raise APIError(code="RECIPIENT_INACTIVE", message_ar="لا يمكن التحويل إلى عميل غير نشط", message_en="Cannot transfer to an inactive customer", status_code=400)

    from_before = from_customer.balances.get(data.currency, 0.0)
    if from_before < data.amount:
        raise APIError(code="INSUFFICIENT_BALANCE", message_ar=f"رصيد العميل غير كافٍ ({from_before} {data.currency})", message_en="Insufficient customer balance", status_code=400)
    from_after = from_before - data.amount
    to_before = to_customer.balances.get(data.currency, 0.0)
    to_after = to_before + data.amount

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    transfer_id = new_id("cxfer")

    from_bals = from_customer.balances.copy()
    from_bals[data.currency] = from_after
    from_customer.balances = from_bals
    to_bals = to_customer.balances.copy()
    to_bals[data.currency] = to_after
    to_customer.balances = to_bals

    out_entry = CustomerAccountEntry(
        id=f"{transfer_id}_out", type="transfer_out", customer_id=from_customer.id, customer_name=from_customer.name,
        other_source=f"تحويل إلى العميل {to_customer.name} ({to_customer.id})",
        currency=data.currency, amount=data.amount, balance_before=from_before, balance_after=from_after,
        notes=data.notes, user=actor.name, timestamp=timestamp
    )
    in_entry = CustomerAccountEntry(
        id=f"{transfer_id}_in", type="transfer_in", customer_id=to_customer.id, customer_name=to_customer.name,
        other_source=f"تحويل من العميل {from_customer.name} ({from_customer.id})",
        currency=data.currency, amount=data.amount, balance_before=to_before, balance_after=to_after,
        notes=data.notes, user=actor.name, timestamp=timestamp
    )
    db.add(out_entry)
    db.add(in_entry)

    db.add(Movement(
        id=new_id(f"m_cust_{transfer_id}_out"), timestamp=timestamp, entity_type="customer", entity_id=from_customer.id,
        entity_name=from_customer.name, currency=data.currency, type="تحويل صادر لعميل آخر",
        amount_in=0.0, amount_out=data.amount, balance_before=from_before, balance_after=from_after,
        reference_id=transfer_id, user=actor.name
    ))
    db.add(Movement(
        id=new_id(f"m_cust_{transfer_id}_in"), timestamp=timestamp, entity_type="customer", entity_id=to_customer.id,
        entity_name=to_customer.name, currency=data.currency, type="تحويل وارد من عميل آخر",
        amount_in=data.amount, amount_out=0.0, balance_before=to_before, balance_after=to_after,
        reference_id=transfer_id, user=actor.name
    ))

    equivalent_lyd = data.amount
    if data.currency != "LYD":
        rate_row = db.scalar(select(ExchangeRate).where(ExchangeRate.from_currency == data.currency, ExchangeRate.to_currency == "LYD"))
        if rate_row:
            equivalent_lyd = data.amount * rate_row.sell_rate

    db.add(JournalEntry(
        id=f"JV-{datetime.utcnow().strftime('%Y%m%d')}-{transfer_id}", date=timestamp,
        tx_type="تحويل بين حسابات عملاء", reference=transfer_id,
        description=f"تحويل {data.amount} {data.currency} من حساب العميل {from_customer.name} إلى حساب العميل {to_customer.name}",
        user=actor.name, status="approved",
        lines=[
            {"accountName": f"حساب العميل {from_customer.name} - {data.currency}", "currency": data.currency, "debit": data.amount, "credit": 0.0, "originalAmount": data.amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd},
            {"accountName": f"حساب العميل {to_customer.name} - {data.currency}", "currency": data.currency, "debit": 0.0, "credit": data.amount, "originalAmount": data.amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd},
        ]
    ))

    create_audit_log(
        db, action=AuditAction.CREATE, entity_type="CustomerAccountEntry", entity_id=transfer_id,
        description=f"تحويل {data.amount} {data.currency} من حساب العميل {from_customer.name} إلى حساب العميل {to_customer.name}",
        username=actor.username
    )
    db.commit()
    return success_response(
        data={"from": customer_account_entry_to_dict(out_entry), "to": customer_account_entry_to_dict(in_entry)},
        message_ar=f"تم تحويل {data.amount} {data.currency} إلى {to_customer.name} بنجاح"
    )

@router.get("/customer_account_entries")
def list_customer_account_entries(db: Session = Depends(get_db)):
    res = db.scalars(select(CustomerAccountEntry).order_by(CustomerAccountEntry.timestamp.desc())).all()
    return success_response(data=[customer_account_entry_to_dict(e) for e in res])

def _group_rows_by_currency(name_prefix: str, headers: list[str], items_with_ts_ccy_row: list[tuple[str, str, list]]) -> list[tuple[str, list[str], list[list]]]:
    """Splits a flat (timestamp, currency, row) list into one named section per
    currency actually present, each sorted and numbered on its own — e.g.
    "الديون - LYD" and "الديون - USD" as two separate tables instead of one
    mixed-currency list. With a single currency already filtered upstream,
    this naturally produces just one section."""
    by_ccy: dict[str, list[tuple[str, list]]] = {}
    for ts, ccy, row in items_with_ts_ccy_row:
        by_ccy.setdefault(ccy, []).append((ts, row))
    sections = []
    for ccy in sorted(by_ccy.keys()):
        entries = sorted(by_ccy[ccy], key=lambda r: r[0])
        rows = [[str(i)] + row for i, (_, row) in enumerate(entries, start=1)]
        sections.append((f"{name_prefix} - {ccy}", headers, rows))
    return sections

def _customer_statement_sections(db: Session, customer: Customer, date_from: str = "", date_to: str = "", currency: str = ""):
    """Every buy/sell/exchange transaction, deposit/withdraw/transfer entry, debt,
    and سلفة for this customer — kept separated by kind (and, for debts/سلف,
    by currency) rather than merged into one chronological list, so e.g. a USD
    debt and a LYD سلفة never end up interleaved in the same table. Returns
    (sections, closing_line) where sections is a list of (name, headers, rows)
    ready for build_sectioned_excel / build_sectioned_pdf."""
    txs_query = select(Transaction).where(Transaction.customer_id == customer.id, Transaction.type.in_(["buy", "sell", "exchange"]))
    entries_query = select(CustomerAccountEntry).where(CustomerAccountEntry.customer_id == customer.id)
    debts_query = select(Debt).where(Debt.customer_id == customer.id)
    debt_payments_query = select(DebtPaymentRecord).where(DebtPaymentRecord.customer_id == customer.id)
    advances_query = select(Advance).where(Advance.customer_id == customer.id)
    advance_payments_query = select(AdvancePaymentRecord).where(AdvancePaymentRecord.customer_id == customer.id)
    if date_from:
        txs_query = txs_query.where(Transaction.timestamp >= date_from)
        entries_query = entries_query.where(CustomerAccountEntry.timestamp >= date_from)
        debts_query = debts_query.where(Debt.start_date >= date_from)
        debt_payments_query = debt_payments_query.where(DebtPaymentRecord.timestamp >= date_from)
        advances_query = advances_query.where(Advance.timestamp >= date_from)
        advance_payments_query = advance_payments_query.where(AdvancePaymentRecord.timestamp >= date_from)
    if date_to:
        txs_query = txs_query.where(Transaction.timestamp <= date_to + "T23:59:59")
        entries_query = entries_query.where(CustomerAccountEntry.timestamp <= date_to + "T23:59:59")
        debts_query = debts_query.where(Debt.start_date <= date_to)
        debt_payments_query = debt_payments_query.where(DebtPaymentRecord.timestamp <= date_to + "T23:59:59")
        advances_query = advances_query.where(Advance.timestamp <= date_to + "T23:59:59")
        advance_payments_query = advance_payments_query.where(AdvancePaymentRecord.timestamp <= date_to + "T23:59:59")
    if currency:
        entries_query = entries_query.where(CustomerAccountEntry.currency == currency)
        debts_query = debts_query.where(Debt.currency == currency)
        debt_payments_query = debt_payments_query.where(DebtPaymentRecord.currency == currency)
        advances_query = advances_query.where(Advance.currency == currency)
        advance_payments_query = advance_payments_query.where(AdvancePaymentRecord.currency == currency)

    txs = db.scalars(txs_query).all()
    entries = db.scalars(entries_query).all()
    debts = db.scalars(debts_query).all()
    debt_payments = db.scalars(debt_payments_query).all()
    advances = db.scalars(advances_query).all()
    advance_payments = db.scalars(advance_payments_query).all()

    detail_headers = ["م", "التاريخ", "التفاصيل", "المبلغ", "العملة", "بواسطة"]

    # 1. معاملات الصرافة — buy/sell/exchange only.
    trade_rows_with_ts = []
    for t in txs:
        tx_currency = t.to_currency if t.type == "sell" else t.from_currency
        if currency and tx_currency != currency:
            continue
        detail = f"{_RECEIPT_TYPE_LABELS.get(t.type, t.type)} — {t.id}"
        trade_rows_with_ts.append((t.timestamp, [t.timestamp, detail, f"{t.amount:,.2f}", tx_currency, t.user]))
    trade_rows_with_ts.sort(key=lambda r: r[0])
    trade_rows = [[str(i)] + row for i, (_, row) in enumerate(trade_rows_with_ts, start=1)]

    # 2. الإيداع والسحب — deposits, withdrawals, and customer-to-customer transfers.
    dw_rows_with_ts = []
    for e in entries:
        if e.type == "deposit":
            detail = "إيداع في الحساب"
        elif e.type == "withdraw":
            detail = "سحب من الحساب"
        else:
            # transfer_in / transfer_out — other_source already reads like
            # "تحويل من/إلى العميل X (id)", so it doubles as the detail text.
            detail = e.other_source or e.type
        dw_rows_with_ts.append((e.timestamp, [e.timestamp, detail, f"{e.amount:,.2f}", e.currency, e.user]))
    dw_rows_with_ts.sort(key=lambda r: r[0])
    dw_rows = [[str(i)] + row for i, (_, row) in enumerate(dw_rows_with_ts, start=1)]

    # 3. الديون — grouped into one table per currency.
    debt_items = []
    for d in debts:
        detail = f"تسجيل دين جديد — استحقاق {d.due_date}"
        debt_items.append((d.start_date, d.currency, [d.start_date, detail, f"{d.amount:,.2f}", d.currency, d.created_by or "—"]))
    for p in debt_payments:
        debt_items.append((p.timestamp, p.currency, [p.timestamp, "تسديد دفعة دين", f"{p.amount:,.2f}", p.currency, p.user]))
    debt_sections = _group_rows_by_currency("الديون", detail_headers, debt_items)

    # 4. السلف — grouped into one table per currency.
    advance_items = []
    for a in advances:
        source_label = a.vault_name or a.bank_account_name
        detail = f"صرف سلفة — من {source_label}"
        advance_items.append((a.timestamp, a.currency, [a.timestamp, detail, f"{a.amount:,.2f}", a.currency, a.created_by]))
    for p in advance_payments:
        source_label = p.vault_name or p.bank_account_name
        detail = f"تسديد دفعة سلفة — إلى {source_label}"
        advance_items.append((p.timestamp, p.currency, [p.timestamp, detail, f"{p.amount:,.2f}", p.currency, p.user]))
    advance_sections = _group_rows_by_currency("السلف", detail_headers, advance_items)

    sections = [
        ("معاملات الصرافة", detail_headers, trade_rows),
        ("الإيداع والسحب", detail_headers, dw_rows),
        *debt_sections,
        *advance_sections,
    ]

    balances = {currency: customer.balances.get(currency, 0.0)} if currency else customer.balances
    closing_line = "الأرصدة الحالية: " + (", ".join(f"{amt:,.2f} {ccy}" for ccy, amt in balances.items()) or "لا توجد أرصدة")
    return sections, closing_line

@router.get("/customers/{customer_id}/statement")
def get_customer_statement(customer_id: str, date_from: str = "", date_to: str = "", currency: str = "", actor: User = Depends(require_permission("رؤية سجل العمليات")), db: Session = Depends(get_db)):
    """JSON version of the statement sections, for an on-screen filterable view
    (as opposed to the /export endpoint below, which renders a downloadable
    file). Kept separated by kind, same as the export."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise APIError(code="NOT_FOUND", message_ar="العميل غير موجود", message_en="Customer not found", status_code=404)
    sections, closing_line = _customer_statement_sections(db, customer, date_from, date_to, currency)
    return success_response(data={
        "sections": [{"name": name, "headers": headers, "rows": rows} for name, headers, rows in sections],
        "closingLine": closing_line,
    })

@router.get("/customers/{customer_id}/statement/export")
def export_customer_statement(customer_id: str, format: str = "pdf", date_from: str = "", date_to: str = "", currency: str = "", actor: User = Depends(require_permission("رؤية سجل العمليات")), db: Session = Depends(get_db)):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise APIError(code="NOT_FOUND", message_ar="العميل غير موجود", message_en="Customer not found", status_code=404)

    sections, closing_line = _customer_statement_sections(db, customer, date_from, date_to, currency)
    if format == "xlsx":
        buf = build_sectioned_excel(sections)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="statement_{customer.id}.xlsx"'})
    try:
        info_line = f"الهاتف: {customer.phone}" + (f"  —  الرقم الوطني: {customer.id_number}" if customer.id_number else "")
        buf = build_sectioned_pdf(f"كشف حساب — {customer.name}", sections, closing_line, subtitle_lines=[info_line])
    except ArabicFontUnavailable as e:
        raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء كشف الحساب: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="statement_{customer.id}.pdf"'})

@router.post("/customers/{customer_id}/send_statement_whatsapp")
def send_customer_statement_whatsapp(customer_id: str, date_from: str = "", date_to: str = "", currency: str = "", actor: User = Depends(require_permission("رؤية سجل العمليات")), db: Session = Depends(get_db)):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise APIError(code="NOT_FOUND", message_ar="العميل غير موجود", message_en="Customer not found", status_code=404)
    if not customer.phone:
        raise APIError(code="NO_PHONE", message_ar="لا يوجد رقم هاتف مسجل لهذا العميل", message_en="This customer has no phone number on file", status_code=400)

    sections, closing_line = _customer_statement_sections(db, customer, date_from, date_to, currency)
    try:
        info_line = f"الهاتف: {customer.phone}" + (f"  —  الرقم الوطني: {customer.id_number}" if customer.id_number else "")
        buf = build_sectioned_pdf(f"كشف حساب — {customer.name}", sections, closing_line, subtitle_lines=[info_line])
    except ArabicFontUnavailable as e:
        raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء كشف الحساب: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)

    result = send_whatsapp_document(db, customer.phone, buf.read(), f"statement_{customer.id}.pdf", caption=f"كشف حساب — {customer.name}")
    if not result.get("sent"):
        raise APIError(code="WHATSAPP_SEND_FAILED", message_ar="تعذر إرسال كشف الحساب عبر واتساب — تأكد من إعداد بوابة واتساب من الإعدادات", message_en=f"WhatsApp send failed: {result.get('reason')}", status_code=502)
    create_audit_log(db, action=AuditAction.SYSTEM_ALERT, entity_type="Customer", entity_id=customer_id, description=f"تم إرسال كشف حساب العميل {customer.name} عبر واتساب إلى {customer.phone}")
    db.commit()
    return success_response(data={"sent": True}, message_ar="تم إرسال كشف الحساب عبر واتساب بنجاح")

def _run_bank_account_op(op_type: str, account_id: str, data: CustomerAccountOp, actor: User, db: Session):
    """Moves cash between a vault's drawer and a bank account — a deposit takes
    cash out of the vault and into the bank, a withdrawal does the reverse.
    Mirrors _run_customer_account_op's before/after + Movement-logging shape."""
    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون المبلغ أكبر من صفر", message_en="Amount must be positive", status_code=400)
    if not data.vault_id:
        raise APIError(code="VAULT_REQUIRED", message_ar="يجب تحديد الخزنة التي ستتم منها العملية", message_en="A vault is required for this operation", status_code=400)

    account = db.get(BankAccount, account_id)
    if not account:
        raise APIError(code="NOT_FOUND", message_ar="الحساب البنكي غير موجود", message_en="Bank account not found", status_code=404)
    if not account.is_active:
        raise APIError(code="ACCOUNT_INACTIVE", message_ar="لا يمكن تنفيذ عملية على حساب بنكي غير نشط", message_en="Cannot operate on an inactive bank account", status_code=400)

    vault = db.get(Vault, data.vault_id)
    if not vault:
        raise APIError(code="VAULT_NOT_FOUND", message_ar="الخزنة المحددة غير موجودة", message_en="Vault not found", status_code=400)

    is_deposit = op_type == "deposit"
    account_before = account.balance
    vault_before = vault.balances.get(account.currency, 0.0)

    if is_deposit:
        if vault_before < data.amount:
            raise APIError(code="INSUFFICIENT_BALANCE", message_ar=f"رصيد الخزنة غير كافٍ ({vault_before} {account.currency})", message_en="Insufficient vault balance", status_code=400)
        account_after = account_before + data.amount
        vault_after = vault_before - data.amount  # cash leaves the drawer, goes to the bank
    else:
        if account_before < data.amount:
            raise APIError(code="INSUFFICIENT_BALANCE", message_ar=f"رصيد الحساب البنكي غير كافٍ ({account_before} {account.currency})", message_en="Insufficient bank account balance", status_code=400)
        account_after = account_before - data.amount
        vault_after = vault_before + data.amount  # cash comes out of the bank, into the drawer

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    entry_id = data.id or new_id(f"bae_{op_type}")

    account.balance = account_after
    account.last_movement = timestamp

    v_bals = vault.balances.copy()
    v_bals[account.currency] = vault_after
    vault.balances = v_bals
    vault.last_movement = timestamp

    db.add(Movement(
        id=new_id(f"m_bank_{entry_id}"), timestamp=timestamp, entity_type="bank_account", entity_id=account.id,
        entity_name=account.account_name, currency=account.currency,
        type="إيداع في حساب بنكي" if is_deposit else "سحب من حساب بنكي",
        amount_in=data.amount if is_deposit else 0.0, amount_out=0.0 if is_deposit else data.amount,
        balance_before=account_before, balance_after=account_after, reference_id=entry_id, user=actor.name
    ))
    db.add(Movement(
        id=new_id(f"m_vault_{entry_id}"), timestamp=timestamp, entity_type="vault", entity_id=vault.id,
        entity_name=vault.name, currency=account.currency,
        type="تحويل نقدي إلى بنك" if is_deposit else "سحب نقدي من بنك",
        amount_in=0.0 if is_deposit else data.amount, amount_out=data.amount if is_deposit else 0.0,
        balance_before=vault_before, balance_after=vault_after, reference_id=entry_id, user=actor.name
    ))

    create_audit_log(
        db, action=AuditAction.CREATE, entity_type="BankAccountMovement", entity_id=entry_id,
        description=f"{'إيداع' if is_deposit else 'سحب'} {data.amount} {account.currency} {'في' if is_deposit else 'من'} حساب {account.account_name} عبر خزنة {vault.name}",
        username=actor.username
    )
    db.commit()
    return account

class BankAccountDepositOp(CustomerAccountOp):
    interest_rate: float = 0.0  # if the bank quotes a rate on this specific deposit, record it for interest tracking

@router.post("/bank_accounts/{account_id}/deposit")
def deposit_to_bank_account(account_id: str, data: BankAccountDepositOp, actor: User = Depends(require_permission("إدارة البنوك")), db: Session = Depends(get_db)):
    account = _run_bank_account_op("deposit", account_id, data, actor, db)
    if data.interest_rate > 0:
        db.add(BankDeposit(
            id=new_id(f"bdep_{account_id}"), bank_account_id=account.id, amount=data.amount, currency=account.currency,
            interest_rate=data.interest_rate, deposit_date=datetime.utcnow().strftime("%Y-%m-%d"),
            accrued_interest=0.0, last_calculated=None, status="active",
            notes=f"مسجلة تلقائياً من عملية إيداع {data.id or ''}".strip()
        ))
        db.commit()
    return success_response(data=bank_account_to_dict(account), message_ar="تم تسجيل الإيداع بنجاح")

@router.post("/bank_accounts/{account_id}/withdraw")
def withdraw_from_bank_account(account_id: str, data: CustomerAccountOp, actor: User = Depends(require_permission("إدارة البنوك")), db: Session = Depends(get_db)):
    account = _run_bank_account_op("withdraw", account_id, data, actor, db)
    return success_response(data=bank_account_to_dict(account), message_ar="تم تسجيل السحب بنجاح")

# ----------------- CUSTOMER KYC DOCUMENTS -----------------
class CustomerDocumentCreate(BaseModel):
    id: str
    customer_id: str | None = None  # left empty when the document isn't linked to a customer record yet
    customer_name: str | None = None
    document_type: str
    file_name: str
    expiry_date: str | None = None
    status: str = "ساري"
    notes: str | None = None

def customer_document_to_dict(d: CustomerDocument):
    return {
        "id": d.id,
        "customerId": d.customer_id,
        "customerName": d.customer_name,
        "documentType": d.document_type,
        "fileName": d.file_name,
        "expiryDate": d.expiry_date,
        "status": d.status,
        "notes": d.notes,
        "hasFile": bool(d.stored_path),
    }

@router.get("/customer_documents")
def list_customer_documents(db: Session = Depends(get_db)):
    res = db.scalars(select(CustomerDocument)).all()
    return success_response(data=[customer_document_to_dict(d) for d in res])

@router.post("/customer_documents")
def add_customer_document(data: CustomerDocumentCreate, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    customer = None
    if data.customer_id:
        customer = db.get(Customer, data.customer_id)
        if not customer:
            raise APIError(code="CUSTOMER_NOT_FOUND", message_ar="العميل المحدد غير موجود", message_en="Customer not found", status_code=400)
    doc = CustomerDocument(**{**data.model_dump(), "customer_name": customer.name if customer else None})
    db.add(doc)
    description = f"تمت إضافة مستند ({doc.document_type}) للعميل {doc.customer_name}" if customer else f"تمت إضافة مستند غير مرتبط بعميل ({doc.document_type})"
    create_audit_log(db, action=AuditAction.CREATE, entity_type="CustomerDocument", entity_id=doc.id, description=description, username=actor.username)
    db.commit()
    return success_response(data=customer_document_to_dict(doc), message_ar="تمت إضافة المستند بنجاح")

class CustomerDocumentConnect(BaseModel):
    customer_id: str

@router.post("/customer_documents/{doc_id}/connect")
def connect_customer_document(doc_id: str, data: CustomerDocumentConnect, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    """Links a previously-unlinked document (uploaded before a customer record
    existed for it) to an actual customer — the whole point of keeping it
    unlinked in the first place, rather than forcing a customer to exist first."""
    doc = db.get(CustomerDocument, doc_id)
    if not doc:
        raise APIError(code="NOT_FOUND", message_ar="المستند غير موجود", message_en="Document not found", status_code=404)
    customer = db.get(Customer, data.customer_id)
    if not customer:
        raise APIError(code="CUSTOMER_NOT_FOUND", message_ar="العميل المحدد غير موجود", message_en="Customer not found", status_code=400)
    doc.customer_id = customer.id
    doc.customer_name = customer.name
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="CustomerDocument", entity_id=doc_id, description=f"تم ربط مستند غير مرتبط بالعميل {customer.name}", username=actor.username)
    db.commit()
    return success_response(data=customer_document_to_dict(doc), message_ar="تم ربط المستند بالعميل بنجاح")

@router.put("/customer_documents/{doc_id}")
def update_customer_document(doc_id: str, data: CustomerDocumentCreate, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    doc = db.get(CustomerDocument, doc_id)
    if not doc:
        raise APIError(code="NOT_FOUND", message_ar="المستند غير موجود", message_en="Document not found", status_code=404)
    doc.document_type = data.document_type
    doc.file_name = data.file_name
    doc.expiry_date = data.expiry_date
    doc.status = data.status
    doc.notes = data.notes
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="CustomerDocument", entity_id=doc_id, description=f"تم تعديل مستند العميل {doc.customer_name}", username=actor.username)
    db.commit()
    return success_response(data=customer_document_to_dict(doc), message_ar="تم تعديل المستند بنجاح")

@router.post("/customer_documents/{doc_id}/file")
async def upload_customer_document_file(doc_id: str, file: UploadFile = File(...), actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    doc = db.get(CustomerDocument, doc_id)
    if not doc:
        raise APIError(code="NOT_FOUND", message_ar="المستند غير موجود", message_en="Document not found", status_code=404)
    doc.stored_path = await save_upload("customer_documents", doc_id, file)
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="CustomerDocument", entity_id=doc_id, description=f"تم رفع ملف لمستند العميل {doc.customer_name}", username=actor.username)
    db.commit()
    return success_response(data=customer_document_to_dict(doc), message_ar="تم رفع الملف بنجاح")

@router.get("/customer_documents/{doc_id}/file")
def download_customer_document_file(doc_id: str, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.get(CustomerDocument, doc_id)
    if not doc or not doc.stored_path:
        raise APIError(code="NOT_FOUND", message_ar="لا يوجد ملف مرفوع لهذا المستند", message_en="No file uploaded for this document", status_code=404)
    path = resolve_path(doc.stored_path)
    if not os.path.exists(path):
        raise APIError(code="NOT_FOUND", message_ar="الملف غير موجود على الخادم", message_en="File missing on server", status_code=404)
    return FileResponse(path, filename=doc.file_name, content_disposition_type="inline")

@router.delete("/customer_documents/{doc_id}")
def delete_customer_document(doc_id: str, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    doc = db.get(CustomerDocument, doc_id)
    if not doc:
        raise APIError(code="NOT_FOUND", message_ar="المستند غير موجود", message_en="Document not found", status_code=404)
    if doc.stored_path:
        try:
            os.remove(resolve_path(doc.stored_path))
        except OSError:
            pass  # file already gone — don't block deleting the record over it
    db.delete(doc)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="CustomerDocument", entity_id=doc_id, description=f"تم حذف مستند العميل {doc.customer_name}", username=actor.username)
    db.commit()
    return success_response(message_ar="تم حذف المستند بنجاح")

# ----------------- CUSTOMER CSV BULK IMPORT -----------------
class CustomerImportRow(BaseModel):
    id: str
    name: str
    type: str = "individual"
    phone: str = ""
    id_number: str = ""
    address: str = ""
    debt_limit: float = 0.0
    profit_pct: float = 0.0
    opening_balance_currency: str | None = None
    opening_balance_amount: float = 0.0

class CustomerImportRequest(BaseModel):
    rows: List[CustomerImportRow]

@router.post("/customers/import")
def import_customers(data: CustomerImportRequest, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    """Bulk-create customers, e.g. from a CSV parsed client-side and posted as rows.
    Skips (rather than fails) rows whose id already exists, so a re-run after fixing
    a few bad rows doesn't need the whole file re-uploaded from scratch."""
    created, skipped = [], []
    for row in data.rows:
        if db.get(Customer, row.id):
            skipped.append(row.id)
            continue
        balances = {}
        if row.opening_balance_currency and row.opening_balance_amount:
            balances[row.opening_balance_currency] = row.opening_balance_amount
        customer = Customer(
            id=row.id, name=row.name, type=row.type, phone=row.phone, id_number=row.id_number,
            address=row.address, debt_limit=row.debt_limit, balances=balances, is_active=True,
            profit_pct=row.profit_pct
        )
        db.add(customer)
        created.append(row.id)

    create_audit_log(db, action=AuditAction.CREATE, entity_type="Customer", entity_id="bulk_import", description=f"استيراد جماعي: تمت إضافة {len(created)} عميل، تم تجاوز {len(skipped)} (موجودين مسبقاً)", username=actor.username)
    db.commit()
    return success_response(data={"created": created, "skipped": skipped}, message_ar=f"تم استيراد {len(created)} عميل بنجاح، تم تجاوز {len(skipped)} عميل موجود مسبقاً")

# ----------------- DEBTS -----------------
@router.get("/debts")
def list_debts(db: Session = Depends(get_db)):
    res = db.scalars(select(Debt)).all()
    return success_response(data=[debt_to_dict(d) for d in res])

@router.post("/debts")
def create_debt(data: DebtCreate, actor: User = Depends(require_permission("إدارة الديون")), db: Session = Depends(get_db)):
    debt = Debt(
        id=data.id,
        customer_id=data.customer_id,
        customer_name=data.customer_name,
        currency=data.currency,
        amount=data.amount,
        paid_amount=0.0,
        remaining_amount=data.amount,
        start_date=data.start_date,
        due_date=data.due_date,
        status="unpaid",
        payment_period=data.payment_period,
        payment_amount=data.payment_amount,
        notes=data.notes,
        transaction_id=data.transaction_id,
        created_by=actor.name,
    )
    db.add(debt)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="Debt", entity_id=data.id,
                     description=f"تسجيل دين جديد للعميل {data.customer_name} بمبلغ {data.amount} {data.currency}", username=actor.username)
    db.commit()
    return success_response(data=debt_to_dict(debt))

@router.post("/debts/{debt_id}/pay")
def pay_debt(debt_id: str, data: DebtPayment, actor: User = Depends(require_permission("إدارة الديون")), db: Session = Depends(get_db)):
    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون مبلغ السداد أكبر من صفر", message_en="Payment amount must be positive", status_code=400)

    debt = db.get(Debt, debt_id)
    if not debt:
        raise APIError(code="NOT_FOUND", message_ar="الدين غير موجود", message_en="Debt not found", status_code=404)

    if data.amount > debt.remaining_amount:
         raise APIError(code="OVERPAYMENT", message_ar="المبلغ المدفوع أكبر من المتبقي", message_en="Amount exceeds remaining debt", status_code=400)
    
    debt.paid_amount += data.amount
    debt.remaining_amount -= data.amount
    
    if debt.remaining_amount <= 0.0:
        debt.status = "paid"
    else:
        debt.status = "partially_paid"

    db.add(DebtPaymentRecord(
        id=new_id(f"debtpay_{debt_id}"), debt_id=debt.id, customer_id=debt.customer_id, customer_name=debt.customer_name,
        currency=debt.currency, amount=data.amount, timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        user=actor.name, notes=data.notes
    ))

    create_audit_log(db, action=AuditAction.UPDATE, entity_type="Debt", entity_id=debt.id, description=f"تسديد دفعة دين بقيمة {data.amount} {debt.currency}")
    db.commit()
    return success_response(data=debt_to_dict(debt))

def debt_payment_to_dict(p: DebtPaymentRecord):
    return {
        "id": p.id,
        "debtId": p.debt_id,
        "customerId": p.customer_id,
        "customerName": p.customer_name,
        "currency": p.currency,
        "amount": p.amount,
        "timestamp": p.timestamp,
        "user": p.user,
        "notes": p.notes,
    }

@router.get("/debt_payments")
def list_debt_payments(db: Session = Depends(get_db)):
    res = db.scalars(select(DebtPaymentRecord).order_by(DebtPaymentRecord.timestamp.desc())).all()
    return success_response(data=[debt_payment_to_dict(p) for p in res])

@router.delete("/debts/{debt_id}")
def delete_debt(debt_id: str, actor: User = Depends(require_permission("إدارة الديون")), db: Session = Depends(get_db)):
    debt = db.get(Debt, debt_id)
    if not debt:
        raise APIError(code="NOT_FOUND", message_ar="الدين غير موجود", message_en="Debt not found", status_code=404)
    for payment in db.scalars(select(DebtPaymentRecord).where(DebtPaymentRecord.debt_id == debt_id)).all():
        db.delete(payment)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="Debt", entity_id=debt_id,
                     description=f"تم حذف دين للعميل {debt.customer_name} بمبلغ {debt.amount} {debt.currency}", username=actor.username)
    db.delete(debt)
    db.commit()
    return success_response(data={"deleted": True})

# ----------------- ADVANCES (سلفة) -----------------
# Unlike a Debt (a pure paper record — creating or paying one never touches any
# balance), an Advance is real cash handed to the customer straight out of a
# vault: creating one debits the vault immediately, and repaying one credits it
# back. Tracked as its own third number on the customer, alongside balance and
# debt, never merged into either.
def advance_to_dict(a: Advance):
    return {
        "id": a.id,
        "customerId": a.customer_id,
        "customerName": a.customer_name,
        "currency": a.currency,
        "amount": a.amount,
        "remainingAmount": a.remaining_amount,
        "vaultId": a.vault_id,
        "vaultName": a.vault_name,
        "bankAccountId": a.bank_account_id,
        "bankAccountName": a.bank_account_name,
        "status": a.status,
        "notes": a.notes,
        "createdBy": a.created_by,
        "timestamp": a.timestamp,
    }

def _advance_equivalent_lyd(db: Session, currency: str, amount: float) -> float:
    if currency == "LYD":
        return amount
    rate_row = db.scalar(select(ExchangeRate).where(ExchangeRate.from_currency == currency, ExchangeRate.to_currency == "LYD"))
    return amount * rate_row.sell_rate if rate_row else amount

def _resolve_advance_source(db: Session, vault_id: str | None, bank_account_id: str | None, currency: str):
    """A سلفة can be funded from a vault or a bank account — exactly one of the
    two. Returns (kind, obj, label, balance_before). A bank account only ever
    holds one currency, so its currency must match the advance's exactly."""
    if bool(vault_id) == bool(bank_account_id):
        raise APIError(code="INVALID_SOURCE", message_ar="حدد خزنة أو حساب بنكي واحد فقط كمصدر", message_en="Provide exactly one of vault_id or bank_account_id", status_code=400)
    if vault_id:
        vault = db.get(Vault, vault_id)
        if not vault:
            raise APIError(code="VAULT_NOT_FOUND", message_ar="الخزنة المحددة غير موجودة", message_en="Vault not found", status_code=400)
        return "vault", vault, vault.name, vault.balances.get(currency, 0.0)
    bank_acc = db.get(BankAccount, bank_account_id)
    if not bank_acc:
        raise APIError(code="BANK_ACCOUNT_NOT_FOUND", message_ar="الحساب البنكي المحدد غير موجود", message_en="Bank account not found", status_code=400)
    if bank_acc.currency != currency:
        raise APIError(code="CURRENCY_MISMATCH", message_ar=f"عملة الحساب البنكي ({bank_acc.currency}) لا تطابق عملة السلفة ({currency})", message_en="Bank account currency does not match the advance currency", status_code=400)
    return "bank_account", bank_acc, f"{bank_acc.bank_name} - {bank_acc.account_name}", bank_acc.balance

def _apply_source_delta(source_kind: str, source_obj, currency: str, delta: float, timestamp: str) -> float:
    """Applies delta (positive = increase, negative = decrease) to a vault or bank
    account's balance and returns the resulting balance."""
    if source_kind == "vault":
        bals = source_obj.balances.copy()
        after = bals.get(currency, 0.0) + delta
        bals[currency] = after
        source_obj.balances = bals
    else:
        after = source_obj.balance + delta
        source_obj.balance = after
    source_obj.last_movement = timestamp
    return after

@router.get("/advances")
def list_advances(db: Session = Depends(get_db)):
    res = db.scalars(select(Advance).order_by(Advance.timestamp.desc())).all()
    return success_response(data=[advance_to_dict(a) for a in res])

@router.post("/advances")
def create_advance(data: AdvanceCreate, actor: User = Depends(require_permission("إدارة الديون")), db: Session = Depends(get_db)):
    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون مبلغ السلفة أكبر من صفر", message_en="Advance amount must be positive", status_code=400)
    customer = db.get(Customer, data.customer_id)
    if not customer:
        raise APIError(code="CUSTOMER_NOT_FOUND", message_ar="العميل غير موجود", message_en="Customer not found", status_code=404)
    source_kind, source_obj, source_label, source_before = _resolve_advance_source(db, data.vault_id, data.bank_account_id, data.currency)
    if source_before < data.amount:
        raise APIError(code="INSUFFICIENT_BALANCE", message_ar=f"الرصيد المتاح في {source_label} غير كافٍ ({source_before} {data.currency})", message_en="Insufficient balance", status_code=400)

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    source_after = _apply_source_delta(source_kind, source_obj, data.currency, -data.amount, timestamp)

    advance = Advance(
        id=data.id, customer_id=customer.id, customer_name=customer.name, currency=data.currency,
        amount=data.amount, remaining_amount=data.amount,
        vault_id=source_obj.id if source_kind == "vault" else None, vault_name=source_label if source_kind == "vault" else None,
        bank_account_id=source_obj.id if source_kind == "bank_account" else None, bank_account_name=source_label if source_kind == "bank_account" else None,
        status="active", notes=data.notes, created_by=actor.name, timestamp=timestamp
    )
    db.add(advance)

    db.add(Movement(
        id=new_id(f"m_advance_{data.id}"), timestamp=timestamp, entity_type=source_kind, entity_id=source_obj.id,
        entity_name=source_label, currency=data.currency, type="صرف سلفة لعميل",
        amount_in=0.0, amount_out=data.amount, balance_before=source_before, balance_after=source_after,
        reference_id=data.id, user=actor.name
    ))

    equivalent_lyd = _advance_equivalent_lyd(db, data.currency, data.amount)
    source_account_kind = "خزينة" if source_kind == "vault" else "حساب بنكي"
    db.add(JournalEntry(
        id=f"JV-{datetime.utcnow().strftime('%Y%m%d')}-{data.id}", date=timestamp,
        tx_type="صرف سلفة", reference=data.id,
        description=f"صرف سلفة بقيمة {data.amount} {data.currency} للعميل {customer.name} من {source_account_kind} {source_label}",
        user=actor.name, status="approved",
        lines=[
            {"accountName": f"سلفة العميل {customer.name} - {data.currency}", "currency": data.currency, "debit": data.amount, "credit": 0.0, "originalAmount": data.amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd},
            {"accountName": f"{source_account_kind} {source_label} - {data.currency}", "currency": data.currency, "debit": 0.0, "credit": data.amount, "originalAmount": data.amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd},
        ]
    ))

    create_audit_log(db, action=AuditAction.CREATE, entity_type="Advance", entity_id=data.id,
                     description=f"صرف سلفة بقيمة {data.amount} {data.currency} للعميل {customer.name} من {source_account_kind} {source_label}", username=actor.username)
    db.commit()
    return success_response(data=advance_to_dict(advance), message_ar="تم صرف السلفة بنجاح")

@router.post("/advances/{advance_id}/pay")
def pay_advance(advance_id: str, data: AdvancePaymentOp, actor: User = Depends(require_permission("إدارة الديون")), db: Session = Depends(get_db)):
    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون مبلغ السداد أكبر من صفر", message_en="Payment amount must be positive", status_code=400)
    advance = db.get(Advance, advance_id)
    if not advance:
        raise APIError(code="NOT_FOUND", message_ar="السلفة غير موجودة", message_en="Advance not found", status_code=404)
    if data.amount > advance.remaining_amount:
        raise APIError(code="OVERPAYMENT", message_ar="المبلغ المدفوع أكبر من المتبقي", message_en="Amount exceeds remaining advance", status_code=400)
    source_kind, source_obj, source_label, source_before = _resolve_advance_source(db, data.vault_id, data.bank_account_id, advance.currency)

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    source_after = _apply_source_delta(source_kind, source_obj, advance.currency, data.amount, timestamp)

    advance.remaining_amount -= data.amount
    if advance.remaining_amount <= 0.0:
        advance.remaining_amount = 0.0
        advance.status = "paid"

    db.add(AdvancePaymentRecord(
        id=new_id(f"advpay_{advance_id}"), advance_id=advance.id, customer_id=advance.customer_id, customer_name=advance.customer_name,
        currency=advance.currency, amount=data.amount,
        vault_id=source_obj.id if source_kind == "vault" else None, vault_name=source_label if source_kind == "vault" else None,
        bank_account_id=source_obj.id if source_kind == "bank_account" else None, bank_account_name=source_label if source_kind == "bank_account" else None,
        timestamp=timestamp, user=actor.name, notes=data.notes
    ))

    db.add(Movement(
        id=new_id(f"m_advpay_{advance_id}"), timestamp=timestamp, entity_type=source_kind, entity_id=source_obj.id,
        entity_name=source_label, currency=advance.currency, type="تحصيل سداد سلفة من عميل",
        amount_in=data.amount, amount_out=0.0, balance_before=source_before, balance_after=source_after,
        reference_id=advance_id, user=actor.name
    ))

    equivalent_lyd = _advance_equivalent_lyd(db, advance.currency, data.amount)
    source_account_kind = "خزينة" if source_kind == "vault" else "حساب بنكي"
    db.add(JournalEntry(
        id=new_id(f"JV-{advance_id}"), date=timestamp,
        tx_type="تسديد سلفة", reference=advance_id,
        description=f"تسديد دفعة سلفة بقيمة {data.amount} {advance.currency} من العميل {advance.customer_name} إلى {source_account_kind} {source_label}",
        user=actor.name, status="approved",
        lines=[
            {"accountName": f"{source_account_kind} {source_label} - {advance.currency}", "currency": advance.currency, "debit": data.amount, "credit": 0.0, "originalAmount": data.amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd},
            {"accountName": f"سلفة العميل {advance.customer_name} - {advance.currency}", "currency": advance.currency, "debit": 0.0, "credit": data.amount, "originalAmount": data.amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd},
        ]
    ))

    create_audit_log(db, action=AuditAction.UPDATE, entity_type="Advance", entity_id=advance.id,
                     description=f"تسديد دفعة سلفة بقيمة {data.amount} {advance.currency}", username=actor.username)
    db.commit()
    return success_response(data=advance_to_dict(advance), message_ar="تم تسديد الدفعة بنجاح")

def advance_payment_to_dict(p: AdvancePaymentRecord):
    return {
        "id": p.id,
        "advanceId": p.advance_id,
        "customerId": p.customer_id,
        "customerName": p.customer_name,
        "currency": p.currency,
        "amount": p.amount,
        "vaultId": p.vault_id,
        "vaultName": p.vault_name,
        "bankAccountId": p.bank_account_id,
        "bankAccountName": p.bank_account_name,
        "timestamp": p.timestamp,
        "user": p.user,
        "notes": p.notes,
    }

@router.get("/advance_payments")
def list_advance_payments(db: Session = Depends(get_db)):
    res = db.scalars(select(AdvancePaymentRecord).order_by(AdvancePaymentRecord.timestamp.desc())).all()
    return success_response(data=[advance_payment_to_dict(p) for p in res])

@router.delete("/advances/{advance_id}")
def delete_advance(advance_id: str, actor: User = Depends(require_permission("إدارة الديون")), db: Session = Depends(get_db)):
    """Deleting a سلفة is different from deleting a Debt: real cash left the
    vault/bank account when it was created, so any still-outstanding amount is
    credited back to its source before the record is removed — otherwise that
    cash would simply vanish from the books with no trace."""
    advance = db.get(Advance, advance_id)
    if not advance:
        raise APIError(code="NOT_FOUND", message_ar="السلفة غير موجودة", message_en="Advance not found", status_code=404)

    if advance.remaining_amount > 0:
        source_kind, source_obj, source_label, source_before = _resolve_advance_source(db, advance.vault_id, advance.bank_account_id, advance.currency)
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
        source_after = _apply_source_delta(source_kind, source_obj, advance.currency, advance.remaining_amount, timestamp)

        db.add(Movement(
            id=new_id(f"m_advdel_{advance_id}"), timestamp=timestamp, entity_type=source_kind, entity_id=source_obj.id,
            entity_name=source_label, currency=advance.currency, type="إلغاء سلفة لعميل",
            amount_in=advance.remaining_amount, amount_out=0.0, balance_before=source_before, balance_after=source_after,
            reference_id=advance_id, user=actor.name
        ))

        equivalent_lyd = _advance_equivalent_lyd(db, advance.currency, advance.remaining_amount)
        source_account_kind = "خزينة" if source_kind == "vault" else "حساب بنكي"
        db.add(JournalEntry(
            id=new_id(f"JV-{advance_id}"), date=timestamp,
            tx_type="إلغاء سلفة", reference=advance_id,
            description=f"إلغاء سلفة بقيمة {advance.remaining_amount} {advance.currency} للعميل {advance.customer_name} — إعادة إلى {source_account_kind} {source_label}",
            user=actor.name, status="approved",
            lines=[
                {"accountName": f"{source_account_kind} {source_label} - {advance.currency}", "currency": advance.currency, "debit": advance.remaining_amount, "credit": 0.0, "originalAmount": advance.remaining_amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd},
                {"accountName": f"سلفة العميل {advance.customer_name} - {advance.currency}", "currency": advance.currency, "debit": 0.0, "credit": advance.remaining_amount, "originalAmount": advance.remaining_amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd},
            ]
        ))

    for payment in db.scalars(select(AdvancePaymentRecord).where(AdvancePaymentRecord.advance_id == advance_id)).all():
        db.delete(payment)

    create_audit_log(db, action=AuditAction.DELETE, entity_type="Advance", entity_id=advance_id,
                     description=f"تم حذف سلفة للعميل {advance.customer_name} بمبلغ {advance.amount} {advance.currency}", username=actor.username)
    db.delete(advance)
    db.commit()
    return success_response(data={"deleted": True})

# ----------------- COMMISSION / FEE RULES -----------------
class CommissionRuleCreate(BaseModel):
    id: str
    name: str
    currency: str | None = None
    customer_type: str | None = None
    min_amount: float = 0.0
    max_amount: float | None = None
    rate_type: str = "percentage"  # percentage, fixed
    rate_value: float
    priority: int = 0
    is_active: bool = True

def commission_rule_to_dict(r: CommissionRule):
    return {
        "id": r.id,
        "name": r.name,
        "currency": r.currency,
        "customerType": r.customer_type,
        "minAmount": r.min_amount,
        "maxAmount": r.max_amount,
        "rateType": r.rate_type,
        "rateValue": r.rate_value,
        "priority": r.priority,
        "isActive": r.is_active,
    }

@router.get("/commission_rules")
def list_commission_rules(db: Session = Depends(get_db)):
    res = db.scalars(select(CommissionRule).order_by(CommissionRule.priority.desc())).all()
    return success_response(data=[commission_rule_to_dict(r) for r in res])

@router.post("/commission_rules")
def create_commission_rule(data: CommissionRuleCreate, actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    if db.get(CommissionRule, data.id):
        raise APIError(code="RULE_EXISTS", message_ar="رمز القاعدة موجود بالفعل", message_en="Rule ID already exists", status_code=400)
    rule = CommissionRule(**data.model_dump())
    db.add(rule)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="CommissionRule", entity_id=rule.id, description=f"تمت إضافة قاعدة عمولة جديدة: {rule.name}", username=actor.username)
    db.commit()
    return success_response(data=commission_rule_to_dict(rule), message_ar="تمت إضافة القاعدة بنجاح")

@router.put("/commission_rules/{rule_id}")
def update_commission_rule(rule_id: str, data: CommissionRuleCreate, actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    rule = db.get(CommissionRule, rule_id)
    if not rule:
        raise APIError(code="NOT_FOUND", message_ar="القاعدة غير موجودة", message_en="Rule not found", status_code=404)
    for field in ["name", "currency", "customer_type", "min_amount", "max_amount", "rate_type", "rate_value", "priority", "is_active"]:
        setattr(rule, field, getattr(data, field))
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="CommissionRule", entity_id=rule_id, description=f"تم تعديل قاعدة العمولة: {rule.name}", username=actor.username)
    db.commit()
    return success_response(data=commission_rule_to_dict(rule), message_ar="تم تعديل القاعدة بنجاح")

@router.delete("/commission_rules/{rule_id}")
def delete_commission_rule(rule_id: str, actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    rule = db.get(CommissionRule, rule_id)
    if not rule:
        raise APIError(code="NOT_FOUND", message_ar="القاعدة غير موجودة", message_en="Rule not found", status_code=404)
    db.delete(rule)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="CommissionRule", entity_id=rule_id, description=f"تم حذف قاعدة العمولة: {rule.name}", username=actor.username)
    db.commit()
    return success_response(message_ar="تم حذف القاعدة بنجاح")

# ----------------- POS OPERATIONS & TRANSACTIONS -----------------
@router.get("/transactions")
def list_transactions(db: Session = Depends(get_db)):
    res = db.scalars(select(Transaction)).all()
    return success_response(data=[transaction_to_dict(t) for t in res])

def _transactions_export_rows(db: Session):
    res = db.scalars(select(Transaction).order_by(Transaction.timestamp.desc())).all()
    headers = ["رقم العملية", "النوع", "التاريخ", "العميل", "الخزنة", "من عملة", "إلى عملة", "المبلغ", "السعر", "العمولة", "الإجمالي", "طريقة الدفع", "الحالة", "المستخدم"]
    rows = [[
        t.id, TX_TYPE_LABELS_AR.get(t.type, t.type), t.timestamp, t.customer_name, t.vault_name, t.from_currency, t.to_currency,
        t.amount, t.rate, t.commission, t.total_amount, PAYMENT_METHOD_LABELS_AR.get(t.payment_method, t.payment_method),
        TX_STATUS_LABELS_AR.get(t.status, t.status), t.user,
    ] for t in res]
    return "سجل العمليات", headers, rows

@router.get("/transactions/export")
def export_transactions(format: str = "xlsx", actor: User = Depends(require_permission("رؤية سجل العمليات")), db: Session = Depends(get_db)):
    title, headers, rows = _transactions_export_rows(db)
    if format == "xlsx":
        buf = build_excel(title, headers, rows)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": 'attachment; filename="transactions.xlsx"'})
    try:
        buf = build_pdf(title, headers, rows)
    except ArabicFontUnavailable as e:
        raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء ملف PDF: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="transactions.pdf"'})

@router.post("/transactions/send_whatsapp")
def send_transactions_export_whatsapp(format: str = "pdf", actor: User = Depends(require_permission("رؤية سجل العمليات")), db: Session = Depends(get_db)):
    manager_phone = get_whatsapp_setting(db, "whatsappManagerPhone", "")
    if not manager_phone:
        raise APIError(code="NO_PHONE", message_ar="لم يتم تحديد رقم هاتف المدير في الإعدادات لاستقبال التقارير", message_en="No manager phone configured in settings to receive reports", status_code=400)
    title, headers, rows = _transactions_export_rows(db)
    if format == "xlsx":
        content, ext = build_excel(title, headers, rows).read(), "xlsx"
    else:
        try:
            content, ext = build_pdf(title, headers, rows).read(), "pdf"
        except ArabicFontUnavailable as e:
            raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء ملف PDF: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)
    result = send_whatsapp_document(db, manager_phone, content, f"{title}.{ext}", caption=title)
    if not result.get("sent"):
        raise APIError(code="WHATSAPP_SEND_FAILED", message_ar="تعذر إرسال التقرير عبر واتساب — تأكد من إعداد بوابة واتساب من الإعدادات", message_en=f"WhatsApp send failed: {result.get('reason')}", status_code=502)
    create_audit_log(db, action=AuditAction.SYSTEM_ALERT, entity_type="Report", entity_id="transactions", description=f"تم إرسال تقرير {title} عبر واتساب إلى {manager_phone}", username=actor.username)
    db.commit()
    return success_response(data={"sent": True}, message_ar="تم إرسال التقرير عبر واتساب بنجاح")

_RECEIPT_TYPE_LABELS = TX_TYPE_LABELS_AR
_RECEIPT_PAYMENT_LABELS = PAYMENT_METHOD_LABELS_AR

def _build_transaction_receipt(db: Session, transaction_id: str):
    """Builds the receipt PDF for a transaction id — falling back to its
    CustomerAccountEntry when there's no Transaction row (a bank-funded customer
    deposit/withdrawal never gets one, since Transaction.vault_id is required and
    there's no vault involved). Returns (pdf_bytes, filename, customer_phone)."""
    t = db.get(Transaction, transaction_id)
    if not t:
        entry = db.get(CustomerAccountEntry, transaction_id)
        if not entry:
            raise APIError(code="NOT_FOUND", message_ar="العملية غير موجودة", message_en="Transaction not found", status_code=404)
        fields = [
            ("رقم العملية", entry.id),
            ("التاريخ", entry.timestamp),
            ("نوع العملية", _RECEIPT_TYPE_LABELS.get(entry.type, entry.type)),
            ("العميل", entry.customer_name),
            ("المصدر", entry.bank_account_name or entry.vault_name or entry.other_source or "—"),
            ("العملة", entry.currency),
            ("المبلغ", f"{entry.amount:,.2f}"),
            ("الموظف المنفذ", entry.user),
        ]
        if entry.notes:
            fields.append(("ملاحظات", entry.notes))
        try:
            buf = build_receipt_pdf("إيصال عملية", "شركة واكب للخدمات المالية", fields, footer="هذا الإيصال صادر آلياً من نظام واكب ولا يحتاج توقيعاً")
        except ArabicFontUnavailable as e:
            raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء الإيصال: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)
        customer = db.get(Customer, entry.customer_id) if entry.customer_id else None
        return buf.read(), f"receipt_{entry.id}.pdf", customer.phone if customer else None

    fields = [
        ("رقم العملية", t.id),
        ("التاريخ", t.timestamp),
        ("نوع العملية", _RECEIPT_TYPE_LABELS.get(t.type, t.type)),
        ("العميل", t.customer_name or "—"),
        ("الفرع", t.branch),
        ("الخزنة", t.vault_name),
    ]
    if t.type in ("buy", "sell", "exchange"):
        fields += [
            ("من عملة", t.from_currency),
            ("إلى عملة", t.to_currency),
            ("الكمية", f"{t.amount:,.2f}"),
            ("السعر", f"{t.rate:,.4f}"),
            ("العمولة", f"{t.commission:,.2f}"),
            ("الإجمالي", f"{t.total_amount:,.2f}"),
            ("طريقة الدفع", _RECEIPT_PAYMENT_LABELS.get(t.payment_method, t.payment_method)),
        ]
    else:
        fields += [
            ("العملة", t.from_currency),
            ("المبلغ", f"{t.amount:,.2f}"),
        ]
    fields.append(("الموظف المنفذ", t.user))
    if t.notes:
        fields.append(("ملاحظات", t.notes))

    try:
        buf = build_receipt_pdf("إيصال عملية", "شركة واكب للخدمات المالية", fields, footer="هذا الإيصال صادر آلياً من نظام واكب ولا يحتاج توقيعاً")
    except ArabicFontUnavailable as e:
        raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء الإيصال: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)
    customer = db.get(Customer, t.customer_id) if t.customer_id else None
    return buf.read(), f"receipt_{t.id}.pdf", customer.phone if customer else None

@router.get("/transactions/{transaction_id}/receipt")
def get_transaction_receipt(transaction_id: str, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pdf_bytes, filename, _ = _build_transaction_receipt(db, transaction_id)
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})

@router.post("/transactions/{transaction_id}/send_receipt_whatsapp")
def send_transaction_receipt_whatsapp(transaction_id: str, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pdf_bytes, filename, customer_phone = _build_transaction_receipt(db, transaction_id)
    if not customer_phone:
        raise APIError(code="NO_PHONE", message_ar="لا يوجد رقم هاتف مسجل لعميل هذه العملية", message_en="This transaction's customer has no phone number on file", status_code=400)
    result = send_whatsapp_document(db, customer_phone, pdf_bytes, filename, caption="إيصال عملية")
    if not result.get("sent"):
        raise APIError(code="WHATSAPP_SEND_FAILED", message_ar="تعذر إرسال الإيصال عبر واتساب — تأكد من إعداد بوابة واتساب من الإعدادات", message_en=f"WhatsApp send failed: {result.get('reason')}", status_code=502)
    create_audit_log(db, action=AuditAction.SYSTEM_ALERT, entity_type="Transaction", entity_id=transaction_id, description=f"تم إرسال إيصال العملية {transaction_id} عبر واتساب إلى {customer_phone}")
    db.commit()
    return success_response(data={"sent": True}, message_ar="تم إرسال الإيصال عبر واتساب بنجاح")

_DEBT_STATUS_LABELS = {"unpaid": "غير مسدد", "partially_paid": "مسدد جزئياً", "paid": "مسدد بالكامل"}
_DEBT_PERIOD_LABELS = {"monthly": "شهري", "daily": "يومي", "none": "بدون جدول سداد"}

def _build_debt_receipt(db: Session, debt_id: str):
    d = db.get(Debt, debt_id)
    if not d:
        raise APIError(code="NOT_FOUND", message_ar="الدين غير موجود", message_en="Debt not found", status_code=404)

    fields = [
        ("رقم الدين", d.id),
        ("تاريخ البدء", d.start_date),
        ("تاريخ الاستحقاق", d.due_date),
        ("العميل", d.customer_name),
        ("قيمة الدين", f"{d.amount:,.2f} {d.currency}"),
        ("المسدد", f"{d.paid_amount:,.2f} {d.currency}"),
        ("المتبقي", f"{d.remaining_amount:,.2f} {d.currency}"),
        ("جدول السداد", _DEBT_PERIOD_LABELS.get(d.payment_period, d.payment_period)),
        ("الحالة", _DEBT_STATUS_LABELS.get(d.status, d.status)),
    ]
    if d.notes:
        fields.append(("ملاحظات", d.notes))

    try:
        buf = build_receipt_pdf("إيصال دين", "شركة واكب للخدمات المالية", fields, footer="هذا الإيصال صادر آلياً من نظام واكب ولا يحتاج توقيعاً")
    except ArabicFontUnavailable as e:
        raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء الإيصال: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)
    customer = db.get(Customer, d.customer_id) if d.customer_id else None
    return buf.read(), f"debt_receipt_{d.id}.pdf", customer.phone if customer else None

@router.get("/debts/{debt_id}/receipt")
def get_debt_receipt(debt_id: str, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pdf_bytes, filename, _ = _build_debt_receipt(db, debt_id)
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})

@router.post("/debts/{debt_id}/send_receipt_whatsapp")
def send_debt_receipt_whatsapp(debt_id: str, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pdf_bytes, filename, customer_phone = _build_debt_receipt(db, debt_id)
    if not customer_phone:
        raise APIError(code="NO_PHONE", message_ar="لا يوجد رقم هاتف مسجل لعميل هذا الدين", message_en="This debt's customer has no phone number on file", status_code=400)
    result = send_whatsapp_document(db, customer_phone, pdf_bytes, filename, caption="إيصال دين")
    if not result.get("sent"):
        raise APIError(code="WHATSAPP_SEND_FAILED", message_ar="تعذر إرسال الإيصال عبر واتساب — تأكد من إعداد بوابة واتساب من الإعدادات", message_en=f"WhatsApp send failed: {result.get('reason')}", status_code=502)
    create_audit_log(db, action=AuditAction.SYSTEM_ALERT, entity_type="Debt", entity_id=debt_id, description=f"تم إرسال إيصال الدين {debt_id} عبر واتساب إلى {customer_phone}")
    db.commit()
    return success_response(data={"sent": True}, message_ar="تم إرسال الإيصال عبر واتساب بنجاح")

@router.get("/movements")
def list_movements(vault_id: str = "", entity_type: str = "vault", entity_id: str = "", date_from: str = "", date_to: str = "", db: Session = Depends(get_db)):
    """entity_type defaults to "vault" for backward compatibility with the existing
    vault movements tab; pass entity_type="bank_account" (+ entity_id, or the legacy
    vault_id param) to get the same feed for a bank account instead."""
    query = select(Movement).where(Movement.entity_type == entity_type)
    target_id = entity_id or vault_id
    if target_id:
        query = query.where(Movement.entity_id == target_id)
    if date_from:
        query = query.where(Movement.timestamp >= date_from)
    if date_to:
        query = query.where(Movement.timestamp <= date_to + " 23:59:59")
    query = query.order_by(Movement.timestamp.desc())
    res = db.scalars(query).all()
    return success_response(data=[movement_to_dict(m) for m in res])

class ManualEntryOp(BaseModel):
    direction: str  # in, out
    currency: str
    amount: float
    description: str
    notes: str | None = None

def _apply_manual_entry(db: Session, entity_kind: str, entity_obj, entity_label: str, data: ManualEntryOp, actor: User):
    """Shared "أخرى" manual adjustment for a vault or bank account — a plain
    cash in/out with a free-text reason, not tied to a customer or any of the
    other tracked operations (deposit/withdraw/debt/سلفة)."""
    if data.direction not in ("in", "out"):
        raise APIError(code="INVALID_DIRECTION", message_ar="اتجاه العملية يجب أن يكون قيد أو صرف", message_en="direction must be 'in' or 'out'", status_code=400)
    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون المبلغ أكبر من صفر", message_en="Amount must be positive", status_code=400)
    if not data.description.strip():
        raise APIError(code="INVALID_DESCRIPTION", message_ar="وصف العملية مطلوب", message_en="Description is required", status_code=400)

    before = entity_obj.balances.get(data.currency, 0.0) if entity_kind == "vault" else entity_obj.balance
    if data.direction == "out" and before < data.amount:
        raise APIError(code="INSUFFICIENT_BALANCE", message_ar=f"الرصيد المتاح غير كافٍ ({before} {data.currency})", message_en="Insufficient balance", status_code=400)

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    delta = data.amount if data.direction == "in" else -data.amount
    after = _apply_source_delta(entity_kind, entity_obj, data.currency, delta, timestamp)

    entry_id = new_id(f"me_{entity_obj.id}")
    db.add(Movement(
        id=entry_id, timestamp=timestamp, entity_type=entity_kind, entity_id=entity_obj.id,
        entity_name=entity_label, currency=data.currency, type=f"قيد يدوي: {data.description.strip()}",
        amount_in=data.amount if data.direction == "in" else 0.0, amount_out=data.amount if data.direction == "out" else 0.0,
        balance_before=before, balance_after=after, reference_id=entry_id, user=actor.name
    ))

    equivalent_lyd = _advance_equivalent_lyd(db, data.currency, data.amount)
    source_account_kind = "خزينة" if entity_kind == "vault" else "حساب بنكي"
    db.add(JournalEntry(
        id=new_id(f"JV-{entry_id}"), date=timestamp, tx_type="قيد يدوي", reference=entry_id,
        description=f"قيد يدوي ({data.description.strip()}) بقيمة {data.amount} {data.currency} على {source_account_kind} {entity_label}",
        user=actor.name, status="approved",
        lines=[
            {"accountName": f"{source_account_kind} {entity_label} - {data.currency}", "currency": data.currency, "debit": data.amount if data.direction == "in" else 0.0, "credit": data.amount if data.direction == "out" else 0.0, "originalAmount": data.amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd},
            {"accountName": f"قيود يدوية متنوعة - {data.currency}", "currency": data.currency, "debit": data.amount if data.direction == "out" else 0.0, "credit": data.amount if data.direction == "in" else 0.0, "originalAmount": data.amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd},
        ]
    ))

    create_audit_log(db, action=AuditAction.CREATE, entity_type="ManualEntry", entity_id=entry_id,
                     description=f"قيد يدوي ({data.description.strip()}) بقيمة {data.amount} {data.currency} على {source_account_kind} {entity_label}", username=actor.username)
    db.commit()

@router.post("/vaults/{vault_id}/manual_entry")
def manual_vault_entry(vault_id: str, data: ManualEntryOp, actor: User = Depends(require_permission("إدارة الخزنات")), db: Session = Depends(get_db)):
    vault = db.get(Vault, vault_id)
    if not vault:
        raise APIError(code="VAULT_NOT_FOUND", message_ar="الخزنة المحددة غير موجودة", message_en="Vault not found", status_code=400)
    _apply_manual_entry(db, "vault", vault, vault.name, data, actor)
    return success_response(data={"id": vault.id, "balances": vault.balances}, message_ar="تم تسجيل القيد اليدوي بنجاح")

@router.post("/bank_accounts/{account_id}/manual_entry")
def manual_bank_entry(account_id: str, data: ManualEntryOp, actor: User = Depends(require_permission("إدارة البنوك")), db: Session = Depends(get_db)):
    account = db.get(BankAccount, account_id)
    if not account:
        raise APIError(code="BANK_ACCOUNT_NOT_FOUND", message_ar="الحساب البنكي المحدد غير موجود", message_en="Bank account not found", status_code=400)
    if data.currency != account.currency:
        raise APIError(code="CURRENCY_MISMATCH", message_ar=f"عملة الحساب البنكي ({account.currency}) لا تطابق عملة القيد ({data.currency})", message_en="Bank account currency mismatch", status_code=400)
    _apply_manual_entry(db, "bank_account", account, f"{account.bank_name} - {account.account_name}", data, actor)
    return success_response(data=bank_account_to_dict(account), message_ar="تم تسجيل القيد اليدوي بنجاح")

def _categorize_movement_type(t: str) -> str:
    """Same categorization the on-screen vault/bank statement modal uses
    client-side — kept here too so the exported PDF/Excel matches it exactly."""
    if "سلفة" in t:
        return "advance"
    if t.startswith("قيد يدوي"):
        return "manual"
    if "فائدة وديعة" in t:
        return "interest"
    if "حساب عميل" in t:
        return "customer"
    if "إلى بنك" in t or "من بنك" in t or "حساب بنكي" in t:
        return "transfer_direct"
    if any(k in t for k in ("عملة ورقية", "تبديل عملة", "مقبوضات صرافة", "مدفوعات صرافة")) or t.startswith("عكس عملية"):
        return "trade"
    return "other"

def _entity_statement_sections(db: Session, entity_kind: str, entity_id: str, date_from: str = "", date_to: str = "", currency: str = ""):
    """Builds the same separated sections as the on-screen vault/bank account
    statement — معاملات الصرافة / إيداع وسحب العملاء / السلف / فوائد بنكية /
    قيود يدوية / تحويلات مباشرة مع خزنة أو بنك / أخرى, plus a "التحويلات بين
    الحسابات" section from the Transfer/approval system — for the PDF/Excel
    export and WhatsApp send. Returns (sections, closing_line)."""
    mv_query = select(Movement).where(Movement.entity_type == entity_kind, Movement.entity_id == entity_id)
    if date_from:
        mv_query = mv_query.where(Movement.timestamp >= date_from)
    if date_to:
        mv_query = mv_query.where(Movement.timestamp <= date_to + " 23:59:59")
    if currency:
        mv_query = mv_query.where(Movement.currency == currency)
    movements = db.scalars(mv_query.order_by(Movement.timestamp)).all()

    groups: dict[str, list[Movement]] = {"trade": [], "customer": [], "advance": [], "interest": [], "manual": [], "transfer_direct": [], "other": []}
    for m in movements:
        groups[_categorize_movement_type(m.type)].append(m)

    mv_headers = ["م", "الوقت", "النوع", "المبلغ", "الرصيد بعد", "بواسطة"]

    def mv_rows(items: list[Movement]) -> list[list]:
        rows = []
        for i, m in enumerate(items, start=1):
            is_in = m.amount_in > 0
            amount_str = f"{'+' if is_in else '-'}{(m.amount_in if is_in else m.amount_out):,.2f} {m.currency}"
            rows.append([str(i), m.timestamp, m.type, amount_str, f"{m.balance_after:,.2f}", m.user])
        return rows

    sections = [
        ("معاملات الصرافة", mv_headers, mv_rows(groups["trade"])),
        ("إيداع وسحب العملاء", mv_headers, mv_rows(groups["customer"])),
        ("السلف", mv_headers, mv_rows(groups["advance"])),
        ("فوائد بنكية", mv_headers, mv_rows(groups["interest"])),
        ("قيود يدوية", mv_headers, mv_rows(groups["manual"])),
        ("تحويلات مباشرة مع خزنة/بنك", mv_headers, mv_rows(groups["transfer_direct"])),
        ("أخرى", mv_headers, mv_rows(groups["other"])),
    ]

    # Transfers via the approval system — only ones actually approved, since a
    # pending/rejected transfer never moved any cash.
    tr_query = select(Transfer).where(Transfer.status == "approved", or_(Transfer.source_id == entity_id, Transfer.dest_id == entity_id))
    if currency:
        tr_query = tr_query.where(Transfer.currency == currency)
    transfers = db.scalars(tr_query.order_by(Transfer.timestamp)).all()
    if date_from:
        transfers = [t for t in transfers if t.timestamp[:10] >= date_from]
    if date_to:
        transfers = [t for t in transfers if t.timestamp[:10] <= date_to]

    tr_headers = ["م", "الوقت", "من", "إلى", "المبلغ", "بواسطة"]
    tr_rows = []
    for i, t in enumerate(transfers, start=1):
        is_in = t.dest_id == entity_id
        amount_str = f"{'+' if is_in else '-'}{t.amount:,.2f} {t.currency}"
        tr_rows.append([str(i), t.timestamp, t.source_name, t.dest_name, amount_str, t.requested_by])
    sections.append(("التحويلات بين الحسابات", tr_headers, tr_rows))

    totals: dict[str, dict[str, float]] = {}
    for m in movements:
        t = totals.setdefault(m.currency, {"in": 0.0, "out": 0.0})
        t["in"] += m.amount_in
        t["out"] += m.amount_out
    closing_line = "الإجمالي: " + (
        ", ".join(f"{ccy} — دخول {v['in']:,.2f} / خروج {v['out']:,.2f}" for ccy, v in totals.items())
        or "لا توجد حركات في هذه الفترة"
    )
    return sections, closing_line

def _entity_statement_export(db: Session, entity_kind: str, entity_id: str, entity_name: str, format: str, date_from: str, date_to: str, currency: str):
    sections, closing_line = _entity_statement_sections(db, entity_kind, entity_id, date_from, date_to, currency)
    if format == "xlsx":
        buf = build_sectioned_excel(sections)
        return buf.read(), "xlsx"
    try:
        buf = build_sectioned_pdf(f"كشف حساب — {entity_name}", sections, closing_line)
    except ArabicFontUnavailable as e:
        raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء كشف الحساب: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)
    return buf.read(), "pdf"

@router.get("/vaults/{vault_id}/statement/export")
def export_vault_statement(vault_id: str, format: str = "pdf", date_from: str = "", date_to: str = "", currency: str = "", actor: User = Depends(require_permission("إدارة الخزنات")), db: Session = Depends(get_db)):
    vault = db.get(Vault, vault_id)
    if not vault:
        raise APIError(code="VAULT_NOT_FOUND", message_ar="الخزنة المحددة غير موجودة", message_en="Vault not found", status_code=400)
    content, ext = _entity_statement_export(db, "vault", vault_id, vault.name, format, date_from, date_to, currency)
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if ext == "xlsx" else "application/pdf"
    disposition = "attachment" if ext == "xlsx" else "inline"
    return StreamingResponse(io.BytesIO(content), media_type=media_type, headers={"Content-Disposition": f'{disposition}; filename="statement_{vault_id}.{ext}"'})

@router.get("/bank_accounts/{account_id}/statement/export")
def export_bank_account_statement(account_id: str, format: str = "pdf", date_from: str = "", date_to: str = "", currency: str = "", actor: User = Depends(require_permission("إدارة البنوك")), db: Session = Depends(get_db)):
    account = db.get(BankAccount, account_id)
    if not account:
        raise APIError(code="BANK_ACCOUNT_NOT_FOUND", message_ar="الحساب البنكي المحدد غير موجود", message_en="Bank account not found", status_code=400)
    content, ext = _entity_statement_export(db, "bank_account", account_id, f"{account.bank_name} - {account.account_name}", format, date_from, date_to, currency)
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if ext == "xlsx" else "application/pdf"
    disposition = "attachment" if ext == "xlsx" else "inline"
    return StreamingResponse(io.BytesIO(content), media_type=media_type, headers={"Content-Disposition": f'{disposition}; filename="statement_{account_id}.{ext}"'})

def _send_entity_statement_whatsapp(db: Session, entity_kind: str, entity_id: str, entity_name: str, date_from: str, date_to: str, currency: str, actor: User):
    manager_phone = get_whatsapp_setting(db, "whatsappManagerPhone", "")
    if not manager_phone:
        raise APIError(code="NO_PHONE", message_ar="لم يتم تحديد رقم هاتف المدير في الإعدادات لاستقبال التقارير", message_en="No manager phone configured in settings to receive reports", status_code=400)
    content, _ = _entity_statement_export(db, entity_kind, entity_id, entity_name, "pdf", date_from, date_to, currency)
    result = send_whatsapp_document(db, manager_phone, content, f"statement_{entity_id}.pdf", caption=f"كشف حساب — {entity_name}")
    if not result.get("sent"):
        raise APIError(code="WHATSAPP_SEND_FAILED", message_ar="تعذر إرسال كشف الحساب عبر واتساب — تأكد من إعداد بوابة واتساب من الإعدادات", message_en=f"WhatsApp send failed: {result.get('reason')}", status_code=502)
    create_audit_log(db, action=AuditAction.SYSTEM_ALERT, entity_type="Statement", entity_id=entity_id, description=f"تم إرسال كشف حساب {entity_name} عبر واتساب إلى {manager_phone}", username=actor.username)
    db.commit()

@router.post("/vaults/{vault_id}/send_statement_whatsapp")
def send_vault_statement_whatsapp(vault_id: str, date_from: str = "", date_to: str = "", currency: str = "", actor: User = Depends(require_permission("إدارة الخزنات")), db: Session = Depends(get_db)):
    vault = db.get(Vault, vault_id)
    if not vault:
        raise APIError(code="VAULT_NOT_FOUND", message_ar="الخزنة المحددة غير موجودة", message_en="Vault not found", status_code=400)
    _send_entity_statement_whatsapp(db, "vault", vault_id, vault.name, date_from, date_to, currency, actor)
    return success_response(data={"sent": True}, message_ar="تم إرسال كشف الحساب عبر واتساب بنجاح")

@router.post("/bank_accounts/{account_id}/send_statement_whatsapp")
def send_bank_account_statement_whatsapp(account_id: str, date_from: str = "", date_to: str = "", currency: str = "", actor: User = Depends(require_permission("إدارة البنوك")), db: Session = Depends(get_db)):
    account = db.get(BankAccount, account_id)
    if not account:
        raise APIError(code="BANK_ACCOUNT_NOT_FOUND", message_ar="الحساب البنكي المحدد غير موجود", message_en="Bank account not found", status_code=400)
    _send_entity_statement_whatsapp(db, "bank_account", account_id, f"{account.bank_name} - {account.account_name}", date_from, date_to, currency, actor)
    return success_response(data={"sent": True}, message_ar="تم إرسال كشف الحساب عبر واتساب بنجاح")

@router.post("/exchange/pos")
def execute_pos_operation(data: POSOperation, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Determine flow
    is_buy = data.type == "buy"
    is_sell = data.type == "sell"
    is_exchange = data.type == "exchange"

    required_permission = "تنفيذ شراء عملة" if is_buy else "تنفيذ بيع عملة" if is_sell else None
    if required_permission:
        role = db.get(Role, actor.role)
        if not role or required_permission not in role.permissions:
            raise APIError(code="FORBIDDEN", message_ar=f"لا تملك صلاحية تنفيذ هذا الإجراء: {required_permission}", message_en=f"Missing required permission: {required_permission}", status_code=403)

    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون المبلغ أكبر من صفر", message_en="Amount must be positive", status_code=400)
    if data.rate <= 0:
        raise APIError(code="INVALID_RATE", message_ar="يجب أن يكون سعر الصرف أكبر من صفر", message_en="Rate must be positive", status_code=400)
    if data.commission < 0:
        raise APIError(code="INVALID_COMMISSION", message_ar="لا يمكن أن تكون العمولة بقيمة سالبة", message_en="Commission cannot be negative", status_code=400)

    vault = db.get(Vault, data.vaultId)
    if not vault:
        raise APIError(code="VAULT_NOT_FOUND", message_ar="الخزنة المحددة غير موجودة", message_en="Vault not found", status_code=400)

    customer = db.get(Customer, data.customerId)
    if not customer:
        raise APIError(code="CUSTOMER_NOT_FOUND", message_ar="العميل المحدد غير موجود", message_en="Customer not found", status_code=400)

    # Enforce the standing rate's min/max band unless the actor is explicitly
    # allowed to override it (doc requirement: "تقييد تعديل الأسعار بصلاحيات محددة")
    pair_from, pair_to = (data.fromCurrency, data.toCurrency) if is_buy or is_exchange else (data.toCurrency, data.fromCurrency)
    standing = db.scalar(select(ExchangeRate).where(ExchangeRate.from_currency == pair_from, ExchangeRate.to_currency == pair_to))
    if standing and (standing.min_rate or standing.max_rate):
        role = db.get(Role, actor.role)
        can_override = bool(role and "تعديل أسعار الصرف" in role.permissions)
        if not can_override and not (standing.min_rate <= data.rate <= standing.max_rate):
            raise APIError(
                code="RATE_OUT_OF_BOUNDS",
                message_ar=f"السعر المدخل ({data.rate}) خارج النطاق المسموح به ({standing.min_rate} - {standing.max_rate})",
                message_en=f"Rate {data.rate} is outside the allowed band ({standing.min_rate} - {standing.max_rate})",
                status_code=400
            )

    cashier_receive_currency = ""
    cashier_receive_amount = 0.0
    cashier_pay_currency = ""
    cashier_pay_amount = 0.0

    if is_buy:
        cashier_receive_currency = data.fromCurrency
        cashier_receive_amount = data.amount
        cashier_pay_currency = data.toCurrency
        cashier_pay_amount = data.amount * data.rate - data.commission
    elif is_sell:
        cashier_receive_currency = data.fromCurrency
        cashier_receive_amount = data.amount * data.rate + data.commission
        cashier_pay_currency = data.toCurrency
        cashier_pay_amount = data.amount
    elif is_exchange:
        cashier_receive_currency = data.fromCurrency
        cashier_receive_amount = data.amount
        cashier_pay_currency = data.toCurrency
        cashier_pay_amount = data.amount * data.rate
    else:
        raise APIError(code="INVALID_TYPE", message_ar="نوع العملية غير صالح", message_en="Invalid operation type", status_code=400)

    # Check sufficient vault balance for the payout leg. On a sell, the foreign currency
    # handed to the customer always leaves the vault regardless of payment method (the
    # customer walks away with physical currency no matter how they paid for it), so
    # that leg must always be checked — not just when paymentMethod == "cash".
    if is_sell or data.paymentMethod == "cash":
        pay_bal = vault.balances.get(cashier_pay_currency, 0.0)
        if pay_bal < cashier_pay_amount:
            raise APIError(
                code="INSUFFICIENT_BALANCE",
                message_ar=f"الرصيد المتاح في الخزنة ({pay_bal} {cashier_pay_currency}) غير كافي لتسديد قيمة العملية البالغة ({cashier_pay_amount} {cashier_pay_currency})",
                message_en=f"Insufficient vault balance ({pay_bal} {cashier_pay_currency}) for payout ({cashier_pay_amount} {cashier_pay_currency})",
                status_code=400
            )

    # Check bank account balance if bank payout
    bank_acc = None
    if data.paymentMethod == "bank_account" and data.bankAccountId:
        bank_acc = db.get(BankAccount, data.bankAccountId)
        if not bank_acc:
            raise APIError(code="BANK_ACCOUNT_NOT_FOUND", message_ar="الحساب المصرفي المحدد غير موجود", message_en="Bank account not found", status_code=400)
        if is_buy and bank_acc.balance < cashier_pay_amount:
            raise APIError(
                code="INSUFFICIENT_BANK_BALANCE",
                message_ar=f"رصيد الحساب البنكي غير كافي! الرصيد المتاح: {bank_acc.balance} {bank_acc.currency}",
                message_en=f"Insufficient bank account balance! Available: {bank_acc.balance} {bank_acc.currency}",
                status_code=400
            )

    # Check the customer has enough account balance to cover what they're paying for
    # this operation FROM their own account balance — this only applies to a sell
    # settled via customer_account (the customer draws down their account instead of
    # handing over cash). On a buy/exchange, customer_account means the business is
    # crediting the customer's account with what it owes them — nothing is drawn from
    # their balance, so no sufficiency check applies there.
    if data.paymentMethod == "customer_account" and is_sell:
        cust_bal = customer.balances.get(cashier_receive_currency, 0.0)
        if cust_bal < cashier_receive_amount:
            raise APIError(
                code="INSUFFICIENT_CUSTOMER_BALANCE",
                message_ar=f"رصيد العميل غير كافٍ ({cust_bal} {cashier_receive_currency}) لتغطية قيمة العملية ({cashier_receive_amount} {cashier_receive_currency})",
                message_en=f"Customer balance ({cust_bal} {cashier_receive_currency}) is insufficient to cover this operation ({cashier_receive_amount} {cashier_receive_currency})",
                status_code=400
            )

    # Check customer debt limit
    if data.paymentMethod == "debt":
        current_debt = db.scalar(
            select(func.sum(Debt.remaining_amount)).where(Debt.customer_id == customer.id, Debt.status != "paid")
        ) or 0.0
        new_debt_amount = cashier_pay_amount if is_buy else cashier_receive_amount
        debt_limit = customer.debt_limit
        if current_debt + new_debt_amount > debt_limit:
            raise APIError(
                code="DEBT_LIMIT_EXCEEDED",
                message_ar=f"تجاوزت العملية حد الدين المسموح به للعميل! حد الدين: {debt_limit} د.ل. الدين الحالي: {current_debt} د.ل.",
                message_en=f"Debt limit exceeded! Limit: {debt_limit} LYD. Current debt: {current_debt} LYD.",
                status_code=400
            )

    # Start database updates
    tx_id = data.id or new_id("tx")
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    username = actor.name

    # 1. Update Vault balances. The currency that physically changes hands with the
    # customer at the counter always moves the vault, regardless of payment method:
    # on a buy/exchange that's the currency the customer hands over (always credited);
    # on a sell that's the currency handed to the customer (always debited). The other
    # ("settlement") leg only touches the vault when it's actually settled in cash —
    # otherwise it's routed to a bank account, the customer's own account, or a debt.
    v_bals = vault.balances.copy()
    if is_sell:
        v_bals[cashier_pay_currency] = v_bals.get(cashier_pay_currency, 0.0) - cashier_pay_amount
        if data.paymentMethod == "cash":
            v_bals[cashier_receive_currency] = v_bals.get(cashier_receive_currency, 0.0) + cashier_receive_amount
    else:
        v_bals[cashier_receive_currency] = v_bals.get(cashier_receive_currency, 0.0) + cashier_receive_amount
        if data.paymentMethod == "cash":
            v_bals[cashier_pay_currency] = v_bals.get(cashier_pay_currency, 0.0) - cashier_pay_amount
    vault.balances = v_bals
    vault.last_movement = timestamp

    # 2. Update Customer balances. customer_account never draws from a currency the
    # counter-physical leg brought in (that always goes to the vault, see above) — it
    # only ever credits the customer (buy/exchange: the business owes them proceeds)
    # or debits them (sell: they're paying out of their own account balance instead
    # of handing over cash).
    cust_bals = customer.balances.copy()
    if data.paymentMethod == "customer_account":
        if is_sell:
            cust_bals[cashier_receive_currency] = cust_bals.get(cashier_receive_currency, 0.0) - cashier_receive_amount
        else:
            cust_bals[cashier_pay_currency] = cust_bals.get(cashier_pay_currency, 0.0) + cashier_pay_amount
        customer.balances = cust_bals
    elif data.paymentMethod == "debt":
        debt_currency = cashier_pay_currency if is_buy else cashier_receive_currency
        debt_amount = cashier_pay_amount if is_buy else cashier_receive_amount
        cust_bals[debt_currency] = cust_bals.get(debt_currency, 0.0) - debt_amount
        customer.balances = cust_bals

    # 3. Update Bank Account balance
    if data.paymentMethod == "bank_account" and bank_acc:
        old_bank_balance = bank_acc.balance
        if is_buy:
            bank_acc.balance -= cashier_pay_amount
        else:
            bank_acc.balance += cashier_receive_amount
        bank_acc.last_movement = timestamp

        bm = Movement(
            id=new_id(f"bm_{tx_id}"),
            timestamp=timestamp,
            entity_type="bank_account",
            entity_id=bank_acc.id,
            entity_name=f"{bank_acc.bank_name} - {bank_acc.account_name}",
            currency=bank_acc.currency,
            type="سحب نقدي لصالح عملية صرافة" if is_buy else "إيداع نقدي من مبيعات صرافة",
            amount_in=0.0 if is_buy else cashier_receive_amount,
            amount_out=cashier_pay_amount if is_buy else 0.0,
            balance_before=old_bank_balance,
            balance_after=bank_acc.balance,
            reference_id=tx_id,
            user=username
        )
        db.add(bm)

    # 4. Create Debt if paymentMethod == "debt"
    if data.paymentMethod == "debt":
        debt_currency = cashier_pay_currency if is_buy else cashier_receive_currency
        debt_amount = cashier_pay_amount if is_buy else cashier_receive_amount
        debt = Debt(
            id=new_id(f"d_{tx_id}"),
            customer_id=customer.id,
            customer_name=customer.name,
            currency=debt_currency,
            amount=debt_amount,
            paid_amount=0.0,
            remaining_amount=debt_amount,
            start_date=timestamp.split(" ")[0],
            due_date=(datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%d"),
            status="unpaid",
            notes=f"دين تلقائي من عملية صرافة POS {tx_id}",
            transaction_id=tx_id
        )
        db.add(debt)

    # 5. Update Shift expected balances — mirrors the vault mutation in step 1 exactly,
    # since this is what shift-close reconciliation compares the counted cash against.
    shift = db.scalar(
        select(Shift).where(Shift.vault_id == vault.id, Shift.status == "open")
    )
    if shift:
        expected = shift.expected_balances.copy()
        if is_sell:
            expected[cashier_pay_currency] = expected.get(cashier_pay_currency, 0.0) - cashier_pay_amount
            if data.paymentMethod == "cash":
                expected[cashier_receive_currency] = expected.get(cashier_receive_currency, 0.0) + cashier_receive_amount
        else:
            expected[cashier_receive_currency] = expected.get(cashier_receive_currency, 0.0) + cashier_receive_amount
            if data.paymentMethod == "cash":
                expected[cashier_pay_currency] = expected.get(cashier_pay_currency, 0.0) - cashier_pay_amount
        shift.expected_balances = expected

    # 6. Create Transaction
    # Commission is real cash the office keeps on top of the rate spread (it directly
    # reduces the LYD paid out on a buy, or adds to the LYD collected on a sell — see
    # cashier_pay_amount / cashier_receive_amount above) — it must be added to the
    # rate-spread component, not left out, or a commission-bearing operation quietly
    # understates its own profit by exactly the commission charged.
    expected_profit = 0.0
    if is_buy:
        std_rate = db.scalar(
            select(ExchangeRate).where(ExchangeRate.from_currency == data.fromCurrency, ExchangeRate.to_currency == data.toCurrency)
        )
        if std_rate:
            expected_profit = data.amount * (std_rate.sell_rate - data.rate) + data.commission
    elif is_sell:
        std_rate = db.scalar(
            select(ExchangeRate).where(ExchangeRate.from_currency == data.toCurrency, ExchangeRate.to_currency == data.fromCurrency)
        )
        if std_rate:
            expected_profit = data.amount * (data.rate - std_rate.buy_rate) + data.commission
    elif is_exchange:
        expected_profit = data.commission

    tx = Transaction(
        id=tx_id,
        type=data.type,
        vault_id=vault.id,
        vault_name=vault.name,
        shift_id=shift.id if shift else None,
        customer_id=customer.id,
        customer_name=customer.name,
        from_currency=data.fromCurrency,
        to_currency=data.toCurrency,
        amount=data.amount,
        rate=data.rate,
        commission=data.commission,
        total_amount=cashier_pay_amount if is_buy or is_exchange else cashier_receive_amount,
        payment_method=data.paymentMethod,
        status="approved",
        notes=data.notes,
        user=username,
        branch=vault.branch,
        timestamp=timestamp,
        expected_profit=expected_profit
    )
    db.add(tx)

    # 7. Create Movements — must mirror exactly which legs actually touched the vault
    # above (step 1), since apply_transaction_reversal() undoes vault balances strictly
    # by replaying these rows in reverse, not by re-deriving the math independently.
    if is_sell:
        m1 = Movement(
            id=new_id(f"m_rec_{tx_id}"),
            timestamp=timestamp,
            entity_type="vault",
            entity_id=vault.id,
            entity_name=vault.name,
            currency=cashier_pay_currency,
            type="بيع عملة ورقية",
            amount_in=0.0,
            amount_out=cashier_pay_amount,
            balance_before=vault.balances.get(cashier_pay_currency, 0.0) + cashier_pay_amount,
            balance_after=vault.balances.get(cashier_pay_currency, 0.0),
            reference_id=tx_id,
            user=username
        )
        db.add(m1)

        if data.paymentMethod == "cash":
            m2 = Movement(
                id=new_id(f"m_pay_{tx_id}"),
                timestamp=timestamp,
                entity_type="vault",
                entity_id=vault.id,
                entity_name=vault.name,
                currency=cashier_receive_currency,
                type="مقبوضات صرافة",
                amount_in=cashier_receive_amount,
                amount_out=0.0,
                balance_before=vault.balances.get(cashier_receive_currency, 0.0) - cashier_receive_amount,
                balance_after=vault.balances.get(cashier_receive_currency, 0.0),
                reference_id=tx_id,
                user=username
            )
            db.add(m2)
    else:
        m1 = Movement(
            id=new_id(f"m_rec_{tx_id}"),
            timestamp=timestamp,
            entity_type="vault",
            entity_id=vault.id,
            entity_name=vault.name,
            currency=cashier_receive_currency,
            type="شراء عملة ورقية" if is_buy else "تبديل عملة",
            amount_in=cashier_receive_amount,
            amount_out=0.0,
            balance_before=vault.balances.get(cashier_receive_currency, 0.0) - cashier_receive_amount,
            balance_after=vault.balances.get(cashier_receive_currency, 0.0),
            reference_id=tx_id,
            user=username
        )
        db.add(m1)

        if data.paymentMethod == "cash":
            m2 = Movement(
                id=new_id(f"m_pay_{tx_id}"),
                timestamp=timestamp,
                entity_type="vault",
                entity_id=vault.id,
                entity_name=vault.name,
                currency=cashier_pay_currency,
                type="مدفوعات صرافة" if is_buy else "تبديل عملة",
                amount_in=0.0,
                amount_out=cashier_pay_amount,
                balance_before=vault.balances.get(cashier_pay_currency, 0.0) + cashier_pay_amount,
                balance_after=vault.balances.get(cashier_pay_currency, 0.0),
                reference_id=tx_id,
                user=username
            )
            db.add(m2)

    # 8. Create Journal Entry. Account labeling must match which leg actually moved the
    # vault (step 1): on a sell the receive (LYD) leg is the settlement side, so it's
    # only really the vault when paid in cash — otherwise the pay (foreign currency)
    # leg is the one that's always the vault (physically dispensed either way).
    lines = [
        {
            "accountName": f"خزينة {vault.name} - {cashier_receive_currency}" if (not is_sell or data.paymentMethod == "cash")
                          else f"حساب بنكي {bank_acc.bank_name} - {bank_acc.account_name}" if (data.paymentMethod == "bank_account" and bank_acc)
                          else f"حساب العميل {customer.name} - {cashier_receive_currency}" if data.paymentMethod == "customer_account"
                          else f"دين العميل {customer.name} - {cashier_receive_currency}",
            "currency": cashier_receive_currency,
            "debit": cashier_receive_amount,
            "credit": 0.0,
            "originalAmount": cashier_receive_amount,
            "exchangeRate": data.rate if is_buy else 1.0,
            "equivalentLYD": cashier_receive_amount if cashier_receive_currency == "LYD" else cashier_receive_amount * data.rate
        },
        {
            "accountName": f"خزينة {vault.name} - {cashier_pay_currency}" if (is_sell or data.paymentMethod == "cash")
                          else f"حساب بنكي {bank_acc.bank_name} - {bank_acc.account_name}" if (data.paymentMethod == "bank_account" and bank_acc)
                          else f"حساب العميل {customer.name} - {cashier_pay_currency}" if data.paymentMethod == "customer_account"
                          else f"دين العميل {customer.name} - {cashier_pay_currency}",
            "currency": cashier_pay_currency,
            "debit": 0.0,
            "credit": cashier_pay_amount,
            "originalAmount": cashier_pay_amount,
            "exchangeRate": data.rate if is_sell else 1.0,
            "equivalentLYD": cashier_pay_amount if cashier_pay_currency == "LYD" else cashier_pay_amount * data.rate
        },
        {
            "accountName": "إيراد عمولات صرافة - LYD",
            "currency": "LYD",
            "debit": 0.0,
            "credit": data.commission,
            "originalAmount": data.commission,
            "exchangeRate": 1.0,
            "equivalentLYD": data.commission
        },
        {
            "accountName": "حساب تسوية عمولة الصندوق - LYD",
            "currency": "LYD",
            "debit": data.commission,
            "credit": 0.0,
            "originalAmount": data.commission,
            "exchangeRate": 1.0,
            "equivalentLYD": data.commission
        }
    ]

    jv = JournalEntry(
        id=f"JV-{datetime.utcnow().strftime('%Y%m%d')}-{tx_id}",
        date=timestamp,
        tx_type="شراء عملة" if is_buy else "بيع عملة" if is_sell else "تبديل عملة",
        reference=tx_id,
        description=f"قيد تلقائي لعملية {'شراء' if is_buy else 'بيع' if is_sell else 'تبديل'} بمبلغ {data.amount} {data.fromCurrency if is_buy else data.toCurrency} من العميل {customer.name}",
        user=username,
        status="approved",
        lines=lines
    )
    db.add(jv)

    create_audit_log(
        db,
        action=AuditAction.CREATE,
        entity_type="Transaction",
        entity_id=tx_id,
        description=f"تم تنفيذ عملية صرافة رقم {tx_id} بنجاح: العميل يدفع ({cashier_receive_amount} {cashier_receive_currency})، العميل يستلم ({cashier_pay_amount} {cashier_pay_currency}) بقيمة عمولة {data.commission} د.ل"
    )

    # AML / large-transaction flagging — compare the LYD-equivalent value against
    # the configurable threshold, not the raw foreign-currency amount.
    threshold_setting = db.get(SystemSetting, "amlThresholdLYD")
    threshold = threshold_setting.value.get("val") if threshold_setting else None
    if threshold:
        lyd_equivalent = tx.total_amount if (data.fromCurrency == "LYD" or data.toCurrency == "LYD") else tx.total_amount * data.rate
        if lyd_equivalent >= threshold:
            flag = ComplianceFlag(
                id=new_id(f"cf_{tx_id}"),
                transaction_id=tx_id,
                customer_id=customer.id,
                customer_name=customer.name,
                reason=f"عملية تتجاوز حد الإبلاغ المحدد ({threshold} د.ل)",
                amount_lyd_equivalent=lyd_equivalent,
                currency=data.fromCurrency if is_sell else data.toCurrency,
                timestamp=timestamp,
                status="pending"
            )
            db.add(flag)
            create_audit_log(db, action=AuditAction.SYSTEM_ALERT, entity_type="ComplianceFlag", entity_id=flag.id, description=f"تم رصد عملية كبيرة تستدعي المراجعة: {tx_id} بقيمة {lyd_equivalent:.2f} د.ل")

            if get_whatsapp_setting(db, "whatsappAlertCompliance", True):
                alert_msg = f"⚠️ عملية تستوجب المراجعة\nرقم العملية: {tx_id}\nالعميل: {customer.name}\nالقيمة: {lyd_equivalent:.2f} د.ل\nالسبب: تجاوزت حد الإبلاغ ({threshold} د.ل)"
                send_manager_alert(
                    db, alert_msg,
                    template_name=get_whatsapp_setting(db, "whatsappTemplateName", "") or None,
                    template_params=[tx_id, customer.name, f"{lyd_equivalent:.2f}"],
                )
                send_telegram_alert(db, alert_msg)

    db.commit()
    return success_response(data=transaction_to_dict(tx))

# ----------------- TRANSACTION REVERSAL -----------------
class ReversalRequestBody(BaseModel):
    reason: str

@router.post("/transactions/{tx_id}/request-reversal")
def request_transaction_reversal(tx_id: str, data: ReversalRequestBody, actor: User = Depends(require_permission("إنشاء عملية عكسية")), db: Session = Depends(get_db)):
    """Doc requirement: a transaction is never deleted, only reversed, and only by someone
    with special permission — and even then it goes through the same approval workflow
    already used for transfers, so a second person signs off before money actually moves."""
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise APIError(code="NOT_FOUND", message_ar="العملية غير موجودة", message_en="Transaction not found", status_code=404)
    if tx.status == "reversed":
        raise APIError(code="ALREADY_REVERSED", message_ar="تم عكس هذه العملية بالفعل", message_en="Transaction already reversed", status_code=400)

    existing_request = db.scalar(select(ApprovalRequest).where(ApprovalRequest.type == "reversal", ApprovalRequest.reference_id == tx_id, ApprovalRequest.status == "pending"))
    if existing_request:
        raise APIError(code="REVERSAL_PENDING", message_ar="يوجد بالفعل طلب عكس معلق لهذه العملية", message_en="A reversal request for this transaction is already pending", status_code=400)

    approval = ApprovalRequest(
        id=new_id(f"apr_rev_{tx_id}"),
        type="reversal",
        title=f"طلب عكس عملية {tx.type} رقم {tx_id}",
        amount=tx.total_amount,
        currency=tx.to_currency,
        requested_by=actor.name,
        timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        status="pending",
        reference_id=tx_id,
        details=data.reason
    )
    db.add(approval)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="ApprovalRequest", entity_id=approval.id, description=f"طلب {actor.name} عكس العملية {tx_id} — السبب: {data.reason}", username=actor.username)
    db.commit()
    return success_response(data={"approvalId": approval.id}, message_ar="تم إرسال طلب عكس العملية للمراجعة")


def apply_transaction_reversal(db: Session, tx_id: str, actor_name: str, reason: str) -> Transaction:
    """Actually undoes the money movement of a transaction: vault/bank balances via
    their recorded Movement rows (exact, no re-derivation), customer_account/debt
    effects via the same formulas execute_pos_operation used to create them (no
    Movement rows exist for those paths today), then flips the journal entry.
    Called from the approvals endpoint once a reversal request is approved."""
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise APIError(code="NOT_FOUND", message_ar="العملية غير موجودة", message_en="Transaction not found", status_code=404)
    if tx.status == "reversed":
        raise APIError(code="ALREADY_REVERSED", message_ar="تم عكس هذه العملية بالفعل", message_en="Transaction already reversed", status_code=400)

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")

    # 1. Undo vault & bank_account balance changes using the exact Movement rows recorded at execution time
    movements = db.scalars(select(Movement).where(Movement.reference_id == tx_id, Movement.entity_type.in_(["vault", "bank_account"]))).all()
    for m in movements:
        entity = db.get(Vault, m.entity_id) if m.entity_type == "vault" else db.get(BankAccount, m.entity_id)
        if not entity:
            continue
        if m.entity_type == "vault":
            balance_before = entity.balances.get(m.currency, 0.0)
            bals = entity.balances.copy()
            bals[m.currency] = balance_before - m.amount_in + m.amount_out
            entity.balances = bals
            balance_after = bals[m.currency]
            entity.last_movement = timestamp
        else:
            balance_before = entity.balance
            entity.balance = balance_before - m.amount_in + m.amount_out
            balance_after = entity.balance
            entity.last_movement = timestamp

        db.add(Movement(
            id=new_id(f"m_rev_{m.id}"),
            timestamp=timestamp, entity_type=m.entity_type, entity_id=m.entity_id, entity_name=m.entity_name,
            currency=m.currency, type=f"عكس عملية — {m.type}", amount_in=m.amount_out, amount_out=m.amount_in,
            balance_before=balance_before, balance_after=balance_after, reference_id=tx_id, user=actor_name
        ))

    is_buy, is_sell = tx.type == "buy", tx.type == "sell"
    if is_buy:
        recv_ccy, recv_amt, pay_ccy, pay_amt = tx.from_currency, tx.amount, tx.to_currency, tx.amount * tx.rate - tx.commission
    elif is_sell:
        recv_ccy, recv_amt, pay_ccy, pay_amt = tx.from_currency, tx.amount * tx.rate + tx.commission, tx.to_currency, tx.amount
    else:
        recv_ccy, recv_amt, pay_ccy, pay_amt = tx.from_currency, tx.amount, tx.to_currency, tx.amount * tx.rate

    # 2. Undo the customer_account balance effect (no Movement rows exist for this path).
    # Mirrors execute_pos_operation's forward math: a sell debits the receive (LYD)
    # leg from the customer's account, a buy/exchange credits the pay leg to it — so
    # reversing means crediting back the former and debiting back the latter.
    customer = db.get(Customer, tx.customer_id) if tx.customer_id else None
    if customer and tx.payment_method == "customer_account":
        cust_bals = customer.balances.copy()
        if is_sell:
            cust_bals[recv_ccy] = cust_bals.get(recv_ccy, 0.0) + recv_amt
        else:
            cust_bals[pay_ccy] = cust_bals.get(pay_ccy, 0.0) - pay_amt
        customer.balances = cust_bals

    # 3. Cancel the debt this transaction created, if untouched — refuse if the customer already paid some of it down
    if tx.payment_method == "debt":
        debt = db.scalar(select(Debt).where(Debt.transaction_id == tx_id))
        if debt:
            if debt.paid_amount > 0:
                raise APIError(code="DEBT_PARTIALLY_PAID", message_ar="لا يمكن عكس العملية لوجود دفعات مسددة بالفعل على الدين المرتبط بها", message_en="Cannot reverse: the linked debt already has payments applied", status_code=400)
            db.delete(debt)
            if customer:
                debt_ccy = pay_ccy if is_buy else recv_ccy
                debt_amt = pay_amt if is_buy else recv_amt
                cust_bals = customer.balances.copy()
                cust_bals[debt_ccy] = cust_bals.get(debt_ccy, 0.0) + debt_amt
                customer.balances = cust_bals

    # 4. Reopen the shift's expected balances if it's still open
    tx.status = "reversed"
    shift = db.scalar(select(Shift).where(Shift.vault_id == tx.vault_id, Shift.status == "open"))
    if shift:
        expected = shift.expected_balances.copy()
        if is_sell:
            expected[pay_ccy] = expected.get(pay_ccy, 0.0) + pay_amt
            if tx.payment_method == "cash":
                expected[recv_ccy] = expected.get(recv_ccy, 0.0) - recv_amt
        else:
            expected[recv_ccy] = expected.get(recv_ccy, 0.0) - recv_amt
            if tx.payment_method == "cash":
                expected[pay_ccy] = expected.get(pay_ccy, 0.0) + pay_amt
        shift.expected_balances = expected

    # 5. Flip the journal entry
    jv = db.scalar(select(JournalEntry).where(JournalEntry.reference == tx_id, JournalEntry.status == "approved"))
    if jv:
        jv.status = "reversed"
        rev_lines = [{
            "accountName": l.get("accountName"), "currency": l.get("currency"),
            "debit": l.get("credit", 0.0), "credit": l.get("debit", 0.0),
            "originalAmount": l.get("originalAmount"), "exchangeRate": l.get("exchangeRate"),
            "equivalentLYD": l.get("equivalentLYD")
        } for l in jv.lines]
        db.add(JournalEntry(
            id=f"REV-{jv.id}", date=timestamp, tx_type=f"إلغاء قيد {jv.tx_type}", reference=jv.reference,
            description=f"قيد عكسي تلقائي لإلغاء المعاملة {tx_id} — السبب: {reason}",
            user=actor_name, status="approved", lines=rev_lines
        ))

    create_audit_log(db, action=AuditAction.REVERSE, entity_type="Transaction", entity_id=tx_id, description=f"تم عكس العملية {tx_id} بالكامل (الأرصدة والقيود) — السبب: {reason}", username=actor_name)
    return tx

# ----------------- TRANSACTION EDITING -----------------
class TransactionEditRequest(BaseModel):
    amount: float
    rate: float
    commission: float = 0.0
    notes: str | None = None

@router.put("/transactions/{tx_id}")
def edit_transaction(tx_id: str, data: TransactionEditRequest, actor: User = Depends(require_permission("إنشاء عملية عكسية")), db: Session = Depends(get_db)):
    """Edits a buy/sell/exchange transaction's amount/rate/commission/notes at any time,
    by undoing its recorded effect (via apply_transaction_reversal — the same exact-undo
    logic used for manager-approved reversals) and reapplying the edited values with the
    same forward math execute_pos_operation uses to create a transaction. The transaction
    keeps its original id/type/vault/customer/currencies/payment method — only the
    financial figures and notes change. Deposit/withdraw customer-account operations are
    a separate model (CustomerAccountEntry) and are not covered by this endpoint."""
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise APIError(code="NOT_FOUND", message_ar="العملية غير موجودة", message_en="Transaction not found", status_code=404)
    if tx.status == "reversed":
        raise APIError(code="ALREADY_REVERSED", message_ar="لا يمكن تعديل عملية تم عكسها بالفعل", message_en="Cannot edit a reversed transaction", status_code=400)
    if tx.type not in ("buy", "sell", "exchange"):
        raise APIError(code="NOT_EDITABLE", message_ar="هذا النوع من العمليات غير قابل للتعديل من هنا", message_en="This transaction type cannot be edited here", status_code=400)
    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون المبلغ أكبر من صفر", message_en="Amount must be positive", status_code=400)
    if data.rate <= 0:
        raise APIError(code="INVALID_RATE", message_ar="يجب أن يكون سعر الصرف أكبر من صفر", message_en="Rate must be positive", status_code=400)
    if data.commission < 0:
        raise APIError(code="INVALID_COMMISSION", message_ar="لا يمكن أن تكون العمولة بقيمة سالبة", message_en="Commission cannot be negative", status_code=400)

    vault = db.get(Vault, tx.vault_id)
    customer = db.get(Customer, tx.customer_id) if tx.customer_id else None
    if not vault or not customer:
        raise APIError(code="NOT_FOUND", message_ar="تعذر العثور على الخزنة أو العميل المرتبط بالعملية", message_en="Linked vault or customer no longer exists", status_code=400)

    bank_acc = None
    if tx.payment_method == "bank_account":
        bank_movement = db.scalar(select(Movement).where(Movement.reference_id == tx_id, Movement.entity_type == "bank_account"))
        bank_acc = db.get(BankAccount, bank_movement.entity_id) if bank_movement else None
        if not bank_acc:
            raise APIError(code="BANK_ACCOUNT_NOT_FOUND", message_ar="تعذر العثور على الحساب البنكي المرتبط بهذه العملية", message_en="Linked bank account no longer exists", status_code=400)

    old_amount, old_rate, old_commission = tx.amount, tx.rate, tx.commission
    is_buy, is_sell, is_exchange = tx.type == "buy", tx.type == "sell", tx.type == "exchange"

    # 1. Undo the old effect (vault/bank/customer balances, debt, shift, journal).
    # Raises if a linked debt was already paid down, exactly like a normal reversal would.
    apply_transaction_reversal(db, tx_id, actor.name, f"تعديل العملية بواسطة {actor.name}")

    # 2. Recompute cashier receive/pay with the edited values, same formulas as execute_pos_operation
    if is_buy:
        cashier_receive_currency, cashier_receive_amount = tx.from_currency, data.amount
        cashier_pay_currency, cashier_pay_amount = tx.to_currency, data.amount * data.rate - data.commission
    elif is_sell:
        cashier_receive_currency, cashier_receive_amount = tx.from_currency, data.amount * data.rate + data.commission
        cashier_pay_currency, cashier_pay_amount = tx.to_currency, data.amount
    else:
        cashier_receive_currency, cashier_receive_amount = tx.from_currency, data.amount
        cashier_pay_currency, cashier_pay_amount = tx.to_currency, data.amount * data.rate

    if cashier_pay_amount < 0:
        raise APIError(code="INVALID_COMMISSION", message_ar="قيمة العمولة أكبر من قيمة العملية بعد التعديل", message_en="Commission exceeds the edited transaction value", status_code=400)

    # 3. Re-run the same sufficiency checks execute_pos_operation performs at creation
    # time. On a sell, the foreign currency handed to the customer always leaves the
    # vault regardless of payment method, so it's always checked — not just on cash.
    if is_sell or tx.payment_method == "cash":
        pay_bal = vault.balances.get(cashier_pay_currency, 0.0)
        if pay_bal < cashier_pay_amount:
            raise APIError(code="INSUFFICIENT_BALANCE", message_ar=f"الرصيد المتاح في الخزنة ({pay_bal} {cashier_pay_currency}) غير كافٍ لتسديد القيمة الجديدة ({cashier_pay_amount} {cashier_pay_currency})", message_en="Insufficient vault balance for the edited amount", status_code=400)

    if tx.payment_method == "bank_account" and is_buy and bank_acc.balance < cashier_pay_amount:
        raise APIError(code="INSUFFICIENT_BANK_BALANCE", message_ar=f"رصيد الحساب البنكي غير كافٍ! الرصيد المتاح: {bank_acc.balance} {bank_acc.currency}", message_en="Insufficient bank account balance for the edited amount", status_code=400)

    if tx.payment_method == "customer_account" and is_sell:
        cust_bal = customer.balances.get(cashier_receive_currency, 0.0)
        if cust_bal < cashier_receive_amount:
            raise APIError(code="INSUFFICIENT_CUSTOMER_BALANCE", message_ar=f"رصيد العميل غير كافٍ ({cust_bal} {cashier_receive_currency}) لتغطية القيمة الجديدة ({cashier_receive_amount} {cashier_receive_currency})", message_en="Customer balance is insufficient for the edited amount", status_code=400)

    if tx.payment_method == "debt":
        current_debt = db.scalar(select(func.sum(Debt.remaining_amount)).where(Debt.customer_id == customer.id, Debt.status != "paid")) or 0.0
        new_debt_amount = cashier_pay_amount if is_buy else cashier_receive_amount
        if current_debt + new_debt_amount > customer.debt_limit:
            raise APIError(code="DEBT_LIMIT_EXCEEDED", message_ar=f"تجاوزت القيمة الجديدة حد الدين المسموح به للعميل! حد الدين: {customer.debt_limit} د.ل", message_en="Edited amount exceeds the customer's debt limit", status_code=400)

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    username = actor.name

    # 4. Reapply vault balances — same physical-leg-always/settlement-leg-if-cash split
    # as execute_pos_operation (see its step 1 comment for the reasoning).
    v_bals = vault.balances.copy()
    if is_sell:
        v_bals[cashier_pay_currency] = v_bals.get(cashier_pay_currency, 0.0) - cashier_pay_amount
        if tx.payment_method == "cash":
            v_bals[cashier_receive_currency] = v_bals.get(cashier_receive_currency, 0.0) + cashier_receive_amount
    else:
        v_bals[cashier_receive_currency] = v_bals.get(cashier_receive_currency, 0.0) + cashier_receive_amount
        if tx.payment_method == "cash":
            v_bals[cashier_pay_currency] = v_bals.get(cashier_pay_currency, 0.0) - cashier_pay_amount
    vault.balances = v_bals
    vault.last_movement = timestamp

    # 5. Reapply customer balances
    cust_bals = customer.balances.copy()
    if tx.payment_method == "customer_account":
        if is_sell:
            cust_bals[cashier_receive_currency] = cust_bals.get(cashier_receive_currency, 0.0) - cashier_receive_amount
        else:
            cust_bals[cashier_pay_currency] = cust_bals.get(cashier_pay_currency, 0.0) + cashier_pay_amount
        customer.balances = cust_bals
    elif tx.payment_method == "debt":
        debt_currency = cashier_pay_currency if is_buy else cashier_receive_currency
        debt_amount = cashier_pay_amount if is_buy else cashier_receive_amount
        cust_bals[debt_currency] = cust_bals.get(debt_currency, 0.0) - debt_amount
        customer.balances = cust_bals

    # 6. Reapply bank account balance + movement
    if tx.payment_method == "bank_account" and bank_acc:
        old_bank_balance = bank_acc.balance
        if is_buy:
            bank_acc.balance -= cashier_pay_amount
        else:
            bank_acc.balance += cashier_receive_amount
        bank_acc.last_movement = timestamp
        db.add(Movement(
            id=new_id(f"bm_edit_{tx_id}"), timestamp=timestamp, entity_type="bank_account", entity_id=bank_acc.id,
            entity_name=f"{bank_acc.bank_name} - {bank_acc.account_name}", currency=bank_acc.currency,
            type="سحب نقدي لصالح عملية صرافة (بعد تعديل)" if is_buy else "إيداع نقدي من مبيعات صرافة (بعد تعديل)",
            amount_in=0.0 if is_buy else cashier_receive_amount, amount_out=cashier_pay_amount if is_buy else 0.0,
            balance_before=old_bank_balance, balance_after=bank_acc.balance, reference_id=tx_id, user=username
        ))

    # 7. Recreate the debt if this operation is debt-funded (the old one was cancelled by the reversal)
    if tx.payment_method == "debt":
        debt_currency = cashier_pay_currency if is_buy else cashier_receive_currency
        debt_amount = cashier_pay_amount if is_buy else cashier_receive_amount
        db.add(Debt(
            id=new_id(f"d_edit_{tx_id}"), customer_id=customer.id, customer_name=customer.name,
            currency=debt_currency, amount=debt_amount, paid_amount=0.0, remaining_amount=debt_amount,
            start_date=timestamp.split(" ")[0], due_date=(datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%d"),
            status="unpaid", notes=f"دين تلقائي من عملية صرافة POS {tx_id} (بعد التعديل)", transaction_id=tx_id
        ))

    # 8. Reopen shift expected balances with the edited values
    shift = db.scalar(select(Shift).where(Shift.vault_id == vault.id, Shift.status == "open"))
    if shift:
        expected = shift.expected_balances.copy()
        if is_sell:
            expected[cashier_pay_currency] = expected.get(cashier_pay_currency, 0.0) - cashier_pay_amount
            if tx.payment_method == "cash":
                expected[cashier_receive_currency] = expected.get(cashier_receive_currency, 0.0) + cashier_receive_amount
        else:
            expected[cashier_receive_currency] = expected.get(cashier_receive_currency, 0.0) + cashier_receive_amount
            if tx.payment_method == "cash":
                expected[cashier_pay_currency] = expected.get(cashier_pay_currency, 0.0) - cashier_pay_amount
        shift.expected_balances = expected

    # 9. Update the transaction row itself back to approved with the new values
    expected_profit = 0.0
    if is_buy:
        std_rate = db.scalar(select(ExchangeRate).where(ExchangeRate.from_currency == tx.from_currency, ExchangeRate.to_currency == tx.to_currency))
        if std_rate:
            expected_profit = data.amount * (std_rate.sell_rate - data.rate) + data.commission
    elif is_sell:
        std_rate = db.scalar(select(ExchangeRate).where(ExchangeRate.from_currency == tx.to_currency, ExchangeRate.to_currency == tx.from_currency))
        if std_rate:
            expected_profit = data.amount * (data.rate - std_rate.buy_rate) + data.commission
    elif is_exchange:
        expected_profit = data.commission

    tx.amount = data.amount
    tx.rate = data.rate
    tx.commission = data.commission
    tx.total_amount = cashier_pay_amount if (is_buy or is_exchange) else cashier_receive_amount
    tx.notes = data.notes
    tx.status = "approved"
    tx.expected_profit = expected_profit
    tx.timestamp = timestamp

    # 10. Movements reflecting the new forward effect — same physical/settlement split as
    # execute_pos_operation's step 7 (reversal replays these rows exactly).
    if is_sell:
        db.add(Movement(
            id=new_id(f"m_rec_edit_{tx_id}"), timestamp=timestamp, entity_type="vault", entity_id=vault.id, entity_name=vault.name,
            currency=cashier_pay_currency, type="بيع عملة ورقية (معدّلة)",
            amount_in=0.0, amount_out=cashier_pay_amount,
            balance_before=vault.balances.get(cashier_pay_currency, 0.0) + cashier_pay_amount,
            balance_after=vault.balances.get(cashier_pay_currency, 0.0), reference_id=tx_id, user=username
        ))
        if tx.payment_method == "cash":
            db.add(Movement(
                id=new_id(f"m_pay_edit_{tx_id}"), timestamp=timestamp, entity_type="vault", entity_id=vault.id, entity_name=vault.name,
                currency=cashier_receive_currency, type="مقبوضات صرافة (معدّلة)",
                amount_in=cashier_receive_amount, amount_out=0.0,
                balance_before=vault.balances.get(cashier_receive_currency, 0.0) - cashier_receive_amount,
                balance_after=vault.balances.get(cashier_receive_currency, 0.0), reference_id=tx_id, user=username
            ))
    else:
        db.add(Movement(
            id=new_id(f"m_rec_edit_{tx_id}"), timestamp=timestamp, entity_type="vault", entity_id=vault.id, entity_name=vault.name,
            currency=cashier_receive_currency, type="شراء عملة ورقية (معدّلة)" if is_buy else "تبديل عملة (معدّلة)",
            amount_in=cashier_receive_amount, amount_out=0.0,
            balance_before=vault.balances.get(cashier_receive_currency, 0.0) - cashier_receive_amount,
            balance_after=vault.balances.get(cashier_receive_currency, 0.0), reference_id=tx_id, user=username
        ))
        if tx.payment_method == "cash":
            db.add(Movement(
                id=new_id(f"m_pay_edit_{tx_id}"), timestamp=timestamp, entity_type="vault", entity_id=vault.id, entity_name=vault.name,
                currency=cashier_pay_currency, type="مدفوعات صرافة (معدّلة)" if is_buy else "تبديل عملة (معدّلة)",
                amount_in=0.0, amount_out=cashier_pay_amount,
                balance_before=vault.balances.get(cashier_pay_currency, 0.0) + cashier_pay_amount,
                balance_after=vault.balances.get(cashier_pay_currency, 0.0), reference_id=tx_id, user=username
            ))

    # 11. Journal entry for the reapplied values
    lines = [
        {
            "accountName": f"خزينة {vault.name} - {cashier_receive_currency}" if (not is_sell or tx.payment_method == "cash")
                          else f"حساب بنكي {bank_acc.bank_name} - {bank_acc.account_name}" if (tx.payment_method == "bank_account" and bank_acc)
                          else f"حساب العميل {customer.name} - {cashier_receive_currency}" if tx.payment_method == "customer_account"
                          else f"دين العميل {customer.name} - {cashier_receive_currency}",
            "currency": cashier_receive_currency, "debit": cashier_receive_amount, "credit": 0.0,
            "originalAmount": cashier_receive_amount, "exchangeRate": data.rate if is_buy else 1.0,
            "equivalentLYD": cashier_receive_amount if cashier_receive_currency == "LYD" else cashier_receive_amount * data.rate
        },
        {
            "accountName": f"خزينة {vault.name} - {cashier_pay_currency}" if (is_sell or tx.payment_method == "cash")
                          else f"حساب بنكي {bank_acc.bank_name} - {bank_acc.account_name}" if (tx.payment_method == "bank_account" and bank_acc)
                          else f"حساب العميل {customer.name} - {cashier_pay_currency}" if tx.payment_method == "customer_account"
                          else f"دين العميل {customer.name} - {cashier_pay_currency}",
            "currency": cashier_pay_currency, "debit": 0.0, "credit": cashier_pay_amount,
            "originalAmount": cashier_pay_amount, "exchangeRate": data.rate if is_sell else 1.0,
            "equivalentLYD": cashier_pay_amount if cashier_pay_currency == "LYD" else cashier_pay_amount * data.rate
        },
        {"accountName": "إيراد عمولات صرافة - LYD", "currency": "LYD", "debit": 0.0, "credit": data.commission, "originalAmount": data.commission, "exchangeRate": 1.0, "equivalentLYD": data.commission},
        {"accountName": "حساب تسوية عمولة الصندوق - LYD", "currency": "LYD", "debit": data.commission, "credit": 0.0, "originalAmount": data.commission, "exchangeRate": 1.0, "equivalentLYD": data.commission},
    ]
    db.add(JournalEntry(
        id=f"JV-EDIT-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{tx_id}", date=timestamp,
        tx_type="شراء عملة" if is_buy else "بيع عملة" if is_sell else "تبديل عملة", reference=tx_id,
        description=f"قيد تلقائي بعد تعديل العملية {tx_id} بواسطة {username}", user=username, status="approved", lines=lines
    ))

    create_audit_log(
        db, action=AuditAction.UPDATE, entity_type="Transaction", entity_id=tx_id,
        description=f"تم تعديل العملية {tx_id}: المبلغ {old_amount} → {data.amount}، السعر {old_rate} → {data.rate}، العمولة {old_commission} → {data.commission}"
    )

    db.commit()
    return success_response(data=transaction_to_dict(tx), message_ar="تم تعديل العملية بنجاح")
