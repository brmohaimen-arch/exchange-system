from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from ..database import get_db
from ..models import (
    Bank, BankBranch, BankAccount, Customer, Debt, Transaction, Movement, JournalEntry,
    Vault, AuditAction, Shift, ExchangeRate, User, ComplianceFlag, SystemSetting, Role, ApprovalRequest, CustomerDocument, CommissionRule
)
from ..tracking import create_audit_log
from ..core.responses import success_response, error_response
from ..core.errors import APIError
from ..auth_deps import get_current_user, require_permission
from ..id_gen import new_id
from ..export_utils import build_excel, build_pdf, ArabicFontUnavailable
from fastapi.responses import StreamingResponse
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
    currency: str
    balance: float
    is_active: bool = True
    notes: str | None = None

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
        "currency": ba.currency,
        "balance": ba.balance,
        "isActive": ba.is_active,
        "notes": ba.notes,
        "lastMovement": ba.last_movement
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
        "notes": c.notes
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
        "transactionId": d.transaction_id
    }

def transaction_to_dict(t: Transaction):
    return {
        "id": t.id,
        "type": t.type,
        "vaultId": t.vault_id,
        "vaultName": t.vault_name,
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

@router.post("/bank_accounts")
def create_bank_account(data: BankAccountCreate, db: Session = Depends(get_db)):
    ac = BankAccount(**data.model_dump())
    db.add(ac)
    db.commit()
    return success_response(data=bank_account_to_dict(ac))

@router.put("/bank_accounts/{account_id}")
def update_bank_account(account_id: str, data: BankAccountCreate, db: Session = Depends(get_db)):
    account = db.get(BankAccount, account_id)
    if not account:
        raise APIError(code="NOT_FOUND", message_ar="الحساب البنكي غير موجود", message_en="Bank account not found", status_code=404)
    for k, v in data.model_dump().items():
        setattr(account, k, v)
    db.commit()
    return success_response(data=bank_account_to_dict(account))

@router.delete("/bank_accounts/{account_id}")
def delete_bank_account(account_id: str, db: Session = Depends(get_db)):
    account = db.get(BankAccount, account_id)
    if not account:
        raise APIError(code="NOT_FOUND", message_ar="الحساب البنكي غير موجود", message_en="Bank account not found", status_code=404)
    db.delete(account)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="BankAccount", entity_id=account_id, description=f"تم حذف الحساب البنكي: {account.account_name}")
    db.commit()
    return success_response(data={"deleted": True})

# ----------------- CUSTOMERS -----------------
@router.get("/customers")
def list_customers(db: Session = Depends(get_db)):
    res = db.scalars(select(Customer)).all()
    return success_response(data=[customer_to_dict(c) for c in res])

@router.post("/customers")
def create_customer(data: CustomerCreate, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    if db.get(Customer, data.id):
        raise APIError(code="CUSTOMER_EXISTS", message_ar="رمز العميل موجود بالفعل", message_en="Customer ID already exists", status_code=400)
    c = Customer(**data.model_dump())
    db.add(c)
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
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="Customer", entity_id=c.id, description=f"تم تعديل بيانات العميل: {c.name}", username=actor.username)
    db.commit()
    return success_response(data=customer_to_dict(c))

@router.delete("/customers/{customer_id}")
def delete_customer(customer_id: str, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise APIError(code="NOT_FOUND", message_ar="العميل غير موجود", message_en="Customer not found", status_code=404)
    db.delete(customer)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="Customer", entity_id=customer_id, description=f"تم حذف العميل: {customer.name}", username=actor.username)
    db.commit()
    return success_response(data={"deleted": True})

# ----------------- CUSTOMER KYC DOCUMENTS -----------------
class CustomerDocumentCreate(BaseModel):
    id: str
    customer_id: str
    customer_name: str
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
    }

@router.get("/customer_documents")
def list_customer_documents(db: Session = Depends(get_db)):
    res = db.scalars(select(CustomerDocument)).all()
    return success_response(data=[customer_document_to_dict(d) for d in res])

@router.post("/customer_documents")
def add_customer_document(data: CustomerDocumentCreate, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    if not db.get(Customer, data.customer_id):
        raise APIError(code="CUSTOMER_NOT_FOUND", message_ar="العميل المحدد غير موجود", message_en="Customer not found", status_code=400)
    doc = CustomerDocument(**data.model_dump())
    db.add(doc)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="CustomerDocument", entity_id=doc.id, description=f"تمت إضافة مستند ({doc.document_type}) للعميل {doc.customer_name}", username=actor.username)
    db.commit()
    return success_response(data=customer_document_to_dict(doc), message_ar="تمت إضافة المستند بنجاح")

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

@router.delete("/customer_documents/{doc_id}")
def delete_customer_document(doc_id: str, actor: User = Depends(require_permission("إدارة العملاء")), db: Session = Depends(get_db)):
    doc = db.get(CustomerDocument, doc_id)
    if not doc:
        raise APIError(code="NOT_FOUND", message_ar="المستند غير موجود", message_en="Document not found", status_code=404)
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
def create_debt(data: DebtCreate, db: Session = Depends(get_db)):
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
        transaction_id=data.transaction_id
    )
    db.add(debt)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="Debt", entity_id=data.id,
                     description=f"تسجيل دين جديد للعميل {data.customer_name} بمبلغ {data.amount} {data.currency}")
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
        
    customer = db.get(Customer, debt.customer_id)
    if customer:
        bals = customer.balances.copy()
        bals[debt.currency] = bals.get(debt.currency, 0.0) + data.amount
        customer.balances = bals

    create_audit_log(db, action=AuditAction.UPDATE, entity_type="Debt", entity_id=debt.id, description=f"تسديد دفعة دين بقيمة {data.amount} {debt.currency}")
    db.commit()
    return success_response(data=debt_to_dict(debt))

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

@router.get("/transactions/export")
def export_transactions(format: str = "xlsx", actor: User = Depends(require_permission("رؤية سجل العمليات")), db: Session = Depends(get_db)):
    res = db.scalars(select(Transaction).order_by(Transaction.timestamp.desc())).all()
    headers = ["رقم العملية", "النوع", "التاريخ", "العميل", "الخزنة", "من عملة", "إلى عملة", "المبلغ", "السعر", "العمولة", "الإجمالي", "طريقة الدفع", "الحالة", "المستخدم"]
    rows = [[t.id, t.type, t.timestamp, t.customer_name, t.vault_name, t.from_currency, t.to_currency, t.amount, t.rate, t.commission, t.total_amount, t.payment_method, t.status, t.user] for t in res]
    if format == "xlsx":
        buf = build_excel("سجل العمليات", headers, rows)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": 'attachment; filename="transactions.xlsx"'})
    try:
        buf = build_pdf("سجل العمليات", headers, rows)
    except ArabicFontUnavailable as e:
        raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء ملف PDF: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="transactions.pdf"'})

@router.get("/movements")
def list_movements(db: Session = Depends(get_db)):
    res = db.scalars(select(Movement)).all()
    return success_response(data=[movement_to_dict(m) for m in res])

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

    # Check sufficient vault balance if cash payout
    if data.paymentMethod == "cash":
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

    # 1. Update Vault balances
    v_bals = vault.balances.copy()
    v_bals[cashier_receive_currency] = v_bals.get(cashier_receive_currency, 0.0) + cashier_receive_amount
    if data.paymentMethod == "cash":
        v_bals[cashier_pay_currency] = v_bals.get(cashier_pay_currency, 0.0) - cashier_pay_amount
    vault.balances = v_bals
    vault.last_movement = timestamp

    # 2. Update Customer balances
    cust_bals = customer.balances.copy()
    if data.paymentMethod == "customer_account":
        cust_bals[cashier_pay_currency] = cust_bals.get(cashier_pay_currency, 0.0) + cashier_pay_amount
        cust_bals[cashier_receive_currency] = cust_bals.get(cashier_receive_currency, 0.0) - cashier_receive_amount
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

    # 5. Update Shift expected balances
    shift = db.scalar(
        select(Shift).where(Shift.vault_id == vault.id, Shift.status == "open")
    )
    if shift:
        expected = shift.expected_balances.copy()
        expected[cashier_receive_currency] = expected.get(cashier_receive_currency, 0.0) + cashier_receive_amount
        if data.paymentMethod == "cash":
            expected[cashier_pay_currency] = expected.get(cashier_pay_currency, 0.0) - cashier_pay_amount
        shift.expected_balances = expected

    # 6. Create Transaction
    expected_profit = 0.0
    if is_buy:
        std_rate = db.scalar(
            select(ExchangeRate).where(ExchangeRate.from_currency == data.fromCurrency, ExchangeRate.to_currency == data.toCurrency)
        )
        if std_rate:
            expected_profit = data.amount * (std_rate.sell_rate - data.rate)
    elif is_sell:
        std_rate = db.scalar(
            select(ExchangeRate).where(ExchangeRate.from_currency == data.toCurrency, ExchangeRate.to_currency == data.fromCurrency)
        )
        if std_rate:
            expected_profit = data.amount * (data.rate - std_rate.buy_rate)
    elif is_exchange:
        expected_profit = data.commission

    tx = Transaction(
        id=tx_id,
        type=data.type,
        vault_id=vault.id,
        vault_name=vault.name,
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

    # 7. Create Movements
    m1 = Movement(
        id=new_id(f"m_rec_{tx_id}"),
        timestamp=timestamp,
        entity_type="vault",
        entity_id=vault.id,
        entity_name=vault.name,
        currency=cashier_receive_currency,
        type="شراء عملة ورقية" if is_buy else "مقبوضات صرافة" if is_sell else "تبديل عملة",
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
            type="مدفوعات صرافة" if is_buy else "بيع عملة ورقية" if is_sell else "تبديل عملة",
            amount_in=0.0,
            amount_out=cashier_pay_amount,
            balance_before=vault.balances.get(cashier_pay_currency, 0.0) + cashier_pay_amount,
            balance_after=vault.balances.get(cashier_pay_currency, 0.0),
            reference_id=tx_id,
            user=username
        )
        db.add(m2)

    # 8. Create Journal Entry
    lines = [
        {
            "accountName": f"خزينة {vault.name} - {cashier_receive_currency}",
            "currency": cashier_receive_currency,
            "debit": cashier_receive_amount,
            "credit": 0.0,
            "originalAmount": cashier_receive_amount,
            "exchangeRate": data.rate if is_buy else 1.0,
            "equivalentLYD": cashier_receive_amount if cashier_receive_currency == "LYD" else cashier_receive_amount * data.rate
        },
        {
            "accountName": f"خزينة {vault.name} - {cashier_pay_currency}" if data.paymentMethod == "cash"
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

    # 2. Undo the customer_account balance effect (no Movement rows exist for this path)
    customer = db.get(Customer, tx.customer_id) if tx.customer_id else None
    if customer and tx.payment_method == "customer_account":
        cust_bals = customer.balances.copy()
        cust_bals[pay_ccy] = cust_bals.get(pay_ccy, 0.0) - pay_amt
        cust_bals[recv_ccy] = cust_bals.get(recv_ccy, 0.0) + recv_amt
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
