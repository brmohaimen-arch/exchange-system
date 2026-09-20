import io
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from pydantic import BaseModel

from ..database import get_db
from ..models import FleetVehicle, FleetTransaction, FleetDamageRecord, FleetAccount, ExchangeRate, AuditAction, User
from ..tracking import create_audit_log
from ..core.responses import success_response
from ..core.errors import APIError
from ..auth_deps import require_permission, get_current_user
from ..models import Role
from ..id_gen import new_id
from ..export_utils import build_sectioned_pdf, build_sectioned_excel, ArabicFontUnavailable

router = APIRouter(tags=["Fleet (cars & heavy equipment sub-company)"])

PERM = "إدارة شركة بيان"
COMPANY_PERMS = {"bayan": "إدارة شركة بيان", "imtiaz": "إدارة شركة الامتياز"}
COMPANY_NAMES = {"bayan": "شركة بيان", "imtiaz": "شركة الامتياز"}


def get_company(request: Request) -> str:
    """This router is mounted twice (/api and /api/imtiaz); the mount decides
    which sub-company a request belongs to, so both share identical logic."""
    return "imtiaz" if request.url.path.startswith("/api/imtiaz/") else "bayan"


def fleet_actor(company: str = Depends(get_company), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    perm = COMPANY_PERMS[company]
    role = db.get(Role, current_user.role)
    if perm not in (role.permissions if role else []):
        raise APIError(code="FORBIDDEN", message_ar=f"لا تملك صلاحية تنفيذ هذا الإجراء: {perm}", message_en=f"Missing required permission: {perm}", status_code=403)
    return current_user


def _company_vehicle_ids(db: Session, company: str) -> list[str]:
    return list(db.scalars(select(FleetVehicle.id).where(FleetVehicle.company == company)).all())


PAYMENT_METHODS = {"cash", "bank"}


class FleetVehicleCreate(BaseModel):
    name: str
    type: str
    serial_number: str | None = None  # رقم اللوحة
    chassis_number: str | None = None  # رقم الهيكل
    color: str | None = None
    manufacture_date: str | None = None
    operator: str | None = None
    status: str = "عرض"
    purchase_date: str | None = None
    purchase_price: float = 0.0
    purchase_payment_method: str | None = None  # cash, bank — required if purchase_price > 0
    purchase_account_id: str | None = None  # required if purchase_payment_method == "bank"
    currency: str
    notes: str | None = None


class FleetVehicleUpdate(BaseModel):
    """Sale fields are excluded (they go through the dedicated /sell action).
    The purchase price IS editable, but only via _rebook_purchase below, which
    keeps the ledger entry and the paying account in sync with the new price."""
    name: str
    type: str
    serial_number: str | None = None
    chassis_number: str | None = None
    color: str | None = None
    manufacture_date: str | None = None
    operator: str | None = None
    status: str = "عرض"
    currency: str
    notes: str | None = None
    # Purchase price stays editable after creation; changing it re-books the
    # linked purchase ledger entry and the account/wallet it was paid from.
    purchase_price: float | None = None
    purchase_date: str | None = None
    purchase_payment_method: str | None = None
    purchase_account_id: str | None = None


class FleetVehicleSell(BaseModel):
    buyer_name: str
    sale_price: float
    sale_date: str
    sale_payment_method: str  # cash, bank
    sale_account_id: str | None = None  # required if sale_payment_method == "bank" — the بيان company account the money actually lands in
    sale_client_account_id: str | None = None  # optional — if the buyer has a tracked client account, it's drawn down by the sale price
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
        "saleClientAccountId": v.sale_client_account_id,
        "saleClientAccountName": account_names.get(v.sale_client_account_id),
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


WALLET_NAME = "محفظة بيان النقدية"


def _get_cash_wallet(db: Session, currency: str, company: str = "bayan") -> FleetAccount:
    """بيان's built-in cash wallet for one currency — created on first use.
    Every cash-paid purchase/sale/manual entry (anything not tied to a named
    bank/company account) moves this wallet's balance instead of floating
    unattached, so "cash on hand" is a real, auditable number."""
    wallet = db.scalar(select(FleetAccount).where(FleetAccount.account_type == "wallet", FleetAccount.currency == currency, FleetAccount.company == company))
    if not wallet:
        wallet = FleetAccount(
            id=new_id("fleetacc"), name=f"محفظة {COMPANY_NAMES[company]} النقدية ({currency})", currency=currency, account_type="wallet", company=company,
            balance=0.0, created_by="النظام", timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        )
        db.add(wallet)
        db.flush()
    return wallet


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
        wanted_ar = {"company": "حساب شركة", "client": "حساب عميل", "wallet": "المحفظة النقدية"}.get(expected_account_type, expected_account_type)
        raise APIError(code="WRONG_ACCOUNT_TYPE", message_ar=f"يجب اختيار {wanted_ar} لهذه العملية", message_en=f"Expected a '{expected_account_type}' account for this operation", status_code=400)
    if entry_type == "income":
        account.balance += amount
    else:
        # A client account tracks a running trust relationship the same way a
        # customer's own wallet balance does elsewhere in the app — it's
        # allowed to go negative (meaning that client has now bought more
        # than they've paid in). Only a real company account, which must
        # reflect actual cash on hand, is blocked from going negative.
        # The cash wallet is a pure tracker, so it never blocks an operation.
        if account.account_type == "company" and account.balance < amount:
            raise APIError(code="INSUFFICIENT_BALANCE", message_ar=f"رصيد {account.name} غير كافٍ ({account.balance:,.2f} {account.currency})" + (" — اشحن المحفظة أولاً" if account.account_type == "wallet" else ""), message_en="Insufficient account balance", status_code=400)
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
def list_fleet_vehicles(company: str = Depends(get_company), db: Session = Depends(get_db)):
    vehicles = db.scalars(select(FleetVehicle).where(FleetVehicle.company == company)).all()
    account_names = {a.id: a.name for a in db.scalars(select(FleetAccount).where(FleetAccount.company == company)).all()}
    return success_response(data=[vehicle_to_dict(v, _vehicle_balances(db, v.id), account_names) for v in vehicles])


@router.post("/fleet/vehicles")
def create_fleet_vehicle(data: FleetVehicleCreate, actor: User = Depends(fleet_actor), company: str = Depends(get_company), db: Session = Depends(get_db)):
    if data.purchase_price > 0:
        if data.purchase_payment_method not in PAYMENT_METHODS:
            raise APIError(code="PAYMENT_METHOD_REQUIRED", message_ar="حدد طريقة الدفع (نقدي أو بنك) لسعر الشراء", message_en="A payment method (cash or bank) is required when purchase_price > 0", status_code=400)
        if data.purchase_payment_method == "bank" and not data.purchase_account_id:
            raise APIError(code="ACCOUNT_REQUIRED", message_ar="يجب اختيار الحساب البنكي المستخدم للشراء", message_en="A bank account is required for a bank purchase", status_code=400)

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    vehicle_id = new_id("fleet")

    account, balance_after = None, None
    wallet = None
    if data.purchase_price > 0 and data.purchase_payment_method == "bank":
        account, balance_after = _apply_account_entry(db, data.purchase_account_id, data.currency, "expense", data.purchase_price, expected_account_type="company")
    elif data.purchase_price > 0:
        wallet = _get_cash_wallet(db, data.currency, company)
        _, balance_after = _apply_account_entry(db, wallet.id, data.currency, "expense", data.purchase_price, expected_account_type="wallet")

    v = FleetVehicle(
        id=vehicle_id, company=company, auto_number=_next_fleet_auto_number(db), name=data.name.strip(), type=data.type.strip(),
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
            account_id=(account or wallet).id if (account or wallet) else None, balance_after=balance_after,
        ))

    create_audit_log(db, action=AuditAction.CREATE, entity_type="FleetVehicle", entity_id=v.id,
                      description=f"تمت إضافة مركبة/معدة إلى الأسطول: {v.name} (#{v.auto_number:03d})", username=actor.username)
    db.commit()
    account_names = {account.id: account.name} if account else {}
    return success_response(data=vehicle_to_dict(v, {}, account_names), message_ar="تمت إضافة المركبة بنجاح")


def _rebook_purchase(db: Session, v: FleetVehicle, data: "FleetVehicleUpdate", actor: User) -> bool:
    """Re-books a vehicle's purchase after its price/payment source was edited:
    reverses the old ledger entry's effect on its account, then applies the new
    price to the (possibly different) account/wallet. Returns True if anything
    changed. Raises before any commit, so a failure leaves nothing half-done."""
    new_price = data.purchase_price or 0.0
    if new_price < 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="سعر الشراء لا يمكن أن يكون سالباً", message_en="Purchase price cannot be negative", status_code=400)
    method = data.purchase_payment_method or v.purchase_payment_method
    account_id = data.purchase_account_id or v.purchase_account_id
    old_tx = db.scalar(select(FleetTransaction).where(FleetTransaction.vehicle_id == v.id, FleetTransaction.category == "شراء المركبة/المعدة"))
    unchanged = (
        abs(new_price - (v.purchase_price or 0.0)) < 1e-9
        and (new_price == 0 or (method == v.purchase_payment_method and (method != "bank" or account_id == v.purchase_account_id)))
    )
    if unchanged:
        return False
    if new_price > 0:
        if method not in PAYMENT_METHODS:
            raise APIError(code="PAYMENT_METHOD_REQUIRED", message_ar="حدد طريقة الدفع (نقدي أو بنك) لسعر الشراء", message_en="A payment method is required", status_code=400)
        if method == "bank" and not account_id:
            raise APIError(code="ACCOUNT_REQUIRED", message_ar="يجب اختيار الحساب البنكي المستخدم للشراء", message_en="A bank account is required", status_code=400)

    # 1. Undo the old entry's effect on whatever account it was paid from.
    if old_tx and old_tx.account_id:
        old_account = db.get(FleetAccount, old_tx.account_id)
        if old_account:
            old_account.balance += old_tx.amount

    # 2. Apply the new price.
    if new_price == 0:
        if old_tx:
            db.delete(old_tx)
        v.purchase_price, v.purchase_payment_method, v.purchase_account_id = 0.0, None, None
        return True
    if method == "bank":
        account, balance_after = _apply_account_entry(db, account_id, v.currency, "expense", new_price, expected_account_type="company")
        v.purchase_account_id = account.id
    else:
        account = _get_cash_wallet(db, v.currency, v.company)
        _, balance_after = _apply_account_entry(db, account.id, v.currency, "expense", new_price, expected_account_type="wallet")
        v.purchase_account_id = None
    v.purchase_price, v.purchase_payment_method = new_price, method
    if old_tx:
        old_tx.amount, old_tx.account_id, old_tx.balance_after = new_price, account.id, balance_after
        old_tx.date = v.purchase_date or old_tx.date
        old_tx.notes = "قيد الشراء — عُدّل السعر"
    else:
        ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
        db.add(FleetTransaction(
            id=new_id("fleettx"), vehicle_id=v.id, type="expense", category="شراء المركبة/المعدة",
            amount=new_price, currency=v.currency, date=v.purchase_date or ts[:10],
            notes="قيد شراء مُضاف بعد الإنشاء", created_by=actor.name, timestamp=ts,
            account_id=account.id, balance_after=balance_after,
        ))
    return True


@router.put("/fleet/vehicles/{vehicle_id}")
def update_fleet_vehicle(vehicle_id: str, data: FleetVehicleUpdate, actor: User = Depends(fleet_actor), db: Session = Depends(get_db)):
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
    v.notes = data.notes
    price_note = ""
    if data.purchase_price is not None:
        old_price = v.purchase_price or 0.0
        if data.currency != v.currency and (old_price > 0 or v.sale_price is not None):
            raise APIError(code="CURRENCY_LOCKED", message_ar="لا يمكن تغيير عملة مركبة لها قيود شراء أو بيع", message_en="Cannot change currency once purchase/sale is booked", status_code=400)
        v.currency = data.currency
        if data.purchase_date:
            v.purchase_date = data.purchase_date
        if _rebook_purchase(db, v, data, actor):
            price_note = f" — سعر الشراء من {old_price:,.2f} إلى {v.purchase_price:,.2f} {v.currency}"
    else:
        v.currency = data.currency
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="FleetVehicle", entity_id=vehicle_id,
                      description=f"تم تعديل بيانات مركبة/معدة الأسطول: {v.name}{price_note}", username=actor.username)
    db.commit()
    account_names = {a.id: a.name for a in db.scalars(select(FleetAccount)).all()}
    return success_response(data=vehicle_to_dict(v, _vehicle_balances(db, vehicle_id), account_names), message_ar="تم تعديل البيانات بنجاح")


@router.post("/fleet/vehicles/{vehicle_id}/sell")
def sell_fleet_vehicle(vehicle_id: str, data: FleetVehicleSell, actor: User = Depends(fleet_actor), db: Session = Depends(get_db)):
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
        raise APIError(code="ACCOUNT_REQUIRED", message_ar="يجب اختيار حساب شركة بيان الذي استلم قيمة البيع", message_en="A بيان company account is required for a bank sale", status_code=400)

    # Two independent sides, exactly like a transfer: the sale price actually
    # LANDS in one of بيان's own company accounts (real cash — this is what
    # "الرصيد بعد" on the statement reflects), and — only if the buyer has a
    # client account on file — is drawn down FROM that account, the same way
    # a customer's own balance decreases when they draw on it elsewhere.
    # These are deliberately separate: the company side is where the money
    # really is, the client side is just a running tally of that buyer.
    company_account, balance_after = None, None
    if data.sale_payment_method == "bank":
        company_account, balance_after = _apply_account_entry(db, data.sale_account_id, v.currency, "income", data.sale_price, expected_account_type="company")
    wallet = None
    if data.sale_payment_method == "cash":
        wallet = _get_cash_wallet(db, v.currency, v.company)
        _, balance_after = _apply_account_entry(db, wallet.id, v.currency, "income", data.sale_price, expected_account_type="wallet")

    client_account = None
    if data.sale_client_account_id:
        client_account, _ = _apply_account_entry(db, data.sale_client_account_id, v.currency, "expense", data.sale_price, expected_account_type="client")

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    buyer_name = data.buyer_name.strip()
    bank_details = (data.sale_bank_details or "").strip() or None
    v.status = "تم البيع"
    v.sale_date = data.sale_date
    v.buyer_name = buyer_name
    v.sale_price = data.sale_price
    v.sale_payment_method = data.sale_payment_method
    v.sale_account_id = company_account.id if company_account else None
    v.sale_client_account_id = client_account.id if client_account else None
    v.sale_bank_details = bank_details

    tx_notes = data.notes or ""
    if bank_details:
        tx_notes = f"{tx_notes} — تفاصيل الحساب البنكي: {bank_details}".strip(" —")
    # "من" is whoever actually paid — the client account's own name when one
    # was used (so the statement names the real tracked account, not just a
    # typed label), otherwise the free-text buyer name.
    counterparty = client_account.name if client_account else buyer_name
    db.add(FleetTransaction(
        id=new_id("fleettx"), vehicle_id=vehicle_id, type="income", category="بيع المركبة/المعدة",
        amount=data.sale_price, currency=v.currency, date=data.sale_date, notes=tx_notes or None,
        created_by=actor.name, timestamp=timestamp, account_id=(company_account or wallet).id if (company_account or wallet) else None,
        balance_after=balance_after, counterparty=counterparty,
    ))

    profit = data.sale_price - v.purchase_price
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="FleetVehicle", entity_id=vehicle_id,
                      description=f"تم بيع {v.name} (#{v.auto_number:03d}) للمشتري {buyer_name} بمبلغ {data.sale_price} {v.currency} — الربح: {profit:,.2f} {v.currency}",
                      username=actor.username)
    db.commit()
    account_names = {}
    if company_account:
        account_names[company_account.id] = company_account.name
    if client_account:
        account_names[client_account.id] = client_account.name
    return success_response(data=vehicle_to_dict(v, _vehicle_balances(db, vehicle_id), account_names), message_ar="تم تسجيل عملية البيع بنجاح")


@router.delete("/fleet/vehicles/{vehicle_id}")
def delete_fleet_vehicle(vehicle_id: str, actor: User = Depends(fleet_actor), db: Session = Depends(get_db)):
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
    if v.sale_client_account_id and v.sale_price is not None:
        # The client-side draw-down from a sale has no FleetTransaction row of
        # its own (the transaction above is booked against the company
        # account only) — reverse it here directly or it stays wrong forever.
        client_account = db.get(FleetAccount, v.sale_client_account_id)
        if client_account:
            client_account.balance += v.sale_price
    for d in db.scalars(select(FleetDamageRecord).where(FleetDamageRecord.vehicle_id == vehicle_id)).all():
        db.delete(d)
    db.delete(v)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="FleetVehicle", entity_id=vehicle_id,
                      description=f"تم حذف مركبة/معدة الأسطول: {v.name} وكل سجلاتها المالية وسجلات الأضرار", username=actor.username)
    db.commit()
    return success_response(data={"deleted": True})


# ----------------- ACCOUNTS (real money-holding accounts for بيان) -----------------
@router.get("/fleet/accounts")
def list_fleet_accounts(company: str = Depends(get_company), db: Session = Depends(get_db)):
    # The cash wallet is a tracker only (see /fleet/wallets) — not a real account.
    res = db.scalars(select(FleetAccount).where(FleetAccount.account_type != "wallet", FleetAccount.company == company).order_by(FleetAccount.timestamp)).all()
    return success_response(data=[account_to_dict(a) for a in res])


@router.post("/fleet/accounts")
def create_fleet_account(data: FleetAccountCreate, actor: User = Depends(fleet_actor), company: str = Depends(get_company), db: Session = Depends(get_db)):
    if data.account_type not in ACCOUNT_TYPES:
        raise APIError(code="INVALID_ACCOUNT_TYPE", message_ar="نوع الحساب يجب أن يكون حساب شركة أو حساب عميل", message_en="account_type must be 'company' or 'client'", status_code=400)
    a = FleetAccount(
        id=new_id("fleetacc"), name=data.name.strip(), currency=data.currency, account_type=data.account_type, company=company,
        account_number=(data.account_number or "").strip() or None, bank_name=(data.bank_name or "").strip() or None,
        notes=data.notes, is_active=True, created_by=actor.name, timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
    )
    db.add(a)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="FleetAccount", entity_id=a.id,
                      description=f"تمت إضافة {'حساب شركة' if data.account_type == 'company' else 'حساب عميل'} لشركة بيان: {a.name} ({a.currency})", username=actor.username)
    db.commit()
    return success_response(data=account_to_dict(a), message_ar="تمت إضافة الحساب بنجاح")


@router.put("/fleet/accounts/{account_id}")
def update_fleet_account(account_id: str, data: FleetAccountCreate, actor: User = Depends(fleet_actor), db: Session = Depends(get_db)):
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
def delete_fleet_account(account_id: str, actor: User = Depends(fleet_actor), db: Session = Depends(get_db)):
    a = db.get(FleetAccount, account_id)
    if not a:
        raise APIError(code="NOT_FOUND", message_ar="الحساب غير موجود", message_en="Account not found", status_code=404)
    if a.account_type == "wallet":
        raise APIError(code="WALLET_PROTECTED", message_ar="لا يمكن حذف المحفظة النقدية المدمجة", message_en="The built-in cash wallet cannot be deleted", status_code=400)
    in_use = (
        db.scalar(select(FleetTransaction).where(FleetTransaction.account_id == account_id)) is not None
        or db.scalar(select(FleetVehicle).where(FleetVehicle.sale_client_account_id == account_id)) is not None
    )
    if in_use:
        raise APIError(code="ACCOUNT_IN_USE", message_ar="لا يمكن حذف حساب له قيود مسجلة — عطّله بدلاً من ذلك", message_en="Cannot delete an account with recorded transactions", status_code=400)
    db.delete(a)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="FleetAccount", entity_id=account_id,
                      description=f"تم حذف حساب بيان: {a.name}", username=actor.username)
    db.commit()
    return success_response(data={"deleted": True})


@router.put("/fleet/accounts/{account_id}/toggle_active")
def toggle_fleet_account_active(account_id: str, actor: User = Depends(fleet_actor), db: Session = Depends(get_db)):
    a = db.get(FleetAccount, account_id)
    if not a:
        raise APIError(code="NOT_FOUND", message_ar="الحساب غير موجود", message_en="Account not found", status_code=404)
    if a.account_type == "wallet":
        raise APIError(code="WALLET_PROTECTED", message_ar="لا يمكن تعطيل المحفظة النقدية المدمجة", message_en="The built-in cash wallet cannot be disabled", status_code=400)
    a.is_active = not a.is_active
    db.commit()
    return success_response(data=account_to_dict(a))


# ----------------- CASH WALLET -----------------
@router.get("/fleet/wallets")
def list_fleet_wallets(actor: User = Depends(fleet_actor), company: str = Depends(get_company), db: Session = Depends(get_db)):
    """Running cash balance per currency — tracks cash purchases/sales/manual
    cash entries only (no deposits, withdrawals or account management).
    Always includes LYD so the KPI card shows even before the first cash entry."""
    _get_cash_wallet(db, "LYD", company)
    db.commit()
    wallets = db.scalars(select(FleetAccount).where(FleetAccount.account_type == "wallet", FleetAccount.company == company).order_by(FleetAccount.currency)).all()
    return success_response(data=[account_to_dict(w) for w in wallets])


@router.get("/fleet/kpis")
def fleet_kpis(actor: User = Depends(fleet_actor), company: str = Depends(get_company), db: Session = Depends(get_db)):
    """بيان's weekly (last 7 days vs the 7 before) and monthly (this month vs
    last, plus 6-month trend) performance. Profit = income − expenses −
    damage costs, everything converted to LYD like /fleet/summary."""
    from datetime import timedelta
    today = datetime.utcnow().date()
    vids = set(_company_vehicle_ids(db, company))
    txs = [t for t in db.scalars(select(FleetTransaction)).all() if t.vehicle_id in vids]
    dmgs = [d for d in db.scalars(select(FleetDamageRecord)).all() if d.vehicle_id in vids]

    def period(start, end):
        a, b = start.isoformat(), end.isoformat()
        income = sum(_to_lyd(db, t.currency, t.amount) for t in txs if t.type == "income" and a <= t.date[:10] <= b)
        expense = sum(_to_lyd(db, t.currency, t.amount) for t in txs if t.type == "expense" and a <= t.date[:10] <= b)
        damage = sum(_to_lyd(db, d.currency, d.cost) for d in dmgs if a <= d.date[:10] <= b)
        count = sum(1 for t in txs if a <= t.date[:10] <= b)
        return {"income": round(income, 2), "expense": round(expense + damage, 2), "profit": round(income - expense - damage, 2), "count": count}

    def pct(cur, prev):
        return round((cur - prev) / abs(prev) * 100, 1) if prev else None

    def month_start(y, m):
        while m <= 0:
            m += 12
            y -= 1
        return datetime(y, m, 1).date()

    def month_end(st):
        return month_start(st.year + (st.month // 12), st.month % 12 + 1) - timedelta(days=1)

    w_start = today - timedelta(days=6)
    week = period(w_start, today)
    prev_week = period(w_start - timedelta(days=7), w_start - timedelta(days=1))
    daily = [{"date": (w_start + timedelta(days=i)).isoformat(), **period(w_start + timedelta(days=i), w_start + timedelta(days=i))} for i in range(7)]

    m_start = month_start(today.year, today.month)
    l_start = month_start(today.year, today.month - 1)
    month = period(m_start, today)
    prev_month = period(l_start, month_end(l_start))
    trend = []
    for back in range(5, -1, -1):
        st = month_start(today.year, today.month - back)
        trend.append({"month": st.strftime("%Y-%m"), **period(st, month_end(st))})

    return success_response(data={
        "week": {**week, "previous": prev_week, "profitChangePct": pct(week["profit"], prev_week["profit"]), "incomeChangePct": pct(week["income"], prev_week["income"]),
                 "from": w_start.isoformat(), "to": today.isoformat(), "daily": daily},
        "month": {**month, "previous": prev_month, "profitChangePct": pct(month["profit"], prev_month["profit"]), "incomeChangePct": pct(month["income"], prev_month["income"]),
                  "label": m_start.strftime("%Y-%m"), "trend": trend},
    })


# ----------------- COMPANY-WIDE DASHBOARD -----------------
def _date_filtered(query, model, date_from: str, date_to: str):
    if date_from:
        query = query.where(model.date >= date_from)
    if date_to:
        query = query.where(model.date <= date_to)
    return query


@router.get("/fleet/summary")
def fleet_summary(date_from: str = "", date_to: str = "", company: str = Depends(get_company), db: Session = Depends(get_db)):
    """Company-wide KPIs across every vehicle/equipment — total income, total
    costs (expenses + damages) and net profit, everything converted to its LYD
    equivalent (same convention as the rest of the app's profit reports), plus
    a breakdown by category so rental income can be told apart from sale
    income, purchase cost from maintenance cost, etc."""
    vehicles = db.scalars(select(FleetVehicle).where(FleetVehicle.company == company)).all()
    vids = [v.id for v in vehicles]
    status_counts: dict[str, int] = {}
    for v in vehicles:
        status_counts[v.status] = status_counts.get(v.status, 0) + 1

    income_by_category: dict[str, float] = {}
    expense_by_category: dict[str, float] = {}
    total_income = 0.0
    total_expense = 0.0
    tx_query = _date_filtered(select(FleetTransaction).where(FleetTransaction.vehicle_id.in_(vids)), FleetTransaction, date_from, date_to)
    for t in db.scalars(tx_query).all():
        lyd = _to_lyd(db, t.currency, t.amount)
        if t.type == "income":
            total_income += lyd
            income_by_category[t.category] = income_by_category.get(t.category, 0.0) + lyd
        else:
            total_expense += lyd
            expense_by_category[t.category] = expense_by_category.get(t.category, 0.0) + lyd

    total_damage = 0.0
    dmg_query = _date_filtered(select(FleetDamageRecord).where(FleetDamageRecord.vehicle_id.in_(vids)), FleetDamageRecord, date_from, date_to)
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
def list_all_fleet_transactions(date_from: str = "", date_to: str = "", company: str = Depends(get_company), db: Session = Depends(get_db)):
    """The consolidated statement across every vehicle — same rows as each
    vehicle's own ledger, just merged and carrying the vehicle's name."""
    names = {v.id: v.name for v in db.scalars(select(FleetVehicle).where(FleetVehicle.company == company)).all()}
    account_names = {a.id: a.name for a in db.scalars(select(FleetAccount).where(FleetAccount.company == company)).all()}
    query = _date_filtered(select(FleetTransaction).where(FleetTransaction.vehicle_id.in_(list(names))), FleetTransaction, date_from, date_to)
    res = db.scalars(query.order_by(FleetTransaction.date.desc(), FleetTransaction.timestamp.desc())).all()
    return success_response(data=[{**transaction_to_dict(t, account_names.get(t.account_id)), "vehicleName": names.get(t.vehicle_id, "—")} for t in res])


def _fleet_statement_sections(db: Session, date_from: str, date_to: str, company: str = "bayan"):
    """The company-wide statement, with real دخول/خروج columns like every
    other statement in the app, PLUS من/إلى (from/to) columns naming both
    sides of the movement. Every operation here is inherently two-sided —
    money leaves the "من" party and lands in the "إلى" party at the same
    moment, exactly like a customer deposit/withdrawal elsewhere in the app —
    and the amount sits in exactly one column: دخول for income, خروج for
    expense (from the company's point of view)."""
    names = {v.id: v.name for v in db.scalars(select(FleetVehicle).where(FleetVehicle.company == company)).all()}
    all_accounts = {a.id: a for a in db.scalars(select(FleetAccount).where(FleetAccount.company == company)).all()}
    account_names = {aid: a.name for aid, a in all_accounts.items()}
    query = _date_filtered(select(FleetTransaction).where(FleetTransaction.vehicle_id.in_(list(names))), FleetTransaction, date_from, date_to)
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
        entry_str, exit_str = (amount_str, "") if t.type == "income" else ("", amount_str)
        # A client account's balance isn't a meaningful cash figure to publish
        # in the statement — never show it, same as the on-screen table.
        linked_account = all_accounts.get(t.account_id)
        show_balance = t.balance_after is not None and not (linked_account and linked_account.account_type == "client")
        rows.append([
            i, t.date, names.get(t.vehicle_id, "—"), t.category,
            entry_str, exit_str,
            t.currency, from_label, to_label,
            f"{t.balance_after:,.2f}" if show_balance else "—",
            t.notes or "", t.created_by,
        ])
    closing_line = "الإجمالي: " + (
        ", ".join(f"{ccy} — دخول {v['in']:,.2f} / خروج {v['out']:,.2f}" for ccy, v in totals.items())
        or "لا توجد حركات في هذه الفترة"
    )
    return [(f"كشف حركات {COMPANY_NAMES[company]}", headers, rows)], closing_line


@router.get("/fleet/statement")
def get_fleet_statement(date_from: str = "", date_to: str = "", company: str = Depends(get_company), db: Session = Depends(get_db)):
    sections, closing_line = _fleet_statement_sections(db, date_from, date_to, company)
    return success_response(data={
        "sections": [{"name": name, "headers": headers, "rows": rows} for name, headers, rows in sections],
        "closingLine": closing_line,
    })


@router.get("/fleet/statement/export")
def export_fleet_statement(format: str = "pdf", date_from: str = "", date_to: str = "", actor: User = Depends(fleet_actor), company: str = Depends(get_company), db: Session = Depends(get_db)):
    sections, closing_line = _fleet_statement_sections(db, date_from, date_to, company)
    if format == "xlsx":
        buf = build_sectioned_excel(sections)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="statement_{company}.xlsx"'})
    try:
        buf = build_sectioned_pdf(f"كشف حركات {COMPANY_NAMES[company]}", sections, closing_line)
    except ArabicFontUnavailable as e:
        raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء كشف الحساب: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="statement_{company}.pdf"'})


@router.get("/fleet/damage")
def list_all_fleet_damage_records(date_from: str = "", date_to: str = "", company: str = Depends(get_company), db: Session = Depends(get_db)):
    names = {v.id: v.name for v in db.scalars(select(FleetVehicle).where(FleetVehicle.company == company)).all()}
    query = _date_filtered(select(FleetDamageRecord).where(FleetDamageRecord.vehicle_id.in_(list(names))), FleetDamageRecord, date_from, date_to)
    res = db.scalars(query.order_by(FleetDamageRecord.date.desc(), FleetDamageRecord.timestamp.desc())).all()
    return success_response(data=[{**damage_to_dict(d), "vehicleName": names.get(d.vehicle_id, "—")} for d in res])


# ----------------- TRANSACTIONS (income/expense ledger) -----------------
@router.get("/fleet/vehicles/{vehicle_id}/transactions")
def list_fleet_transactions(vehicle_id: str, db: Session = Depends(get_db)):
    res = db.scalars(select(FleetTransaction).where(FleetTransaction.vehicle_id == vehicle_id).order_by(FleetTransaction.date.desc(), FleetTransaction.timestamp.desc())).all()
    account_names = {a.id: a.name for a in db.scalars(select(FleetAccount)).all()}
    return success_response(data=[transaction_to_dict(t, account_names.get(t.account_id)) for t in res])


@router.post("/fleet/vehicles/{vehicle_id}/transactions")
def create_fleet_transaction(vehicle_id: str, data: FleetTransactionCreate, actor: User = Depends(fleet_actor), db: Session = Depends(get_db)):
    if data.type not in ("income", "expense"):
        raise APIError(code="INVALID_TYPE", message_ar="نوع القيد يجب أن يكون إيراد أو مصروف", message_en="type must be 'income' or 'expense'", status_code=400)
    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون المبلغ أكبر من صفر", message_en="Amount must be positive", status_code=400)
    v = db.get(FleetVehicle, vehicle_id)
    if not v:
        raise APIError(code="NOT_FOUND", message_ar="المركبة غير موجودة", message_en="Vehicle not found", status_code=404)

    # No named account = paid/received in cash → the cash wallet.
    account_id = data.account_id or _get_cash_wallet(db, data.currency, v.company).id
    account, balance_after = _apply_account_entry(db, account_id, data.currency, data.type, data.amount)

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
def delete_fleet_transaction(transaction_id: str, actor: User = Depends(fleet_actor), db: Session = Depends(get_db)):
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
def create_fleet_damage_record(vehicle_id: str, data: FleetDamageCreate, actor: User = Depends(fleet_actor), db: Session = Depends(get_db)):
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
def update_fleet_damage_status(damage_id: str, data: FleetDamageStatusUpdate, actor: User = Depends(fleet_actor), db: Session = Depends(get_db)):
    d = db.get(FleetDamageRecord, damage_id)
    if not d:
        raise APIError(code="NOT_FOUND", message_ar="سجل الضرر غير موجود", message_en="Damage record not found", status_code=404)
    d.status = data.status
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="FleetDamageRecord", entity_id=damage_id,
                      description=f"تم تحديث حالة سجل الضرر إلى {data.status}", username=actor.username)
    db.commit()
    return success_response(data=damage_to_dict(d), message_ar="تم تحديث الحالة بنجاح")


@router.delete("/fleet/damage/{damage_id}")
def delete_fleet_damage_record(damage_id: str, actor: User = Depends(fleet_actor), db: Session = Depends(get_db)):
    d = db.get(FleetDamageRecord, damage_id)
    if not d:
        raise APIError(code="NOT_FOUND", message_ar="سجل الضرر غير موجود", message_en="Damage record not found", status_code=404)
    db.delete(d)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="FleetDamageRecord", entity_id=damage_id,
                      description="تم حذف سجل ضرر من سجل الأسطول", username=actor.username)
    db.commit()
    return success_response(data={"deleted": True})
