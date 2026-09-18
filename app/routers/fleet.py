import io
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from pydantic import BaseModel

from ..database import get_db
from ..models import FleetVehicle, FleetTransaction, FleetDamageRecord, FleetAccount, ExchangeRate, AuditAction, User
from ..tracking import create_audit_log
from ..core.responses import success_response
from ..core.errors import APIError
from ..auth_deps import require_permission
from ..id_gen import new_id
from ..export_utils import build_sectioned_pdf, build_sectioned_excel, ArabicFontUnavailable

router = APIRouter(tags=["Fleet (cars & heavy equipment sub-company)"])

PERM = "إدارة شركة بيان"


PAYMENT_METHODS = {"cash", "bank"}


class FleetVehicleCreate(BaseModel):
    name: str
    type: str
    serial_number: str | None = None  # رقم اللوحة
    chassis_number: str | None = None  # رقم الهيكل
    color: str | None = None
    manufacture_date: str | None = None
    operator: str | None = None
    status: str = "نشط"
    purchase_date: str | None = None
    purchase_price: float = 0.0
    purchase_payment_method: str | None = None  # cash, bank — required if purchase_price > 0
    purchase_account_id: str | None = None  # required if purchase_payment_method == "bank"
    currency: str
    notes: str | None = None


class FleetVehicleUpdate(BaseModel):
    """Purchase and sale fields are deliberately excluded — they're locked in
    once (purchase at creation, sale via the dedicated /sell action) because
    each one also books a real ledger transaction; a plain edit here must
    never silently desync the vehicle's fields from what the ledger says
    actually happened."""
    name: str
    type: str
    serial_number: str | None = None
    chassis_number: str | None = None
    color: str | None = None
    manufacture_date: str | None = None
    operator: str | None = None
    status: str = "نشط"
    currency: str
    notes: str | None = None


class FleetVehicleSell(BaseModel):
    buyer_name: str
    sale_price: float
    sale_date: str
    sale_payment_method: str  # cash, bank
    sale_account_id: str | None = None  # required if sale_payment_method == "bank" — this is what actually moves the money
    sale_bank_details: str | None = None  # free text the employee types by hand — purely descriptive
    notes: str | None = None


ACCOUNT_TYPES = {"company", "client"}


class FleetAccountCreate(BaseModel):
    name: str
    currency: str
    account_type: str = "company"  # company, client
    account_number: str | None = None
    bank_name: str | None = None
    notes: str | None = None


class FleetTransactionCreate(BaseModel):
    type: str  # income, expense
    category: str
    amount: float
    currency: str
    date: str
    notes: str | None = None
    account_id: str | None = None
    counterparty: str | None = None  # who the income came from / who the expense went to


class FleetDamageCreate(BaseModel):
    date: str
    description: str
    cost: float = 0.0
    currency: str
    reported_by: str | None = None
    status: str = "مُبلغ عنه"
    notes: str | None = None


class FleetDamageStatusUpdate(BaseModel):
    status: str


def _vehicle_balances(db: Session, vehicle_id: str) -> dict[str, float]:
    balances: dict[str, float] = {}
    for t in db.scalars(select(FleetTransaction).where(FleetTransaction.vehicle_id == vehicle_id)).all():
        delta = t.amount if t.type == "income" else -t.amount
        balances[t.currency] = balances.get(t.currency, 0.0) + delta
    for d in db.scalars(select(FleetDamageRecord).where(FleetDamageRecord.vehicle_id == vehicle_id)).all():
        balances[d.currency] = balances.get(d.currency, 0.0) - d.cost
    return balances


def vehicle_to_dict(v: FleetVehicle, balances: dict[str, float] | None = None, account_names: dict[str, str] | None = None):
    account_names = account_names or {}
    profit = (v.sale_price - v.purchase_price) if v.sale_price is not None else None
    return {
        "id": v.id,
        "autoNumber": v.auto_number,
        "name": v.name,
        "type": v.type,
        "serialNumber": v.serial_number,
        "chassisNumber": v.chassis_number,
        "color": v.color,
        "manufactureDate": v.manufacture_date,
        "operator": v.operator,
        "status": v.status,
        "purchaseDate": v.purchase_date,
        "purchasePrice": v.purchase_price,
        "purchasePaymentMethod": v.purchase_payment_method,
        "purchaseAccountId": v.purchase_account_id,
        "purchaseAccountName": account_names.get(v.purchase_account_id),
        "saleDate": v.sale_date,
        "buyerName": v.buyer_name,
        "salePrice": v.sale_price,
        "salePaymentMethod": v.sale_payment_method,
        "saleAccountId": v.sale_account_id,
        "saleAccountName": account_names.get(v.sale_account_id),
        "saleBankDetails": v.sale_bank_details,
        "profit": profit,
        "currency": v.currency,
        "notes": v.notes,
        "createdBy": v.created_by,
        "timestamp": v.timestamp,
        "balances": balances if balances is not None else {},
    }


def account_to_dict(a: FleetAccount):
    return {
        "id": a.id,
        "name": a.name,
        "currency": a.currency,
        "accountType": a.account_type,
        "balance": a.balance,
        "accountNumber": a.account_number,
        "bankName": a.bank_name,
        "notes": a.notes,
        "isActive": a.is_active,
        "createdBy": a.created_by,
        "timestamp": a.timestamp,
    }


def transaction_to_dict(t: FleetTransaction, account_name: str | None = None):
    return {
        "id": t.id,
        "vehicleId": t.vehicle_id,
        "type": t.type,
        "category": t.category,
        "amount": t.amount,
        "currency": t.currency,
        "date": t.date,
        "notes": t.notes,
        "createdBy": t.created_by,
        "timestamp": t.timestamp,
        "accountId": t.account_id,
        "accountName": account_name,
        "balanceAfter": t.balance_after,
        "counterparty": t.counterparty,
    }


def _to_lyd(db: Session, currency: str, amount: float) -> float:
    if currency == "LYD":
        return amount
    rate_row = db.scalar(select(ExchangeRate).where(ExchangeRate.from_currency == currency, ExchangeRate.to_currency == "LYD"))
    return amount * rate_row.sell_rate if rate_row else amount


def _apply_account_entry(db: Session, account_id: str, currency: str, entry_type: str, amount: float, expected_account_type: str | None = None) -> tuple[FleetAccount, float]:
    """Validates and books an income/expense amount against a real FleetAccount.
    Shared by manual ledger entries, vehicle purchases paid from a bank
    account, and vehicle sales collected into one. expected_account_type
    enforces the purchase-from-company / sale-into-client split server-side —
    not just in what the UI offers to pick from."""
    account = db.get(FleetAccount, account_id)
    if not account:
        raise APIError(code="ACCOUNT_NOT_FOUND", message_ar="الحساب المحدد غير موجود", message_en="Account not found", status_code=400)
    if account.currency != currency:
        raise APIError(code="CURRENCY_MISMATCH", message_ar=f"عملة الحساب ({account.currency}) لا تطابق العملة المطلوبة ({currency})", message_en="Account currency does not match", status_code=400)
    if expected_account_type and account.account_type != expected_account_type:
        wanted_ar = "حساب شركة" if expected_account_type == "company" else "حساب عميل"
        raise APIError(code="WRONG_ACCOUNT_TYPE", message_ar=f"يجب اختيار {wanted_ar} لهذه العملية", message_en=f"Expected a '{expected_account_type}' account for this operation", status_code=400)
    if entry_type == "income":
        account.balance += amount
    else:
        if account.balance < amount:
            raise APIError(code="INSUFFICIENT_BALANCE", message_ar=f"رصيد الحساب غير كافٍ ({account.balance} {account.currency})", message_en="Insufficient account balance", status_code=400)
        account.balance -= amount
    return account, account.balance


def _next_fleet_auto_number(db: Session) -> int:
    return (db.scalar(select(func.max(FleetVehicle.auto_number))) or 0) + 1


def damage_to_dict(d: FleetDamageRecord):
    return {
        "id": d.id,
        "vehicleId": d.vehicle_id,
        "date": d.date,
        "description": d.description,
        "cost": d.cost,
        "currency": d.currency,
        "reportedBy": d.reported_by,
        "status": d.status,
        "notes": d.notes,
        "createdBy": d.created_by,
        "timestamp": d.timestamp,
    }


# ----------------- VEHICLES -----------------
@router.get("/fleet/vehicles")
def list_fleet_vehicles(db: Session = Depends(get_db)):
    vehicles = db.scalars(select(FleetVehicle)).all()
    account_names = {a.id: a.name for a in db.scalars(select(FleetAccount)).all()}
    return success_response(data=[vehicle_to_dict(v, _vehicle_balances(db, v.id), account_names) for v in vehicles])


@router.post("/fleet/vehicles")
def create_fleet_vehicle(data: FleetVehicleCreate, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    if data.purchase_price > 0:
        if data.purchase_payment_method not in PAYMENT_METHODS:
            raise APIError(code="PAYMENT_METHOD_REQUIRED", message_ar="حدد طريقة الدفع (نقدي أو بنك) لسعر الشراء", message_en="A payment method (cash or bank) is required when purchase_price > 0", status_code=400)
        if data.purchase_payment_method == "bank" and not data.purchase_account_id:
            raise APIError(code="ACCOUNT_REQUIRED", message_ar="يجب اختيار الحساب البنكي المستخدم للشراء", message_en="A bank account is required for a bank purchase", status_code=400)

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    vehicle_id = new_id("fleet")

    account, balance_after = None, None
    if data.purchase_price > 0 and data.purchase_payment_method == "bank":
        account, balance_after = _apply_account_entry(db, data.purchase_account_id, data.currency, "expense", data.purchase_price, expected_account_type="company")

    v = FleetVehicle(
        id=vehicle_id, auto_number=_next_fleet_auto_number(db), name=data.name.strip(), type=data.type.strip(),
        serial_number=(data.serial_number or "").strip() or None,
        chassis_number=(data.chassis_number or "").strip() or None,
        color=(data.color or "").strip() or None,
        manufacture_date=data.manufacture_date,
        operator=(data.operator or "").strip() or None,
        status=data.status, purchase_date=data.purchase_date, purchase_price=data.purchase_price,
        purchase_payment_method=data.purchase_payment_method if data.purchase_price > 0 else None,
        purchase_account_id=account.id if account else None,
        currency=data.currency, notes=data.notes, created_by=actor.name, timestamp=timestamp,
    )
    db.add(v)

    if data.purchase_price > 0:
        db.add(FleetTransaction(
            id=new_id("fleettx"), vehicle_id=vehicle_id, type="expense", category="شراء المركبة/المعدة",
            amount=data.purchase_price, currency=data.currency, date=data.purchase_date or timestamp[:10],
            notes="قيد تلقائي عند إضافة المركبة", created_by=actor.name, timestamp=timestamp,
            account_id=account.id if account else None, balance_after=balance_after,
        ))

    create_audit_log(db, action=AuditAction.CREATE, entity_type="FleetVehicle", entity_id=v.id,
                      description=f"تمت إضافة مركبة/معدة إلى الأسطول: {v.name} (#{v.auto_number:03d})", username=actor.username)
    db.commit()
    account_names = {account.id: account.name} if account else {}
    return success_response(data=vehicle_to_dict(v, {}, account_names), message_ar="تمت إضافة المركبة بنجاح")


@router.put("/fleet/vehicles/{vehicle_id}")
def update_fleet_vehicle(vehicle_id: str, data: FleetVehicleUpdate, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    v = db.get(FleetVehicle, vehicle_id)
    if not v:
        raise APIError(code="NOT_FOUND", message_ar="المركبة غير موجودة", message_en="Vehicle not found", status_code=404)
    v.name = data.name.strip()
    v.type = data.type.strip()
    v.serial_number = (data.serial_number or "").strip() or None
    v.chassis_number = (data.chassis_number or "").strip() or None
    v.color = (data.color or "").strip() or None
    v.manufacture_date = data.manufacture_date
    v.operator = (data.operator or "").strip() or None
    v.status = data.status
    v.currency = data.currency
    v.notes = data.notes
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="FleetVehicle", entity_id=vehicle_id,
                      description=f"تم تعديل بيانات مركبة/معدة الأسطول: {v.name}", username=actor.username)
    db.commit()
    account_names = {a.id: a.name for a in db.scalars(select(FleetAccount)).all()}
    return success_response(data=vehicle_to_dict(v, _vehicle_balances(db, vehicle_id), account_names), message_ar="تم تعديل البيانات بنجاح")


@router.post("/fleet/vehicles/{vehicle_id}/sell")
def sell_fleet_vehicle(vehicle_id: str, data: FleetVehicleSell, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    v = db.get(FleetVehicle, vehicle_id)
    if not v:
        raise APIError(code="NOT_FOUND", message_ar="المركبة غير موجودة", message_en="Vehicle not found", status_code=404)
    if v.sale_price is not None:
        raise APIError(code="ALREADY_SOLD", message_ar=f"هذه المركبة مباعة بالفعل بتاريخ {v.sale_date}", message_en="This vehicle was already sold", status_code=400)
    if data.sale_price <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون سعر البيع أكبر من صفر", message_en="Sale price must be positive", status_code=400)
    if data.sale_payment_method not in PAYMENT_METHODS:
        raise APIError(code="INVALID_PAYMENT_METHOD", message_ar="طريقة الدفع يجب أن تكون نقدي أو بنك", message_en="Payment method must be 'cash' or 'bank'", status_code=400)
    if data.sale_payment_method == "bank" and not data.sale_account_id:
        raise APIError(code="ACCOUNT_REQUIRED", message_ar="يجب اختيار الحساب البنكي الذي استلم قيمة البيع", message_en="A bank account is required for a bank sale", status_code=400)

    account, balance_after = None, None
    if data.sale_payment_method == "bank":
        account, balance_after = _apply_account_entry(db, data.sale_account_id, v.currency, "income", data.sale_price, expected_account_type="client")

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    buyer_name = data.buyer_name.strip()
    bank_details = (data.sale_bank_details or "").strip() or None
    v.status = "تم البيع"
    v.sale_date = data.sale_date
    v.buyer_name = buyer_name
    v.sale_price = data.sale_price
    v.sale_payment_method = data.sale_payment_method
    v.sale_account_id = account.id if account else None
    v.sale_bank_details = bank_details

    tx_notes = data.notes or ""
    if bank_details:
        tx_notes = f"{tx_notes} — تفاصيل الحساب البنكي: {bank_details}".strip(" —")
    db.add(FleetTransaction(
        id=new_id("fleettx"), vehicle_id=vehicle_id, type="income", category="بيع المركبة/المعدة",
        amount=data.sale_price, currency=v.currency, date=data.sale_date, notes=tx_notes or None,
        created_by=actor.name, timestamp=timestamp, account_id=account.id if account else None,
        balance_after=balance_after, counterparty=buyer_name,
    ))

    profit = data.sale_price - v.purchase_price
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="FleetVehicle", entity_id=vehicle_id,
                      description=f"تم بيع {v.name} (#{v.auto_number:03d}) للمشتري {buyer_name} بمبلغ {data.sale_price} {v.currency} — الربح: {profit:,.2f} {v.currency}",
                      username=actor.username)
    db.commit()
    account_names = {account.id: account.name} if account else {}
    return success_response(data=vehicle_to_dict(v, _vehicle_balances(db, vehicle_id), account_names), message_ar="تم تسجيل عملية البيع بنجاح")


@router.delete("/fleet/vehicles/{vehicle_id}")
def delete_fleet_vehicle(vehicle_id: str, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    v = db.get(FleetVehicle, vehicle_id)
    if not v:
        raise APIError(code="NOT_FOUND", message_ar="المركبة غير موجودة", message_en="Vehicle not found", status_code=404)
    for t in db.scalars(select(FleetTransaction).where(FleetTransaction.vehicle_id == vehicle_id)).all():
        if t.account_id:
            account = db.get(FleetAccount, t.account_id)
            if account:
                # Same reversal delete_fleet_transaction does — without this,
                # deleting a vehicle (which cascades its transactions, including
                # the purchase/sale entries that book a real account balance)
                # would leave that account's balance permanently wrong.
                account.balance += t.amount if t.type == "expense" else -t.amount
        db.delete(t)
    for d in db.scalars(select(FleetDamageRecord).where(FleetDamageRecord.vehicle_id == vehicle_id)).all():
        db.delete(d)
    db.delete(v)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="FleetVehicle", entity_id=vehicle_id,
                      description=f"تم حذف مركبة/معدة الأسطول: {v.name} وكل سجلاتها المالية وسجلات الأضرار", username=actor.username)
    db.commit()
    return success_response(data={"deleted": True})


# ----------------- ACCOUNTS (real money-holding accounts for بيان) -----------------
@router.get("/fleet/accounts")
def list_fleet_accounts(db: Session = Depends(get_db)):
    res = db.scalars(select(FleetAccount).order_by(FleetAccount.timestamp)).all()
    return success_response(data=[account_to_dict(a) for a in res])


@router.post("/fleet/accounts")
def create_fleet_account(data: FleetAccountCreate, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    if data.account_type not in ACCOUNT_TYPES:
        raise APIError(code="INVALID_ACCOUNT_TYPE", message_ar="نوع الحساب يجب أن يكون حساب شركة أو حساب عميل", message_en="account_type must be 'company' or 'client'", status_code=400)
    a = FleetAccount(
        id=new_id("fleetacc"), name=data.name.strip(), currency=data.currency, account_type=data.account_type,
        account_number=(data.account_number or "").strip() or None, bank_name=(data.bank_name or "").strip() or None,
        notes=data.notes, is_active=True, created_by=actor.name, timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
    )
    db.add(a)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="FleetAccount", entity_id=a.id,
                      description=f"تمت إضافة {'حساب شركة' if data.account_type == 'company' else 'حساب عميل'} لشركة بيان: {a.name} ({a.currency})", username=actor.username)
    db.commit()
    return success_response(data=account_to_dict(a), message_ar="تمت إضافة الحساب بنجاح")


@router.put("/fleet/accounts/{account_id}")
def update_fleet_account(account_id: str, data: FleetAccountCreate, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    a = db.get(FleetAccount, account_id)
    if not a:
        raise APIError(code="NOT_FOUND", message_ar="الحساب غير موجود", message_en="Account not found", status_code=404)
    a.name = data.name.strip()
    a.account_number = (data.account_number or "").strip() or None
    a.bank_name = (data.bank_name or "").strip() or None
    a.notes = data.notes
    # Currency and account_type are deliberately not editable once transactions
    # may already reference this account's balance/purpose.
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="FleetAccount", entity_id=account_id,
                      description=f"تم تعديل بيانات حساب بيان: {a.name}", username=actor.username)
    db.commit()
    return success_response(data=account_to_dict(a), message_ar="تم تعديل البيانات بنجاح")


@router.delete("/fleet/accounts/{account_id}")
def delete_fleet_account(account_id: str, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    a = db.get(FleetAccount, account_id)
    if not a:
        raise APIError(code="NOT_FOUND", message_ar="الحساب غير موجود", message_en="Account not found", status_code=404)
    if db.scalar(select(FleetTransaction).where(FleetTransaction.account_id == account_id)) is not None:
        raise APIError(code="ACCOUNT_IN_USE", message_ar="لا يمكن حذف حساب له قيود مسجلة — عطّله بدلاً من ذلك", message_en="Cannot delete an account with recorded transactions", status_code=400)
    db.delete(a)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="FleetAccount", entity_id=account_id,
                      description=f"تم حذف حساب بيان: {a.name}", username=actor.username)
    db.commit()
    return success_response(data={"deleted": True})


@router.put("/fleet/accounts/{account_id}/toggle_active")
def toggle_fleet_account_active(account_id: str, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    a = db.get(FleetAccount, account_id)
    if not a:
        raise APIError(code="NOT_FOUND", message_ar="الحساب غير موجود", message_en="Account not found", status_code=404)
    a.is_active = not a.is_active
    db.commit()
    return success_response(data=account_to_dict(a))


# ----------------- COMPANY-WIDE DASHBOARD -----------------
def _date_filtered(query, model, date_from: str, date_to: str):
    if date_from:
        query = query.where(model.date >= date_from)
    if date_to:
        query = query.where(model.date <= date_to)
    return query


@router.get("/fleet/summary")
def fleet_summary(date_from: str = "", date_to: str = "", db: Session = Depends(get_db)):
    """Company-wide KPIs across every vehicle/equipment — total income, total
    costs (expenses + damages) and net profit, everything converted to its LYD
    equivalent (same convention as the rest of the app's profit reports), plus
    a breakdown by category so rental income can be told apart from sale
    income, purchase cost from maintenance cost, etc."""
    vehicles = db.scalars(select(FleetVehicle)).all()
    status_counts: dict[str, int] = {}
    for v in vehicles:
        status_counts[v.status] = status_counts.get(v.status, 0) + 1

    income_by_category: dict[str, float] = {}
    expense_by_category: dict[str, float] = {}
    total_income = 0.0
    total_expense = 0.0
    tx_query = _date_filtered(select(FleetTransaction), FleetTransaction, date_from, date_to)
    for t in db.scalars(tx_query).all():
        lyd = _to_lyd(db, t.currency, t.amount)
        if t.type == "income":
            total_income += lyd
            income_by_category[t.category] = income_by_category.get(t.category, 0.0) + lyd
        else:
            total_expense += lyd
            expense_by_category[t.category] = expense_by_category.get(t.category, 0.0) + lyd

    total_damage = 0.0
    dmg_query = _date_filtered(select(FleetDamageRecord), FleetDamageRecord, date_from, date_to)
    for d in db.scalars(dmg_query).all():
        total_damage += _to_lyd(db, d.currency, d.cost)

    total_costs = total_expense + total_damage
    return success_response(data={
        "vehicleCount": len(vehicles),
        "statusCounts": status_counts,
        "totalIncomeLyd": total_income,
        "totalExpenseLyd": total_expense,
        "totalDamageCostLyd": total_damage,
        "totalCostsLyd": total_costs,
        "netProfitLyd": total_income - total_costs,
        "incomeByCategoryLyd": income_by_category,
        "expenseByCategoryLyd": expense_by_category,
    })


@router.get("/fleet/transactions")
def list_all_fleet_transactions(date_from: str = "", date_to: str = "", db: Session = Depends(get_db)):
    """The consolidated statement across every vehicle — same rows as each
    vehicle's own ledger, just merged and carrying the vehicle's name."""
    names = {v.id: v.name for v in db.scalars(select(FleetVehicle)).all()}
    account_names = {a.id: a.name for a in db.scalars(select(FleetAccount)).all()}
    query = _date_filtered(select(FleetTransaction), FleetTransaction, date_from, date_to)
    res = db.scalars(query.order_by(FleetTransaction.date.desc(), FleetTransaction.timestamp.desc())).all()
    return success_response(data=[{**transaction_to_dict(t, account_names.get(t.account_id)), "vehicleName": names.get(t.vehicle_id, "—")} for t in res])


def _fleet_statement_sections(db: Session, date_from: str, date_to: str):
    """The company-wide statement, with real دخول/خروج columns like every
    other statement in the app, PLUS من/إلى (from/to) columns naming both
    sides of the movement. Every operation here is inherently two-sided —
    money leaves the "من" party and lands in the "إلى" party at the same
    moment, exactly like a customer deposit/withdrawal elsewhere in the app —
    so both دخول and خروج always carry the same amount on every row, not just
    whichever side happens to be "income" or "expense" from the company's
    point of view."""
    names = {v.id: v.name for v in db.scalars(select(FleetVehicle)).all()}
    all_accounts = {a.id: a for a in db.scalars(select(FleetAccount)).all()}
    account_names = {aid: a.name for aid, a in all_accounts.items()}
    query = _date_filtered(select(FleetTransaction), FleetTransaction, date_from, date_to)
    res = db.scalars(query.order_by(FleetTransaction.date, FleetTransaction.timestamp)).all()

    headers = ["م", "التاريخ", "المركبة/المعدة", "التفاصيل", "دخول", "خروج", "العملة", "من", "إلى", "الرصيد بعد", "ملاحظات", "بواسطة"]
    rows = []
    totals: dict[str, dict[str, float]] = {}
    for i, t in enumerate(res, start=1):
        totals.setdefault(t.currency, {"in": 0.0, "out": 0.0})
        totals[t.currency]["in" if t.type == "income" else "out"] += t.amount
        account_label = account_names.get(t.account_id, "—")
        counterparty_label = t.counterparty or "—"
        from_label, to_label = (counterparty_label, account_label) if t.type == "income" else (account_label, counterparty_label)
        amount_str = f"{t.amount:,.2f}"
        # A client account's balance isn't a meaningful cash figure to publish
        # in the statement — never show it, same as the on-screen table.
        linked_account = all_accounts.get(t.account_id)
        show_balance = t.balance_after is not None and not (linked_account and linked_account.account_type == "client")
        rows.append([
            i, t.date, names.get(t.vehicle_id, "—"), t.category,
            amount_str, amount_str,
            t.currency, from_label, to_label,
            f"{t.balance_after:,.2f}" if show_balance else "—",
            t.notes or "", t.created_by,
        ])
    closing_line = "الإجمالي: " + (
        ", ".join(f"{ccy} — دخول {v['in']:,.2f} / خروج {v['out']:,.2f}" for ccy, v in totals.items())
        or "لا توجد حركات في هذه الفترة"
    )
    return [("كشف حركات شركة بيان", headers, rows)], closing_line


@router.get("/fleet/statement")
def get_fleet_statement(date_from: str = "", date_to: str = "", db: Session = Depends(get_db)):
    sections, closing_line = _fleet_statement_sections(db, date_from, date_to)
    return success_response(data={
        "sections": [{"name": name, "headers": headers, "rows": rows} for name, headers, rows in sections],
        "closingLine": closing_line,
    })


@router.get("/fleet/statement/export")
def export_fleet_statement(format: str = "pdf", date_from: str = "", date_to: str = "", actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    sections, closing_line = _fleet_statement_sections(db, date_from, date_to)
    if format == "xlsx":
        buf = build_sectioned_excel(sections)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": 'attachment; filename="statement_bayan.xlsx"'})
    try:
        buf = build_sectioned_pdf("كشف حركات شركة بيان", sections, closing_line)
    except ArabicFontUnavailable as e:
        raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء كشف الحساب: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="statement_bayan.pdf"'})


@router.get("/fleet/damage")
def list_all_fleet_damage_records(date_from: str = "", date_to: str = "", db: Session = Depends(get_db)):
    names = {v.id: v.name for v in db.scalars(select(FleetVehicle)).all()}
    query = _date_filtered(select(FleetDamageRecord), FleetDamageRecord, date_from, date_to)
    res = db.scalars(query.order_by(FleetDamageRecord.date.desc(), FleetDamageRecord.timestamp.desc())).all()
    return success_response(data=[{**damage_to_dict(d), "vehicleName": names.get(d.vehicle_id, "—")} for d in res])


# ----------------- TRANSACTIONS (income/expense ledger) -----------------
@router.get("/fleet/vehicles/{vehicle_id}/transactions")
def list_fleet_transactions(vehicle_id: str, db: Session = Depends(get_db)):
    res = db.scalars(select(FleetTransaction).where(FleetTransaction.vehicle_id == vehicle_id).order_by(FleetTransaction.date.desc(), FleetTransaction.timestamp.desc())).all()
    account_names = {a.id: a.name for a in db.scalars(select(FleetAccount)).all()}
    return success_response(data=[transaction_to_dict(t, account_names.get(t.account_id)) for t in res])


@router.post("/fleet/vehicles/{vehicle_id}/transactions")
def create_fleet_transaction(vehicle_id: str, data: FleetTransactionCreate, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    if data.type not in ("income", "expense"):
        raise APIError(code="INVALID_TYPE", message_ar="نوع القيد يجب أن يكون إيراد أو مصروف", message_en="type must be 'income' or 'expense'", status_code=400)
    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون المبلغ أكبر من صفر", message_en="Amount must be positive", status_code=400)
    v = db.get(FleetVehicle, vehicle_id)
    if not v:
        raise APIError(code="NOT_FOUND", message_ar="المركبة غير موجودة", message_en="Vehicle not found", status_code=404)

    account, balance_after = None, None
    if data.account_id:
        account, balance_after = _apply_account_entry(db, data.account_id, data.currency, data.type, data.amount)

    t = FleetTransaction(
        id=new_id("fleettx"), vehicle_id=vehicle_id, type=data.type, category=data.category.strip(),
        amount=data.amount, currency=data.currency, date=data.date, notes=data.notes,
        created_by=actor.name, timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        account_id=account.id if account else None, balance_after=balance_after,
        counterparty=(data.counterparty or "").strip() or None,
    )
    db.add(t)
    account_note = f" — عبر حساب {account.name}" if account else ""
    create_audit_log(db, action=AuditAction.CREATE, entity_type="FleetTransaction", entity_id=t.id,
                      description=f"{'إيراد' if data.type == 'income' else 'مصروف'} {data.amount} {data.currency} على {v.name} ({data.category}){account_note}", username=actor.username)
    db.commit()
    return success_response(data=transaction_to_dict(t, account.name if account else None), message_ar="تمت إضافة القيد بنجاح")


@router.delete("/fleet/transactions/{transaction_id}")
def delete_fleet_transaction(transaction_id: str, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    t = db.get(FleetTransaction, transaction_id)
    if not t:
        raise APIError(code="NOT_FOUND", message_ar="القيد غير موجود", message_en="Transaction not found", status_code=404)
    if t.account_id:
        account = db.get(FleetAccount, t.account_id)
        if account:
            # Reverse exactly what this entry did to the account's balance so
            # deleting it never leaves money silently vanished or duplicated.
            account.balance += t.amount if t.type == "expense" else -t.amount
    db.delete(t)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="FleetTransaction", entity_id=transaction_id,
                      description="تم حذف قيد مالي من سجل الأسطول", username=actor.username)
    db.commit()
    return success_response(data={"deleted": True})


# ----------------- DAMAGE RECORDS -----------------
@router.get("/fleet/vehicles/{vehicle_id}/damage")
def list_fleet_damage_records(vehicle_id: str, db: Session = Depends(get_db)):
    res = db.scalars(select(FleetDamageRecord).where(FleetDamageRecord.vehicle_id == vehicle_id).order_by(FleetDamageRecord.date.desc(), FleetDamageRecord.timestamp.desc())).all()
    return success_response(data=[damage_to_dict(d) for d in res])


@router.post("/fleet/vehicles/{vehicle_id}/damage")
def create_fleet_damage_record(vehicle_id: str, data: FleetDamageCreate, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    v = db.get(FleetVehicle, vehicle_id)
    if not v:
        raise APIError(code="NOT_FOUND", message_ar="المركبة غير موجودة", message_en="Vehicle not found", status_code=404)
    d = FleetDamageRecord(
        id=new_id("fleetdmg"), vehicle_id=vehicle_id, date=data.date, description=data.description,
        cost=data.cost, currency=data.currency, reported_by=(data.reported_by or "").strip() or None,
        status=data.status, notes=data.notes, created_by=actor.name, timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
    )
    db.add(d)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="FleetDamageRecord", entity_id=d.id,
                      description=f"تم تسجيل ضرر على {v.name}: {data.description} ({data.cost} {data.currency})", username=actor.username)
    db.commit()
    return success_response(data=damage_to_dict(d), message_ar="تم تسجيل الضرر بنجاح")


@router.put("/fleet/damage/{damage_id}")
def update_fleet_damage_status(damage_id: str, data: FleetDamageStatusUpdate, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    d = db.get(FleetDamageRecord, damage_id)
    if not d:
        raise APIError(code="NOT_FOUND", message_ar="سجل الضرر غير موجود", message_en="Damage record not found", status_code=404)
    d.status = data.status
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="FleetDamageRecord", entity_id=damage_id,
                      description=f"تم تحديث حالة سجل الضرر إلى {data.status}", username=actor.username)
    db.commit()
    return success_response(data=damage_to_dict(d), message_ar="تم تحديث الحالة بنجاح")


@router.delete("/fleet/damage/{damage_id}")
def delete_fleet_damage_record(damage_id: str, actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    d = db.get(FleetDamageRecord, damage_id)
    if not d:
        raise APIError(code="NOT_FOUND", message_ar="سجل الضرر غير موجود", message_en="Damage record not found", status_code=404)
    db.delete(d)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="FleetDamageRecord", entity_id=damage_id,
                      description="تم حذف سجل ضرر من سجل الأسطول", username=actor.username)
    db.commit()
    return success_response(data={"deleted": True})
