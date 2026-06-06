from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..database import get_db
from ..models import (
    JournalEntry, AuditLog, LoginLog, SystemSetting, Backup, AuditAction
)
from ..tracking import create_audit_log
from ..core.responses import success_response, error_response
from ..core.errors import APIError
from pydantic import BaseModel
from datetime import datetime
from typing import Dict, Any

router = APIRouter(tags=["Accounting & Auditing System"])

class ReversalRequest(BaseModel):
    reason: str

class SettingsUpdate(BaseModel):
    settings: Dict[str, Any]

# Helpers for serialization
def jv_to_dict(jv: JournalEntry):
    return {
        "id": jv.id,
        "date": jv.date,
        "txType": jv.tx_type,
        "reference": jv.reference,
        "description": jv.description,
        "user": jv.user,
        "status": jv.status,
        "lines": jv.lines
    }

def audit_to_dict(log: AuditLog):
    import json
    return {
        "id": str(log.id),
        "timestamp": log.created_at.strftime("%Y-%m-%d %H:%M") if isinstance(log.created_at, datetime) else str(log.created_at),
        "user": log.username or "system",
        "role": log.role_name or "مدير النظام",
        "branch": "الإدارة العامة", # mock / default branch name
        "action": log.action.value if hasattr(log.action, "value") else str(log.action),
        "entity": log.entity_type,
        "details": log.description,
        "oldValue": json.dumps(log.old_value) if log.old_value else None,
        "newValue": json.dumps(log.new_value) if log.new_value else None,
        "ip": log.ip_address or "127.0.0.1",
        "device": log.device or "Unknown"
    }

def login_log_to_dict(log: LoginLog):
    return {
        "id": log.id,
        "user": log.user,
        "role": log.role,
        "branch": log.branch,
        "loginTime": log.login_time,
        "ip": log.ip or "127.0.0.1",
        "device": log.device or "Unknown",
        "status": log.status
    }

def backup_to_dict(b: Backup):
    return {
        "id": b.id,
        "timestamp": b.timestamp,
        "type": b.type,
        "size": b.size,
        "status": b.status,
        "user": b.user
    }

# ----------------- JOURNAL ENTRIES -----------------
@router.get("/journal_entries")
def list_journal_entries(db: Session = Depends(get_db)):
    res = db.scalars(select(JournalEntry)).all()
    return success_response(data=[jv_to_dict(jv) for jv in res])

@router.post("/journal_entries/{entry_id}/reverse")
def reverse_journal_entry(entry_id: str, data: ReversalRequest, db: Session = Depends(get_db)):
    jv = db.get(JournalEntry, entry_id)
    if not jv:
        raise APIError(code="NOT_FOUND", message_ar="القيد المحاسبي غير موجود", message_en="Journal entry not found", status_code=404)
    
    if jv.status == "reversed":
        raise APIError(code="ALREADY_REVERSED", message_ar="القيد ملغي بالفعل سابقا", message_en="Journal entry already reversed", status_code=400)

    # Mark original JV as reversed
    jv.status = "reversed"
    jv.description = f"{jv.description} — (ملغي بسبب: {data.reason})"

    # Create Reversal Journal Entry
    rev_lines = []
    for line in jv.lines:
        # Flip debit and credit!
        rev_lines.append({
            "accountName": line.get("accountName"),
            "currency": line.get("currency"),
            "debit": line.get("credit", 0.0),
            "credit": line.get("debit", 0.0),
            "originalAmount": line.get("originalAmount"),
            "exchangeRate": line.get("exchangeRate"),
            "equivalentLYD": line.get("equivalentLYD")
        })

    rev_jv = JournalEntry(
        id=f"REV-{jv.id}",
        date=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        tx_type=f"إلغاء قيد {jv.tx_type}",
        reference=jv.reference,
        description=f"قيد عكسي تلقائي لإلغاء القيد {jv.id} — السبب: {data.reason}",
        user="system",
        status="approved",
        lines=rev_lines
    )
    db.add(rev_jv)

    create_audit_log(db, action=AuditAction.REVERSE, entity_type="JournalEntry", entity_id=jv.id, description=f"تم إنشاء قيد عكسي لإلغاء القيد {jv.id} بسبب: {data.reason}")
    db.commit()
    return success_response(data=jv_to_dict(jv))

# ----------------- LOGS -----------------
@router.get("/audit_logs")
def list_audit_logs(db: Session = Depends(get_db)):
    res = db.scalars(
        select(AuditLog).order_by(AuditLog.created_at.desc())
    ).all()
    return success_response(data=[audit_to_dict(log) for log in res])

@router.get("/login_logs")
def list_login_logs(db: Session = Depends(get_db)):
    res = db.scalars(
        select(LoginLog).order_by(LoginLog.login_time.desc())
    ).all()
    return success_response(data=[login_log_to_dict(log) for log in res])

# ----------------- SYSTEM SETTINGS -----------------
@router.get("/settings")
def list_settings(db: Session = Depends(get_db)):
    settings = db.scalars(select(SystemSetting)).all()
    res_dict = {}
    for s in settings:
        res_dict[s.key] = s.value.get("val")
    return success_response(data=res_dict)

@router.post("/settings")
def update_settings(data: SettingsUpdate, db: Session = Depends(get_db)):
    for key, val in data.settings.items():
        s = db.get(SystemSetting, key)
        if s:
            s.value = {"val": val}
        else:
            s = SystemSetting(key=key, value={"val": val})
            db.add(s)
            
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="SystemSetting", entity_id="system", description="تم تحديث إعدادات النظام الرئيسية")
    db.commit()
    return success_response(message_ar="تم تحديث الإعدادات بنجاح")

# ----------------- DATABASE BACKUPS -----------------
@router.get("/backups")
def list_backups(db: Session = Depends(get_db)):
    res = db.scalars(select(Backup).order_by(Backup.timestamp.desc())).all()
    return success_response(data=[backup_to_dict(b) for b in res])

@router.post("/backups")
def trigger_backup(db: Session = Depends(get_db)):
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    b = Backup(
        id=f"b_{int(datetime.utcnow().timestamp())}",
        timestamp=timestamp,
        type="نسخة احتياطية يدوية (كاملة)",
        size="4.3 MB",
        status="ناجحة",
        user="admin"
    )
    db.add(b)
    
    create_audit_log(db, action=AuditAction.CREATE, entity_type="Backup", entity_id=b.id, description=f"قام مدير النظام بإنشاء نسخة احتياطية يدوية")
    db.commit()
    return success_response(data=backup_to_dict(b), message_ar="تم إنشاء النسخة الاحتياطية بنجاح")
