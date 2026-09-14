from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..database import get_db
from ..models import (
    JournalEntry, AuditLog, LoginLog, SystemSetting, Backup, AuditAction, User, Movement, Vault, BankAccount, Customer
)
from ..tracking import create_audit_log, verify_audit_chain
from ..core.responses import success_response, error_response
from ..core.errors import APIError
from ..core.export_labels import JOURNAL_STATUS_LABELS_AR
from ..auth_deps import require_permission
from ..id_gen import new_id
from ..export_utils import build_excel, build_pdf, ArabicFontUnavailable
from ..whatsapp_gateway import send_whatsapp_document, get_setting as get_whatsapp_setting
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime
import os
import shutil
from typing import Dict, Any

BACKUPS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "backups")
DB_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "sql_app.db")

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

def _journal_entries_export_rows(db: Session):
    res = db.scalars(select(JournalEntry).order_by(JournalEntry.date.desc())).all()
    headers = ["رقم القيد", "التاريخ", "نوع العملية", "المرجع", "الوصف", "المستخدم", "الحالة"]
    rows = [[jv.id, jv.date, jv.tx_type, jv.reference, jv.description, jv.user, JOURNAL_STATUS_LABELS_AR.get(jv.status, jv.status)] for jv in res]
    return "القيود المحاسبية", headers, rows

@router.get("/journal_entries/export")
def export_journal_entries(format: str = "xlsx", actor: User = Depends(require_permission("رؤية سجل العمليات")), db: Session = Depends(get_db)):
    title, headers, rows = _journal_entries_export_rows(db)
    if format == "xlsx":
        buf = build_excel(title, headers, rows)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": 'attachment; filename="journal_entries.xlsx"'})
    try:
        buf = build_pdf(title, headers, rows)
    except ArabicFontUnavailable as e:
        raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء ملف PDF: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="journal_entries.pdf"'})

@router.post("/journal_entries/send_whatsapp")
def send_journal_entries_export_whatsapp(format: str = "pdf", actor: User = Depends(require_permission("رؤية سجل العمليات")), db: Session = Depends(get_db)):
    manager_phone = get_whatsapp_setting(db, "whatsappManagerPhone", "")
    if not manager_phone:
        raise APIError(code="NO_PHONE", message_ar="لم يتم تحديد رقم هاتف المدير في الإعدادات لاستقبال التقارير", message_en="No manager phone configured in settings to receive reports", status_code=400)
    title, headers, rows = _journal_entries_export_rows(db)
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
    create_audit_log(db, action=AuditAction.SYSTEM_ALERT, entity_type="Report", entity_id="journal_entries", description=f"تم إرسال تقرير {title} عبر واتساب إلى {manager_phone}", username=actor.username)
    db.commit()
    return success_response(data={"sent": True}, message_ar="تم إرسال التقرير عبر واتساب بنجاح")

# Operation types that must NOT go through this generic reversal — each needs
# extra state fixed up beyond a plain vault/bank/customer balance (a linked
# Debt/Advance record, an approval workflow, a partially-paid installment,
# etc.) that a blind Movement-based undo can't safely reconstruct. They have
# their own dedicated, purpose-built reversal/delete flows instead.
_SPECIALIZED_REVERSAL_TX_TYPES = {
    "شراء عملة": 'استخدم زر "طلب عكس العملية" في صفحة العمليات بدلاً من هذا — تلك العملية تحتاج موافقة المدير وتتعامل مع الديون المرتبطة بها.',
    "بيع عملة": 'استخدم زر "طلب عكس العملية" في صفحة العمليات بدلاً من هذا — تلك العملية تحتاج موافقة المدير وتتعامل مع الديون المرتبطة بها.',
    "تبديل عملة": 'استخدم زر "طلب عكس العملية" في صفحة العمليات بدلاً من هذا — تلك العملية تحتاج موافقة المدير وتتعامل مع الديون المرتبطة بها.',
    "صرف سلفة": 'استخدم زر "حذف" على هذه السلفة في تبويب "السلف" بصفحة العملاء بدلاً من هذا — يعيد المبلغ المتبقي تلقائياً لمصدره.',
    "تسديد سلفة": 'لا يمكن عكس دفعة سداد سلفة من هنا — استخدم "حذف" على السلفة نفسها في تبويب "السلف" إذا لزم الأمر.',
    "إلغاء سلفة": "لا يمكن عكس إلغاء سلفة.",
}

@router.post("/journal_entries/{entry_id}/reverse")
def reverse_journal_entry(entry_id: str, data: ReversalRequest, actor: User = Depends(require_permission("إنشاء عملية عكسية")), db: Session = Depends(get_db)):
    """Reverses both the accounting record AND the real money it moved.
    Previously this only flipped the JournalEntry's debit/credit lines and
    left every vault/bank/customer balance untouched — a purely cosmetic
    reversal that made the ledger look corrected while the actual cash never
    moved back. It now walks every Movement row recorded under the same
    reference (exactly how the money-moving operation logged its own
    effects) and undoes each one on the real entity, mirroring the proven
    pattern already used for transaction reversals."""
    jv = db.get(JournalEntry, entry_id)
    if not jv:
        raise APIError(code="NOT_FOUND", message_ar="القيد المحاسبي غير موجود", message_en="Journal entry not found", status_code=404)

    if jv.status == "reversed":
        raise APIError(code="ALREADY_REVERSED", message_ar="القيد ملغي بالفعل سابقا", message_en="Journal entry already reversed", status_code=400)

    specialized_message = _SPECIALIZED_REVERSAL_TX_TYPES.get(jv.tx_type)
    if specialized_message:
        raise APIError(code="USE_DEDICATED_REVERSAL", message_ar=specialized_message, message_en="This operation type has its own dedicated reversal flow", status_code=400)

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")

    # Undo every real balance this operation touched, using the exact Movement
    # rows recorded when it happened (entity_type/entity_id/currency/amount_in/
    # amount_out) — not re-derived, so this is exact regardless of what else
    # has happened to that vault/bank/customer since.
    movements = db.scalars(select(Movement).where(Movement.reference_id == jv.reference)).all()
    for m in movements:
        if m.entity_type == "vault":
            entity = db.get(Vault, m.entity_id)
            if not entity:
                continue
            balance_before = entity.balances.get(m.currency, 0.0)
            bals = entity.balances.copy()
            bals[m.currency] = balance_before - m.amount_in + m.amount_out
            entity.balances = bals
            balance_after = bals[m.currency]
            entity.last_movement = timestamp
        elif m.entity_type == "bank_account":
            entity = db.get(BankAccount, m.entity_id)
            if not entity:
                continue
            balance_before = entity.balance
            entity.balance = balance_before - m.amount_in + m.amount_out
            balance_after = entity.balance
            entity.last_movement = timestamp
        elif m.entity_type == "customer":
            entity = db.get(Customer, m.entity_id)
            if not entity:
                continue
            balance_before = entity.balances.get(m.currency, 0.0)
            bals = entity.balances.copy()
            bals[m.currency] = balance_before - m.amount_in + m.amount_out
            entity.balances = bals
            balance_after = bals[m.currency]
        else:
            continue

        db.add(Movement(
            id=new_id(f"m_rev_{m.id}"), timestamp=timestamp, entity_type=m.entity_type, entity_id=m.entity_id,
            entity_name=m.entity_name, currency=m.currency, type=f"عكس قيد — {m.type}",
            amount_in=m.amount_out, amount_out=m.amount_in,
            balance_before=balance_before, balance_after=balance_after, reference_id=jv.reference, user=actor.name
        ))

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
        date=timestamp,
        tx_type=f"إلغاء قيد {jv.tx_type}",
        reference=jv.reference,
        description=f"قيد عكسي تلقائي لإلغاء القيد {jv.id} — السبب: {data.reason}",
        user=actor.name,
        status="approved",
        lines=rev_lines
    )
    db.add(rev_jv)

    create_audit_log(db, action=AuditAction.REVERSE, entity_type="JournalEntry", entity_id=jv.id, description=f"تم إنشاء قيد عكسي لإلغاء القيد {jv.id} بسبب: {data.reason} (وتمت إعادة الأرصدة الفعلية)", username=actor.username)
    db.commit()
    return success_response(data=jv_to_dict(jv))

# ----------------- LOGS -----------------
@router.get("/audit_logs/verify")
def verify_audit_logs(actor: User = Depends(require_permission("رؤية سجل العمليات")), db: Session = Depends(get_db)):
    result = verify_audit_chain(db)
    return success_response(data=result, message_ar="السجل سليم ولم يتم التلاعب به" if result["valid"] else "تنبيه: تم اكتشاف كسر في سلسلة سجل التدقيق")

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
def update_settings(data: SettingsUpdate, actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
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

def _format_size(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"

def perform_backup(db: Session, *, actor_name: str, backup_type: str, retention_count: int | None = None) -> Backup:
    """Copies the live DB file and records a Backup row. Shared by the manual
    'إنشاء نسخة احتياطية الآن' button and the scheduled automatic backup job so
    both go through the exact same, tested code path."""
    if not os.path.exists(DB_FILE_PATH):
        raise APIError(code="DB_FILE_NOT_FOUND", message_ar="تعذر العثور على ملف قاعدة البيانات لعمل نسخة احتياطية", message_en="Database file not found for backup", status_code=500)

    os.makedirs(BACKUPS_DIR, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    file_stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_id = new_id("b")
    backup_file_path = os.path.join(BACKUPS_DIR, f"sql_app_{file_stamp}.db")

    shutil.copy2(DB_FILE_PATH, backup_file_path)
    real_size = os.path.getsize(backup_file_path)

    b = Backup(
        id=backup_id,
        timestamp=timestamp,
        type=backup_type,
        size=_format_size(real_size),
        status="ناجحة",
        user=actor_name,
        file_path=backup_file_path,
    )
    db.add(b)

    create_audit_log(db, action=AuditAction.CREATE, entity_type="Backup", entity_id=b.id, description=f"قام {actor_name} بإنشاء نسخة احتياطية: {backup_file_path}", username=actor_name)

    db.flush()  # session has autoflush disabled — without this, the retention query below won't see the row just added

    if retention_count and retention_count > 0:
        _enforce_backup_retention(db, retention_count)

    return b


def _enforce_backup_retention(db: Session, keep: int) -> None:
    """Deletes the oldest backups (file + row) beyond the configured retention count."""
    all_backups = db.scalars(select(Backup).order_by(Backup.timestamp.desc())).all()
    for old in all_backups[keep:]:
        if old.file_path and os.path.exists(old.file_path):
            try:
                os.remove(old.file_path)
            except OSError:
                pass
        db.delete(old)


@router.post("/backups")
def trigger_backup(actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    b = perform_backup(db, actor_name=actor.name, backup_type="نسخة احتياطية يدوية (كاملة)")
    db.commit()
    return success_response(data=backup_to_dict(b), message_ar="تم إنشاء النسخة الاحتياطية بنجاح")
