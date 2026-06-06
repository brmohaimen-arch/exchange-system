from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from ..database import get_db
from ..models import (
    Bank, BankBranch, BankAccount, Customer, Debt, Transaction, Movement, JournalEntry,
    Vault, AuditAction, Shift, ExchangeRate
)
from ..tracking import create_audit_log
from ..core.responses import success_response, error_response
from ..core.errors import APIError
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
def create_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    c = Customer(**data.model_dump())
    db.add(c)
    db.commit()
    return success_response(data=customer_to_dict(c))

@router.put("/customers/{customer_id}")
def update_customer(customer_id: str, data: CustomerCreate, db: Session = Depends(get_db)):
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
    db.commit()
    return success_response(data=customer_to_dict(c))

@router.delete("/customers/{customer_id}")
def delete_customer(customer_id: str, db: Session = Depends(get_db)):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise APIError(code="NOT_FOUND", message_ar="العميل غير موجود", message_en="Customer not found", status_code=404)
    db.delete(customer)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="Customer", entity_id=customer_id, description=f"تم حذف العميل: {customer.name}")
    db.commit()
    return success_response(data={"deleted": True})

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
def pay_debt(debt_id: str, data: DebtPayment, db: Session = Depends(get_db)):
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

# ----------------- POS OPERATIONS & TRANSACTIONS -----------------
@router.get("/transactions")
def list_transactions(db: Session = Depends(get_db)):
    res = db.scalars(select(Transaction)).all()
    return success_response(data=[transaction_to_dict(t) for t in res])

@router.get("/movements")
def list_movements(db: Session = Depends(get_db)):
    res = db.scalars(select(Movement)).all()
    return success_response(data=[movement_to_dict(m) for m in res])

@router.post("/exchange/pos")
def execute_pos_operation(data: POSOperation, db: Session = Depends(get_db)):
    vault = db.get(Vault, data.vaultId)
    if not vault:
        raise APIError(code="VAULT_NOT_FOUND", message_ar="الخزنة المحددة غير موجودة", message_en="Vault not found", status_code=400)

    customer = db.get(Customer, data.customerId)
    if not customer:
        raise APIError(code="CUSTOMER_NOT_FOUND", message_ar="العميل المحدد غير موجود", message_en="Customer not found", status_code=400)

    # Determine flow
    is_buy = data.type == "buy"
    is_sell = data.type == "sell"
    is_exchange = data.type == "exchange"

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
    tx_id = data.id or f"tx_{int(datetime.utcnow().timestamp())}"
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    username = data.user or "ahmed"

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
            id=f"bm_{int(datetime.utcnow().timestamp())}_{tx_id}",
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
            id=f"d_{int(datetime.utcnow().timestamp())}_{tx_id}",
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
        id=f"m_{int(datetime.utcnow().timestamp())}_rec_{tx_id}",
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
            id=f"m_{int(datetime.utcnow().timestamp())}_pay_{tx_id}",
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

    db.commit()
    return success_response(data=transaction_to_dict(tx))
