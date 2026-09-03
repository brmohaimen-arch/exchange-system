from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..database import get_db
from ..models import (
    Branch, Vault, BankAccount, Shift, Transfer, ApprovalRequest, InventoryCount, Reconciliation,
    AuditAction, Notification, NotificationType, NotificationStatus, User, Role
)
from ..tracking import create_audit_log
from ..core.responses import success_response, error_response
from ..core.errors import APIError
from ..auth_deps import get_current_user, require_permission
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
        "startTime": s.start_time,
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

def reconciliation_to_dict(r: Reconciliation):
    return {
        "id": r.id,
        "type": r.type,
        "targetId": r.target_id,
        "currency": r.currency,
        "amount": r.amount,
        "reason": r.reason,
        "status": r.status,
        "notes": r.notes
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

@router.delete("/branches/{branch_id}")
def delete_branch(branch_id: str, db: Session = Depends(get_db)):
    branch = db.get(Branch, branch_id)
    if not branch:
        raise APIError(code="NOT_FOUND", message_ar="الفرع غير موجود", message_en="Branch not found", status_code=404)
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
def create_vault(data: VaultCreate, db: Session = Depends(get_db)):
    existing = db.get(Vault, data.id)
    if existing:
        raise APIError(code="EXISTS", message_ar="الخزنة موجودة بالفعل", message_en="Vault already exists", status_code=400)
    vault = Vault(**data.model_dump())
    db.add(vault)
    db.commit()
    return success_response(data=vault_to_dict(vault))

@router.put("/vaults/{vault_id}")
def update_vault(vault_id: str, data: VaultCreate, db: Session = Depends(get_db)):
    vault = db.get(Vault, vault_id)
    if not vault:
        raise APIError(code="NOT_FOUND", message_ar="الخزنة غير موجودة", message_en="Vault not found", status_code=404)
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

# ----------------- SHIFTS -----------------
@router.get("/shifts")
def list_shifts(db: Session = Depends(get_db)):
    res = db.scalars(select(Shift)).all()
    return success_response(data=[shift_to_dict(s) for s in res])

@router.post("/shifts/open")
def open_shift(data: ShiftOpen, actor: User = Depends(require_permission("فتح وردية")), db: Session = Depends(get_db)):
    existing = db.get(Shift, data.id)
    if existing:
        raise APIError(code="EXISTS", message_ar="الوردية مفتوحة بالفعل", message_en="Shift already exists", status_code=400)
    
    # Check if there is already an open shift for cashier
    open_shift_exists = db.scalar(
        select(Shift).where(Shift.cashier == data.cashier, Shift.status == "open")
    )
    if open_shift_exists:
        raise APIError(code="SHIFT_ALREADY_OPEN", message_ar="لديك وردية مفتوحة بالفعل حالياً", message_en="You already have an open shift", status_code=400)

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
        status="open",
        start_time=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        notes=data.notes
    )
    db.add(shift)

    vault = db.get(Vault, data.vault_id)
    if vault:
        vault.opening_balances = data.opening_balances
        vault.balances = data.opening_balances

    create_audit_log(db, action=AuditAction.CREATE, entity_type="Shift", entity_id=data.id, description=f"قام الصراف {data.cashier} بفتح وردية جديدة")
    db.commit()
    return success_response(data=shift_to_dict(shift))

@router.post("/shifts/{shift_id}/close")
def close_shift(shift_id: str, data: ShiftClose, actor: User = Depends(require_permission("إغلاق وردية")), db: Session = Depends(get_db)):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise APIError(code="NOT_FOUND", message_ar="الوردية غير موجودة", message_en="Shift not found", status_code=404)

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
            role_name="مدير فرع"
        )
        db.add(alert)
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
        role_name="مدير النظام"
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
        approval.status = "approved"
        if approval.type == "transfer":
            transfer = db.get(Transfer, approval.reference_id)
            if transfer:
                transfer.status = "approved"
                
                if transfer.source_type == "vault":
                    src = db.get(Vault, transfer.source_id)
                    if src:
                        src_bal = src.balances.copy()
                        src_bal[transfer.currency] = src_bal.get(transfer.currency, 0.0) - transfer.amount
                        src.balances = src_bal
                elif transfer.source_type == "bank_account":
                    src = db.get(BankAccount, transfer.source_id)
                    if src:
                        src.balance -= transfer.amount
                
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

        elif approval.type == "reversal":
            apply_transaction_reversal(db, approval.reference_id, actor.name, approval.details or "لم يُذكر سبب")

    elif action == "reject":
        approval.status = "rejected"
        if approval.type == "transfer":
            transfer = db.get(Transfer, approval.reference_id)
            if transfer:
                transfer.status = "rejected"
                
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

# ----------------- RECONCILIATIONS -----------------
@router.get("/reconciliations")
def list_reconciliations(db: Session = Depends(get_db)):
    res = db.scalars(select(Reconciliation)).all()
    return success_response(data=[reconciliation_to_dict(r) for r in res])
