from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from ..database import get_db
from ..models import (
    Branch, Vault, BankAccount, Customer, Shift, Transfer, ApprovalRequest, InventoryCount, DailyExpense,
    AuditAction, Notification, NotificationType, NotificationStatus, User, Role, JournalEntry, ExchangeRate,
    DailyClosing, Transaction, FixedAsset, Vehicle
)
from ..id_gen import new_id
from ..tracking import create_audit_log
from ..core.responses import success_response, error_response
from ..core.errors import APIError
from ..auth_deps import get_current_user, require_permission, check_branch_access
from ..whatsapp_gateway import send_manager_alert, get_setting as get_whatsapp_setting
from ..telegram_gateway import send_manager_alert as send_telegram_alert
from .business import apply_transaction_reversal
from pydantic import BaseModel
from typing import Dict, Literal
from datetime import datetime

router = APIRouter(tags=["Operations"])

# Branch DTOs
class BranchCreate(BaseModel):
    id: str
    name: str
    city: str
    address: str
    phone: str
    manager: str
    is_active: bool = True
    notes: str | None = None

# Vault DTOs
class VaultCreate(BaseModel):
    id: str
    name: str
    type: str
    branch: str
    manager: str
    balances: Dict[str, float]
    opening_balances: Dict[str, float]
    is_active: bool = True

class VaultBalanceUpdate(BaseModel):
    balances: Dict[str, float]

# Shift DTOs
class ShiftOpen(BaseModel):
    id: str
    cashier: str
    branch: str
    vault_id: str
    vault_name: str
    opening_balances: Dict[str, float]
    notes: str | None = None

class ShiftClose(BaseModel):
    actual_balances: Dict[str, float]
    notes: str | None = None
    denomination_breakdown: Dict[str, Dict[str, int]] = {}  # {"USD": {"100": 12, "50": 4}, ...}

# Transfer DTO
class TransferCreate(BaseModel):
    id: str
    source_type: str
    source_id: str
    source_name: str
    dest_type: str
    dest_id: str
    dest_name: str
    currency: str
    amount: float
    notes: str | None = None

# Inventory Count DTO
class InventoryCountCreate(BaseModel):
    id: str
    vault_id: str
    vault_name: str
    currency: str
    system_balance: float
    actual_balance: float
    reason: str
    notes: str | None = None
    reported_by: str

class DailyExpenseCreate(BaseModel):
    id: str
    date: str
    category: Literal["rent", "salaries", "electricity", "maintenance", "other"]
    amount: float
    currency: str
    description: str | None = None
    denomination_breakdown: Dict[str, int] = {}  # {"100": 12, "50": 4} for this currency

# Helpers for serialization
def branch_to_dict(b: Branch):
    return {
        "id": b.id,
        "name": b.name,
        "city": b.city,
        "address": b.address,
        "phone": b.phone,
        "manager": b.manager,
        "isActive": b.is_active,
        "notes": b.notes
    }

def vault_to_dict(v: Vault):
    return {
        "id": v.id,
        "name": v.name,
        "type": v.type,
        "branch": v.branch,
        "manager": v.manager,
        "balances": v.balances,
        "openingBalances": v.opening_balances,
        "isActive": v.is_active,
        "lastMovement": v.last_movement
    }

def shift_to_dict(s: Shift):
    return {
        "id": s.id,
        "cashier": s.cashier,
        "branch": s.branch,
        "vaultId": s.vault_id,
        "vaultName": s.vault_name,
        "startTime": s.start_time or None,
        "endTime": s.end_time,
        "requestedAt": s.requested_at,
        "approvedBy": s.approved_by,
        "openingBalances": s.opening_balances,
        "expectedBalances": s.expected_balances,
        "actualBalances": s.actual_balances,
        "differences": s.differences,
        "status": s.status,
        "notes": s.notes
    }

def transfer_to_dict(t: Transfer):
    return {
        "id": t.id,
        "sourceType": t.source_type,
        "sourceId": t.source_id,
        "sourceName": t.source_name,
        "destType": t.dest_type,
        "destId": t.dest_id,
        "destName": t.dest_name,
        "currency": t.currency,
        "amount": t.amount,
        "status": t.status,
        "requestedBy": t.requested_by,
        "timestamp": t.timestamp,
        "notes": t.notes
    }

def approval_to_dict(a: ApprovalRequest):
    return {
        "id": a.id,
        "type": a.type,
        "title": a.title,
        "amount": a.amount,
        "currency": a.currency,
        "requestedBy": a.requested_by,
        "timestamp": a.timestamp,
        "status": a.status,
        "referenceId": a.reference_id,
        "details": a.details
    }

def inventory_to_dict(ic: InventoryCount):
    return {
        "id": ic.id,
        "timestamp": ic.timestamp,
        "vaultId": ic.vault_id,
        "vaultName": ic.vault_name,
        "currency": ic.currency,
        "systemBalance": ic.system_balance,
        "actualBalance": ic.actual_balance,
        "difference": ic.difference,
        "reason": ic.reason,
        "status": ic.status,
        "notes": ic.notes,
        "reportedBy": ic.reported_by,
        "approvedBy": ic.approved_by
    }

def daily_expense_to_dict(e: DailyExpense):
    return {
        "id": e.id,
        "date": e.date,
        "category": e.category,
        "amount": e.amount,
        "currency": e.currency,
        "description": e.description,
        "recordedBy": e.recorded_by,
        "timestamp": e.timestamp,
    }

# ----------------- BRANCHES -----------------
@router.get("/branches")
def list_branches(db: Session = Depends(get_db)):
    res = db.scalars(select(Branch)).all()
    return success_response(data=[branch_to_dict(b) for b in res])

@router.post("/branches")
def create_branch(data: BranchCreate, db: Session = Depends(get_db)):
    existing = db.get(Branch, data.id)
    if existing:
        raise APIError(code="EXISTS", message_ar="الفرع موجود بالفعل", message_en="Branch already exists", status_code=400)
    branch = Branch(**data.model_dump())
    db.add(branch)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="Branch", entity_id=data.id, description=f"تم إنشاء فرع جديد: {data.name}")
    db.commit()
    return success_response(data=branch_to_dict(branch))

@router.put("/branches/{branch_id}")
def update_branch(branch_id: str, data: BranchCreate, db: Session = Depends(get_db)):
    branch = db.get(Branch, branch_id)
    if not branch:
        raise APIError(code="NOT_FOUND", message_ar="الفرع غير موجود", message_en="Branch not found", status_code=404)
    for k, v in data.model_dump().items():
        setattr(branch, k, v)
    db.commit()
    return success_response(data=branch_to_dict(branch))

class BranchTransferAll(BaseModel):
    to_branch_id: str

@router.post("/branches/{branch_id}/transfer_all")
def transfer_all_branch_data(branch_id: str, data: BranchTransferAll, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Re-points every vault/user/transaction/asset/vehicle record from one
    branch to another — the bulk move needed before a branch with real data
    can be deleted (delete_branch refuses otherwise)."""
    branch = db.get(Branch, branch_id)
    if not branch:
        raise APIError(code="NOT_FOUND", message_ar="الفرع غير موجود", message_en="Branch not found", status_code=404)
    if data.to_branch_id == branch_id:
        raise APIError(code="SAME_BRANCH", message_ar="لا يمكن النقل إلى نفس الفرع", message_en="Cannot transfer to the same branch", status_code=400)
    to_branch = db.get(Branch, data.to_branch_id)
    if not to_branch:
        raise APIError(code="NOT_FOUND", message_ar="الفرع الوجهة غير موجود", message_en="Target branch not found", status_code=404)

    moved = {}
    for model, label in [(Vault, "خزنة"), (User, "مستخدم"), (Transaction, "عملية"), (FixedAsset, "أصل ثابت"), (Vehicle, "مركبة")]:
        rows = db.scalars(select(model).where(model.branch == branch_id)).all()
        for row in rows:
            row.branch = data.to_branch_id
        if rows:
            moved[label] = len(rows)

    create_audit_log(
        db, action=AuditAction.UPDATE, entity_type="Branch", entity_id=branch_id,
        description=f"تم نقل كل بيانات فرع {branch.name} إلى فرع {to_branch.name}: " + (", ".join(f"{v} {k}" for k, v in moved.items()) or "لا توجد بيانات"),
        username=actor.username
    )
    db.commit()
    return success_response(data={"moved": moved}, message_ar=f"تم نقل جميع بيانات الفرع إلى {to_branch.name} بنجاح")

@router.delete("/branches/{branch_id}")
def delete_branch(branch_id: str, db: Session = Depends(get_db)):
    branch = db.get(Branch, branch_id)
    if not branch:
        raise APIError(code="NOT_FOUND", message_ar="الفرع غير موجود", message_en="Branch not found", status_code=404)

    # Refuse if anything still points at this branch — deleting it out from under
    # a vault, user, transaction, or asset record would leave those with a
    # dangling reference instead of a real branch (this is exactly what left the
    # closing page showing branches nobody could account for).
    blockers = []
    vault_count = db.scalar(select(func.count()).select_from(Vault).where(Vault.branch == branch_id))
    if vault_count:
        blockers.append(f"{vault_count} خزنة")
    user_count = db.scalar(select(func.count()).select_from(User).where(User.branch == branch_id))
    if user_count:
        blockers.append(f"{user_count} مستخدم")
    tx_count = db.scalar(select(func.count()).select_from(Transaction).where(Transaction.branch == branch_id))
    if tx_count:
        blockers.append(f"{tx_count} عملية")
    asset_count = db.scalar(select(func.count()).select_from(FixedAsset).where(FixedAsset.branch == branch_id))
    if asset_count:
        blockers.append(f"{asset_count} أصل ثابت")
    vehicle_count = db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.branch == branch_id))
    if vehicle_count:
        blockers.append(f"{vehicle_count} مركبة")

    if blockers:
        raise APIError(
            code="BRANCH_IN_USE",
            message_ar=f"لا يمكن حذف الفرع لوجود بيانات مرتبطة به: {'، '.join(blockers)}. انقل هذه البيانات إلى فرع آخر أولاً",
            message_en=f"Cannot delete branch: still referenced by {', '.join(blockers)}. Move those to another branch first",
            status_code=400
        )

    db.delete(branch)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="Branch", entity_id=branch_id, description=f"تم حذف الفرع: {branch.name}")
    db.commit()
    return success_response(data={"deleted": True})

# ----------------- VAULTS -----------------
@router.get("/vaults")
def list_vaults(db: Session = Depends(get_db)):
    res = db.scalars(select(Vault)).all()
    return success_response(data=[vault_to_dict(v) for v in res])

@router.post("/vaults")
def create_vault(data: VaultCreate, actor: User = Depends(require_permission("إدارة الخزنات")), db: Session = Depends(get_db)):
    existing = db.get(Vault, data.id)
    if existing:
        raise APIError(code="EXISTS", message_ar="الخزنة موجودة بالفعل", message_en="Vault already exists", status_code=400)
    check_branch_access(actor, db, data.branch)
    vault = Vault(**data.model_dump())
    db.add(vault)
    db.commit()
    return success_response(data=vault_to_dict(vault))

@router.put("/vaults/{vault_id}")
def update_vault(vault_id: str, data: VaultCreate, actor: User = Depends(require_permission("إدارة الخزنات")), db: Session = Depends(get_db)):
    vault = db.get(Vault, vault_id)
    if not vault:
        raise APIError(code="NOT_FOUND", message_ar="الخزنة غير موجودة", message_en="Vault not found", status_code=404)
    check_branch_access(actor, db, vault.branch)
    check_branch_access(actor, db, data.branch)
    for k, v in data.model_dump().items():
        setattr(vault, k, v)
    db.commit()
    return success_response(data=vault_to_dict(vault))

@router.patch("/vaults/{vault_id}/balances")
def update_vault_balances(vault_id: str, data: VaultBalanceUpdate, db: Session = Depends(get_db)):
    vault = db.get(Vault, vault_id)
    if not vault:
        raise APIError(code="NOT_FOUND", message_ar="الخزنة غير موجودة", message_en="Vault not found", status_code=404)
    vault.balances = data.balances
    vault.last_movement = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    db.commit()
    return success_response(data=vault_to_dict(vault))

@router.delete("/vaults/{vault_id}/currencies/{currency}")
def remove_vault_currency(vault_id: str, currency: str, actor: User = Depends(require_permission("إدارة الخزنات")), db: Session = Depends(get_db)):
    """Drops one currency line from a vault entirely — only allowed once its balance
    is exactly zero, so removing it can never make tracked money disappear."""
    vault = db.get(Vault, vault_id)
    if not vault:
        raise APIError(code="NOT_FOUND", message_ar="الخزنة غير موجودة", message_en="Vault not found", status_code=404)
    if currency not in vault.balances:
        raise APIError(code="NOT_FOUND", message_ar="هذه العملة غير موجودة في هذه الخزنة", message_en="Currency not tracked in this vault", status_code=404)
    balance = vault.balances.get(currency, 0.0)
    if balance != 0:
        raise APIError(
            code="CURRENCY_HAS_BALANCE",
            message_ar=f"لا يمكن إزالة العملة لوجود رصيد بها ({balance} {currency}) — قم بتصفيره أولاً",
            message_en="Cannot remove a currency that still holds a balance",
            status_code=400
        )
    bals = vault.balances.copy()
    del bals[currency]
    vault.balances = bals
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="Vault", entity_id=vault_id, description=f"تم إزالة عملة {currency} من الخزنة {vault.name}")
    db.commit()
    return success_response(data=vault_to_dict(vault))

@router.delete("/vaults/{vault_id}")
def delete_vault(vault_id: str, actor: User = Depends(require_permission("إدارة الخزنات")), db: Session = Depends(get_db)):
    """Refuses to delete a vault that still holds any balance or has an open shift —
    deleting it would otherwise make that tracked cash silently disappear."""
    vault = db.get(Vault, vault_id)
    if not vault:
        raise APIError(code="NOT_FOUND", message_ar="الخزنة غير موجودة", message_en="Vault not found", status_code=404)
    nonzero = {ccy: amt for ccy, amt in vault.balances.items() if amt != 0}
    if nonzero:
        details = ", ".join(f"{amt} {ccy}" for ccy, amt in nonzero.items())
        raise APIError(code="VAULT_HAS_BALANCE", message_ar=f"لا يمكن حذف الخزنة لوجود أرصدة بها: {details}", message_en="Cannot delete a vault that still holds a balance", status_code=400)
    open_shift = db.scalar(select(Shift).where(Shift.vault_id == vault_id, Shift.status.in_(["open", "pending_open"])))
    if open_shift:
        raise APIError(code="VAULT_HAS_OPEN_SHIFT", message_ar="لا يمكن حذف الخزنة لوجود وردية مفتوحة أو معلقة عليها", message_en="Cannot delete a vault with an open or pending shift", status_code=400)
    check_branch_access(actor, db, vault.branch)
    db.delete(vault)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="Vault", entity_id=vault_id, description=f"تم حذف الخزنة: {vault.name}")
    db.commit()
    return success_response(data={"deleted": True})

# ----------------- SHIFTS -----------------
@router.get("/shifts")
def list_shifts(db: Session = Depends(get_db)):
    res = db.scalars(select(Shift)).all()
    return success_response(data=[shift_to_dict(s) for s in res])

@router.post("/shifts/open")
def open_shift(data: ShiftOpen, actor: User = Depends(require_permission("فتح وردية")), db: Session = Depends(get_db)):
    """Doc requirement: a cashier can never just start transacting on their own —
    opening a shift is only a *request* until a manager accepts it (POST /approvals/{id}/action).
    The vault's balances are only touched once that approval lands, so an unapproved
    opening-balance count can't silently override what's actually in the vault."""
    existing = db.get(Shift, data.id)
    if existing:
        raise APIError(code="EXISTS", message_ar="الوردية مفتوحة بالفعل", message_en="Shift already exists", status_code=400)

    check_branch_access(actor, db, data.branch)

    # Check if there is already an open (or pending) shift for this cashier
    open_shift_exists = db.scalar(
        select(Shift).where(Shift.cashier == data.cashier, Shift.status.in_(["open", "pending_open"]))
    )
    if open_shift_exists:
        if open_shift_exists.status == "pending_open":
            raise APIError(code="SHIFT_PENDING", message_ar="لديك طلب فتح وردية بانتظار موافقة المدير بالفعل", message_en="You already have a pending shift-open request", status_code=400)
        raise APIError(code="SHIFT_ALREADY_OPEN", message_ar="لديك وردية مفتوحة بالفعل حالياً", message_en="You already have an open shift", status_code=400)

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")

    shift = Shift(
        id=data.id,
        cashier=data.cashier,
        branch=data.branch,
        vault_id=data.vault_id,
        vault_name=data.vault_name,
        opening_balances=data.opening_balances,
        expected_balances=data.opening_balances,
        actual_balances={},
        differences={},
        status="pending_open",
        start_time="",  # the "start_time NOT NULL" constraint predates this column becoming optional; "" reads as unset via shift_to_dict
        requested_at=timestamp,
        notes=data.notes
    )
    db.add(shift)

    approval = ApprovalRequest(
        id=f"apr_shiftopen_{shift.id}",
        type="shift_open",
        title=f"طلب فتح وردية جديدة — {data.cashier} ({data.vault_name})",
        amount=0.0,
        currency=None,
        requested_by=data.cashier,
        timestamp=timestamp,
        status="pending",
        reference_id=shift.id,
        details=data.notes
    )
    db.add(approval)

    notif = Notification(
        title="طلب فتح وردية",
        message=f"طلب الصراف {data.cashier} فتح وردية جديدة على خزنة {data.vault_name} وينتظر الموافقة.",
        type=NotificationType.INFO,
        status=NotificationStatus.UNREAD,
        role_name="مدير النظام",
        entity_type="Shift",
        entity_id=shift.id,
    )
    db.add(notif)

    create_audit_log(db, action=AuditAction.CREATE, entity_type="Shift", entity_id=data.id, description=f"طلب الصراف {data.cashier} فتح وردية جديدة (بانتظار الموافقة)")
    db.commit()
    return success_response(data=shift_to_dict(shift), message_ar="تم إرسال طلب فتح الوردية للموافقة")

@router.post("/shifts/{shift_id}/close")
def close_shift(shift_id: str, data: ShiftClose, actor: User = Depends(require_permission("إغلاق وردية")), db: Session = Depends(get_db)):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise APIError(code="NOT_FOUND", message_ar="الوردية غير موجودة", message_en="Shift not found", status_code=404)
    if shift.status != "open":
        raise APIError(code="SHIFT_NOT_OPEN", message_ar="لا يمكن إقفال وردية غير مفتوحة", message_en="Cannot close a shift that is not open", status_code=400)

    # If a denomination breakdown was submitted for a currency, it must actually
    # add up to the total the cashier entered for that currency — this is the
    # whole point of counting by note, not just trusting a typed total.
    for currency, breakdown in data.denomination_breakdown.items():
        counted_total = sum(float(denom) * count for denom, count in breakdown.items())
        entered_total = data.actual_balances.get(currency, 0.0)
        if abs(counted_total - entered_total) > 0.01:
            raise APIError(
                code="DENOMINATION_MISMATCH",
                message_ar=f"مجموع الفئات النقدية لعملة {currency} ({counted_total}) لا يطابق الرصيد الفعلي المدخل ({entered_total})",
                message_en=f"Denomination breakdown for {currency} ({counted_total}) doesn't match entered actual balance ({entered_total})",
                status_code=400
            )
    shift.denomination_breakdown = data.denomination_breakdown

    vault = db.get(Vault, shift.vault_id)
    expected = vault.balances if vault else shift.expected_balances

    # Calculate differences
    diffs = {}
    for curr, val in expected.items():
        actual_val = data.actual_balances.get(curr, 0.0)
        diffs[curr] = actual_val - val

    shift.actual_balances = data.actual_balances
    shift.differences = diffs
    shift.status = "closed"
    shift.end_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    shift.notes = data.notes

    has_diff = any(v != 0.0 for v in diffs.values())
    if has_diff:
        approval = ApprovalRequest(
            id=f"apr_shift_{shift.id}",
            type="shift",
            title=f"طلب اعتماد إقفال وردية الصراف {shift.cashier} (بسبب وجود فروقات)",
            amount=0.0,
            currency="LYD",
            requested_by=shift.cashier,
            timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
            status="pending",
            reference_id=shift.id,
            details=f"إقفال وردية مع فروقات جرد: {diffs}"
        )
        db.add(approval)

        alert = Notification(
            title="فروقات في إقفال الوردية",
            message=f"قام الصراف {shift.cashier} بقفل الوردية وبها فروقات: {diffs}",
            type=NotificationType.DANGER,
            status=NotificationStatus.UNREAD,
            role_name="مدير فرع",
            entity_type="Shift",
            entity_id=shift.id,
        )
        db.add(alert)

        if get_whatsapp_setting(db, "whatsappAlertShiftDiscrepancy", True):
            diffs_text = ", ".join(f"{ccy}: {val:+.2f}" for ccy, val in diffs.items() if val != 0.0)
            alert_msg = f"⚠️ فروقات في إقفال وردية\nالصراف: {shift.cashier}\nالخزنة: {shift.vault_name}\nالفروقات: {diffs_text}"
            send_manager_alert(
                db, alert_msg,
                template_name=get_whatsapp_setting(db, "whatsappTemplateName", "") or None,
                template_params=[shift.cashier, shift.vault_name, diffs_text],
            )
            send_telegram_alert(db, alert_msg)
    else:
        shift.status = "approved"

    create_audit_log(db, action=AuditAction.UPDATE, entity_type="Shift", entity_id=shift.id, description=f"قام الصراف {shift.cashier} بإقفال الوردية")
    db.commit()
    return success_response(data=shift_to_dict(shift))

@router.post("/shifts/{shift_id}/approve")
def approve_shift(shift_id: str, actor: User = Depends(require_permission("اعتماد الإقفالات")), db: Session = Depends(get_db)):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise APIError(code="NOT_FOUND", message_ar="الوردية غير موجودة", message_en="Shift not found", status_code=404)
    shift.status = "approved"
    shift.approved_by = actor.name

    approval = db.get(ApprovalRequest, f"apr_shift_{shift.id}")
    if approval:
        approval.status = "approved"

    create_audit_log(db, action=AuditAction.APPROVE, entity_type="Shift", entity_id=shift.id, description=f"تم اعتماد إقفال وردية الصراف {shift.cashier}")
    db.commit()
    return success_response(data=shift_to_dict(shift))

# ----------------- TRANSFERS & APPROVALS -----------------
@router.get("/transfers")
def list_transfers(db: Session = Depends(get_db)):
    res = db.scalars(select(Transfer)).all()
    return success_response(data=[transfer_to_dict(t) for t in res])

@router.post("/transfers")
def create_transfer(data: TransferCreate, actor: User = Depends(require_permission("تحويل بين الخزنات")), db: Session = Depends(get_db)):
    if data.amount <= 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="يجب أن يكون مبلغ التحويل أكبر من صفر", message_en="Transfer amount must be positive", status_code=400)

    transfer = Transfer(
        id=data.id,
        source_type=data.source_type,
        source_id=data.source_id,
        source_name=data.source_name,
        dest_type=data.dest_type,
        dest_id=data.dest_id,
        dest_name=data.dest_name,
        currency=data.currency,
        amount=data.amount,
        status="pending",
        requested_by=actor.name,
        timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        notes=data.notes
    )
    db.add(transfer)

    approval = ApprovalRequest(
        id=f"apr_tr_{transfer.id}",
        type="transfer",
        title=f"طلب تحويل أموال بين الخزنات ({data.source_name} ➔ {data.dest_name})",
        amount=data.amount,
        currency=data.currency,
        requested_by=actor.name,
        timestamp=transfer.timestamp,
        status="pending",
        reference_id=transfer.id,
        details=f"طلب تحويل مبلغ {data.amount} {data.currency} من {data.source_name} إلى {data.dest_name}"
    )
    db.add(approval)

    notif = Notification(
        title="طلب تحويل معلق",
        message=f"هناك طلب تحويل أموال بمبلغ {data.amount} {data.currency} ينتظر موافقة مدير النظام.",
        type=NotificationType.WARNING,
        status=NotificationStatus.UNREAD,
        role_name="مدير النظام",
        entity_type="Transfer",
        entity_id=transfer.id,
    )
    db.add(notif)

    db.commit()
    return success_response(data=transfer_to_dict(transfer))

@router.get("/approvals")
def list_approvals(db: Session = Depends(get_db)):
    res = db.scalars(select(ApprovalRequest)).all()
    return success_response(data=[approval_to_dict(a) for a in res])

APPROVAL_TYPE_PERMISSIONS = {
    "transfer": "الموافقة على التحويلات",
    "shift": "اعتماد الإقفالات",
    "shift_open": "اعتماد الإقفالات",
    "inventory": "اعتماد الإقفالات",
    "reversal": "إنشاء عملية عكسية",
}

@router.post("/approvals/{approval_id}/action")
def execute_approval_action(approval_id: str, action: Literal["approve", "reject"], actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    approval = db.get(ApprovalRequest, approval_id)
    if not approval:
        raise APIError(code="NOT_FOUND", message_ar="طلب الموافقة غير موجود", message_en="Approval request not found", status_code=404)

    required_permission = APPROVAL_TYPE_PERMISSIONS.get(approval.type)
    if required_permission:
        role = db.get(Role, actor.role)
        if not role or required_permission not in role.permissions:
            raise APIError(code="FORBIDDEN", message_ar=f"لا تملك صلاحية تنفيذ هذا الإجراء: {required_permission}", message_en=f"Missing required permission: {required_permission}", status_code=403)

    if action == "approve":
        if approval.type == "transfer":
            transfer = db.get(Transfer, approval.reference_id)
            if transfer:
                # Look up the source and verify it actually has enough before moving
                # anything — previously this executed unconditionally and could push
                # a vault, bank account, or customer balance negative.
                if transfer.source_type == "vault":
                    src = db.get(Vault, transfer.source_id)
                    src_balance = src.balances.get(transfer.currency, 0.0) if src else None
                elif transfer.source_type == "bank_account":
                    src = db.get(BankAccount, transfer.source_id)
                    src_balance = src.balance if src else None
                elif transfer.source_type == "customer":
                    src = db.get(Customer, transfer.source_id)
                    src_balance = src.balances.get(transfer.currency, 0.0) if src else None
                else:
                    src, src_balance = None, None

                if src is None:
                    raise APIError(code="NOT_FOUND", message_ar=f"مصدر التحويل ({transfer.source_name}) غير موجود", message_en="Transfer source not found", status_code=404)
                if src_balance < transfer.amount:
                    raise APIError(
                        code="INSUFFICIENT_BALANCE",
                        message_ar=f"الرصيد المتاح في {transfer.source_name} ({src_balance} {transfer.currency}) غير كافٍ لتنفيذ التحويل بقيمة ({transfer.amount} {transfer.currency})",
                        message_en=f"Insufficient balance in {transfer.source_name} for this transfer",
                        status_code=400
                    )

                approval.status = "approved"
                transfer.status = "approved"

                if transfer.source_type == "vault":
                    src_bal = src.balances.copy()
                    src_bal[transfer.currency] = src_bal.get(transfer.currency, 0.0) - transfer.amount
                    src.balances = src_bal
                elif transfer.source_type == "bank_account":
                    src.balance -= transfer.amount
                elif transfer.source_type == "customer":
                    src_bal = src.balances.copy()
                    src_bal[transfer.currency] = src_bal.get(transfer.currency, 0.0) - transfer.amount
                    src.balances = src_bal

                if transfer.dest_type == "vault":
                    dst = db.get(Vault, transfer.dest_id)
                    if dst:
                        dst_bal = dst.balances.copy()
                        dst_bal[transfer.currency] = dst_bal.get(transfer.currency, 0.0) + transfer.amount
                        dst.balances = dst_bal
                elif transfer.dest_type == "bank_account":
                    dst = db.get(BankAccount, transfer.dest_id)
                    if dst:
                        dst.balance += transfer.amount
                elif transfer.dest_type == "customer":
                    dst = db.get(Customer, transfer.dest_id)
                    if dst:
                        dst_bal = dst.balances.copy()
                        dst_bal[transfer.currency] = dst_bal.get(transfer.currency, 0.0) + transfer.amount
                        dst.balances = dst_bal
            else:
                approval.status = "approved"

                # Doc requirement: every financial transaction must produce a balanced
                # journal entry — transfers moved balances above but never recorded one.
                equivalent_lyd = transfer.amount
                if transfer.currency != "LYD":
                    rate_row = db.scalar(select(ExchangeRate).where(ExchangeRate.from_currency == transfer.currency, ExchangeRate.to_currency == "LYD"))
                    if rate_row:
                        equivalent_lyd = transfer.amount * rate_row.sell_rate
                timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
                jv_lines = [
                    {
                        "accountName": f"{transfer.dest_name} - {transfer.currency}", "currency": transfer.currency,
                        "debit": transfer.amount, "credit": 0.0,
                        "originalAmount": transfer.amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd
                    },
                    {
                        "accountName": f"{transfer.source_name} - {transfer.currency}", "currency": transfer.currency,
                        "debit": 0.0, "credit": transfer.amount,
                        "originalAmount": transfer.amount, "exchangeRate": 1.0, "equivalentLYD": equivalent_lyd
                    },
                ]
                db.add(JournalEntry(
                    id=f"JV-{datetime.utcnow().strftime('%Y%m%d')}-{transfer.id}", date=timestamp,
                    tx_type="تحويل بين الحسابات", reference=transfer.id,
                    description=f"قيد تلقائي لتحويل {transfer.amount} {transfer.currency} من {transfer.source_name} إلى {transfer.dest_name}",
                    user=actor.name, status="approved", lines=jv_lines
                ))

        elif approval.type == "reversal":
            approval.status = "approved"
            apply_transaction_reversal(db, approval.reference_id, actor.name, approval.details or "لم يُذكر سبب")

        elif approval.type == "shift_open":
            approval.status = "approved"
            shift = db.get(Shift, approval.reference_id)
            if shift and shift.status == "pending_open":
                check_branch_access(actor, db, shift.branch)
                shift.status = "open"
                shift.start_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
                shift.approved_by = actor.name
                vault = db.get(Vault, shift.vault_id)
                if vault:
                    vault.opening_balances = shift.opening_balances
                    vault.balances = shift.opening_balances
                create_audit_log(db, action=AuditAction.APPROVE, entity_type="Shift", entity_id=shift.id, description=f"تم قبول طلب فتح وردية الصراف {shift.cashier} بواسطة {actor.name}", username=actor.username)

        elif approval.type == "shift":
            # A shift closed with a count discrepancy — this is the same action
            # POST /shifts/{id}/approve performs; routed through here too because
            # the generic Approvals queue lists every pending request (including
            # this type) and must actually resolve what it shows, not just flip
            # the ApprovalRequest's own status while leaving the Shift stuck on "closed".
            approval.status = "approved"
            shift = db.get(Shift, approval.reference_id)
            if shift and shift.status == "closed":
                shift.status = "approved"
                shift.approved_by = actor.name
                create_audit_log(db, action=AuditAction.APPROVE, entity_type="Shift", entity_id=shift.id, description=f"تم اعتماد إقفال وردية الصراف {shift.cashier}", username=actor.username)

        else:
            approval.status = "approved"

    elif action == "reject":
        approval.status = "rejected"
        if approval.type == "transfer":
            transfer = db.get(Transfer, approval.reference_id)
            if transfer:
                transfer.status = "rejected"
        elif approval.type == "shift_open":
            shift = db.get(Shift, approval.reference_id)
            if shift and shift.status == "pending_open":
                shift.status = "rejected"
                shift.approved_by = actor.name
                create_audit_log(db, action=AuditAction.REJECT, entity_type="Shift", entity_id=shift.id, description=f"تم رفض طلب فتح وردية الصراف {shift.cashier} بواسطة {actor.name}", username=actor.username)

    db.commit()
    return success_response(data=approval_to_dict(approval))

# ----------------- INVENTORY COUNTS -----------------
@router.get("/inventory_counts")
def list_inventory_counts(db: Session = Depends(get_db)):
    res = db.scalars(select(InventoryCount)).all()
    return success_response(data=[inventory_to_dict(ic) for ic in res])

@router.post("/inventory_counts")
def submit_inventory_count(data: InventoryCountCreate, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.system_balance < 0 or data.actual_balance < 0:
        raise APIError(code="INVALID_AMOUNT", message_ar="لا يمكن أن يكون الرصيد بقيمة سالبة", message_en="Balances cannot be negative", status_code=400)

    if data.denomination_breakdown:
        counted_total = sum(float(denom) * count for denom, count in data.denomination_breakdown.items())
        if abs(counted_total - data.actual_balance) > 0.01:
            raise APIError(
                code="DENOMINATION_MISMATCH",
                message_ar=f"مجموع الفئات النقدية ({counted_total}) لا يطابق الرصيد الفعلي المدخل ({data.actual_balance})",
                message_en=f"Denomination breakdown ({counted_total}) doesn't match entered actual balance ({data.actual_balance})",
                status_code=400
            )

    ic = InventoryCount(
        id=data.id,
        timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        vault_id=data.vault_id,
        vault_name=data.vault_name,
        currency=data.currency,
        system_balance=data.system_balance,
        actual_balance=data.actual_balance,
        difference=data.actual_balance - data.system_balance,
        reason=data.reason,
        status="pending",
        notes=data.notes,
        reported_by=data.reported_by,
        denomination_breakdown=data.denomination_breakdown
    )
    db.add(ic)

    approval = ApprovalRequest(
        id=f"apr_ic_{ic.id}",
        type="inventory",
        title=f"طلب تسوية فروقات جرد ({data.vault_name} - {data.currency})",
        amount=abs(ic.difference),
        currency=data.currency,
        requested_by=data.reported_by,
        timestamp=ic.timestamp,
        status="pending",
        reference_id=ic.id,
        details=f"طلب تسوية فروقات جرد بقيمة {ic.difference} في الخزنة {data.vault_name}"
    )
    db.add(approval)

    db.commit()
    return success_response(data=inventory_to_dict(ic))

@router.post("/inventory_counts/{ic_id}/approve")
def approve_inventory_count(ic_id: str, db: Session = Depends(get_db)):
    ic = db.get(InventoryCount, ic_id)
    if not ic:
         raise APIError(code="NOT_FOUND", message_ar="الجرد غير موجود", message_en="Count not found", status_code=404)
    ic.status = "approved"
    
    vault = db.get(Vault, ic.vault_id)
    if vault:
        bals = vault.balances.copy()
        bals[ic.currency] = ic.actual_balance
        vault.balances = bals

    appr = db.get(ApprovalRequest, f"apr_ic_{ic.id}")
    if appr:
        appr.status = "approved"

    db.commit()
    return success_response(data=inventory_to_dict(ic))

# ----------------- DAILY EXPENSES -----------------
@router.get("/daily-expenses")
def list_daily_expenses(db: Session = Depends(get_db)):
    res = db.scalars(select(DailyExpense).order_by(DailyExpense.timestamp.desc())).all()
    return success_response(data=[daily_expense_to_dict(e) for e in res])

@router.post("/daily-expenses")
def create_daily_expense(data: DailyExpenseCreate, actor: User = Depends(require_permission("إدارة الخزنات")), db: Session = Depends(get_db)):
    expense = DailyExpense(
        id=data.id,
        date=data.date,
        category=data.category,
        amount=data.amount,
        currency=data.currency,
        description=data.description,
        recorded_by=actor.name,
        timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
    )
    db.add(expense)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="DailyExpense", entity_id=expense.id, description=f"تسجيل مصروف يومي: {data.category} بقيمة {data.amount} {data.currency}")
    db.commit()
    return success_response(data=daily_expense_to_dict(expense))

@router.delete("/daily-expenses/{expense_id}")
def delete_daily_expense(expense_id: str, actor: User = Depends(require_permission("إدارة الخزنات")), db: Session = Depends(get_db)):
    expense = db.get(DailyExpense, expense_id)
    if not expense:
        raise APIError(code="NOT_FOUND", message_ar="المصروف غير موجود", message_en="Expense not found", status_code=404)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="DailyExpense", entity_id=expense.id, description=f"حذف مصروف يومي: {expense.category} بقيمة {expense.amount} {expense.currency}")
    db.delete(expense)
    db.commit()
    return success_response(message_ar="تم حذف المصروف بنجاح")

# ----------------- DAILY CLOSINGS (branch-day / company-day) -----------------
# Doc requirement: closing must exist at the branch and main-treasury level too,
# not only per cashier drawer (Shift already covers the cashier level).
class DailyCloseRequest(BaseModel):
    notes: str | None = None

def daily_closing_to_dict(d: DailyClosing):
    return {
        "id": d.id,
        "level": d.level,
        "targetId": d.target_id,
        "targetName": d.target_name,
        "date": d.date,
        "status": d.status,
        "balancesSnapshot": d.balances_snapshot,
        "totals": d.totals,
        "closedBy": d.closed_by,
        "closedAt": d.closed_at,
        "approvedBy": d.approved_by,
        "approvedAt": d.approved_at,
        "notes": d.notes,
    }

@router.get("/daily_closings")
def list_daily_closings(db: Session = Depends(get_db)):
    res = db.scalars(select(DailyClosing).order_by(DailyClosing.closed_at.desc())).all()
    return success_response(data=[daily_closing_to_dict(d) for d in res])

@router.post("/daily_closings/branch/{branch_id}/close")
def close_branch_day(branch_id: str, data: DailyCloseRequest, actor: User = Depends(require_permission("اعتماد الإقفالات")), db: Session = Depends(get_db)):
    all_branch_ids = [b.id for b in db.scalars(select(Branch)).all()]
    print(f"[close_branch_day] received branch_id={branch_id!r} ({[hex(ord(c)) for c in branch_id]}) — known branch ids: {[(bid, [hex(ord(c)) for c in bid]) for bid in all_branch_ids]}")
    branch = db.get(Branch, branch_id)
    if not branch:
        raise APIError(code="NOT_FOUND", message_ar="الفرع غير موجود", message_en="Branch not found", status_code=404)
    check_branch_access(actor, db, branch_id)

    today = datetime.utcnow().strftime("%Y-%m-%d")
    existing = db.scalar(select(DailyClosing).where(DailyClosing.level == "branch", DailyClosing.target_id == branch_id, DailyClosing.date == today))
    if existing:
        raise APIError(code="ALREADY_CLOSED", message_ar="تم إقفال يومية هذا الفرع بالفعل اليوم", message_en="This branch's day is already closed", status_code=400)

    vaults = db.scalars(select(Vault).where(Vault.branch == branch_id)).all()
    vault_ids = [v.id for v in vaults]
    unsettled = db.scalars(select(Shift).where(Shift.vault_id.in_(vault_ids), Shift.status.in_(["open", "pending_open", "closed"]))).all() if vault_ids else []
    if unsettled:
        raise APIError(
            code="OPEN_SHIFTS_EXIST",
            message_ar=f"لا يمكن إقفال يومية الفرع، توجد {len(unsettled)} وردية غير مكتملة (مفتوحة أو بانتظار موافقة)",
            message_en=f"Cannot close the branch day: {len(unsettled)} shift(s) are still open or pending approval",
            status_code=400
        )

    snapshot: dict = {}
    totals: dict = {}
    for v in vaults:
        snapshot[v.id] = {"name": v.name, "type": v.type, "balances": v.balances}
        for ccy, amt in v.balances.items():
            totals[ccy] = totals.get(ccy, 0.0) + amt

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    dc = DailyClosing(
        id=new_id(f"dc_branch_{branch_id}"), level="branch", target_id=branch_id, target_name=branch.name,
        date=today, status="closed", balances_snapshot=snapshot, totals=totals,
        closed_by=actor.name, closed_at=timestamp, notes=data.notes
    )
    db.add(dc)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="DailyClosing", entity_id=dc.id, description=f"تم إقفال يومية فرع {branch.name}", username=actor.username)
    db.commit()
    return success_response(data=daily_closing_to_dict(dc), message_ar="تم إقفال يومية الفرع بنجاح")

@router.post("/daily_closings/company/close")
def close_company_day(data: DailyCloseRequest, actor: User = Depends(require_permission("اعتماد الإقفالات")), db: Session = Depends(get_db)):
    today = datetime.utcnow().strftime("%Y-%m-%d")
    existing = db.scalar(select(DailyClosing).where(DailyClosing.level == "company", DailyClosing.target_id == "COMPANY", DailyClosing.date == today))
    if existing:
        raise APIError(code="ALREADY_CLOSED", message_ar="تم إقفال يومية الشركة بالفعل اليوم", message_en="The company day is already closed", status_code=400)

    branches = db.scalars(select(Branch)).all()
    closed_branch_ids = set(db.scalars(select(DailyClosing.target_id).where(DailyClosing.level == "branch", DailyClosing.date == today)).all())
    missing = [b.name for b in branches if b.id not in closed_branch_ids]
    if missing:
        raise APIError(
            code="BRANCHES_NOT_CLOSED",
            message_ar=f"يجب إقفال يومية جميع الفروع أولاً. الفروع المتبقية: {', '.join(missing)}",
            message_en=f"All branches must close their day first. Remaining: {', '.join(missing)}",
            status_code=400
        )

    vaults = db.scalars(select(Vault)).all()
    snapshot: dict = {}
    totals: dict = {}
    for v in vaults:
        snapshot[v.id] = {"name": v.name, "branch": v.branch, "balances": v.balances}
        for ccy, amt in v.balances.items():
            totals[ccy] = totals.get(ccy, 0.0) + amt

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    dc = DailyClosing(
        id=new_id("dc_company"), level="company", target_id="COMPANY", target_name="الشركة (جميع الفروع)",
        date=today, status="closed", balances_snapshot=snapshot, totals=totals,
        closed_by=actor.name, closed_at=timestamp, notes=data.notes
    )
    db.add(dc)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="DailyClosing", entity_id=dc.id, description="تم إقفال يومية الشركة بالكامل", username=actor.username)
    db.commit()
    return success_response(data=daily_closing_to_dict(dc), message_ar="تم إقفال يومية الشركة بنجاح")
