import os
from datetime import datetime

from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import select
from pydantic import BaseModel

from ..database import get_db
from ..models import DollarCardRecipient, DollarCardDocument, AuditAction, User
from ..tracking import create_audit_log
from ..core.responses import success_response
from ..core.errors import APIError
from ..auth_deps import require_permission, get_current_user
from ..id_gen import new_id
from ..file_storage import save_upload, resolve_path

router = APIRouter(tags=["Dollar Cards ($2000 disbursement registry)"])

VALID_STATUSES = {"waiting", "in_progress", "handed", "not_handed"}


class DollarCardCreate(BaseModel):
    full_name: str
    national_id: str
    phone: str
    account_number: str | None = None
    account_bank: str | None = None
    passport_number: str | None = None
    status: str = "waiting"
    notes: str | None = None


def _validate_status(status: str):
    if status not in VALID_STATUSES:
        raise APIError(
            code="INVALID_STATUS",
            message_ar="حالة غير صالحة. القيم المسموحة: قيد الانتظار، قيد التنفيذ، تم التسليم، لم يتم التسليم",
            message_en=f"Invalid status. Allowed: {', '.join(VALID_STATUSES)}",
            status_code=400,
        )


def recipient_to_dict(r: DollarCardRecipient, doc_count: int = 0):
    return {
        "id": r.id,
        "fullName": r.full_name,
        "nationalId": r.national_id,
        "phone": r.phone,
        "accountNumber": r.account_number,
        "accountBank": r.account_bank,
        "passportNumber": r.passport_number,
        "status": r.status,
        "notes": r.notes,
        "createdBy": r.created_by,
        "timestamp": r.timestamp,
        "updatedAt": r.updated_at,
        "documentCount": doc_count,
    }


def document_to_dict(d: DollarCardDocument):
    return {
        "id": d.id,
        "recipientId": d.recipient_id,
        "fileName": d.file_name,
        "hasFile": bool(d.stored_path),
        "uploadedBy": d.uploaded_by,
        "timestamp": d.timestamp,
    }


@router.get("/dollar_cards")
def list_dollar_cards(db: Session = Depends(get_db)):
    recipients = db.scalars(select(DollarCardRecipient)).all()
    doc_counts: dict[str, int] = {}
    for doc in db.scalars(select(DollarCardDocument)).all():
        doc_counts[doc.recipient_id] = doc_counts.get(doc.recipient_id, 0) + 1
    return success_response(data=[recipient_to_dict(r, doc_counts.get(r.id, 0)) for r in recipients])


@router.post("/dollar_cards")
def create_dollar_card(data: DollarCardCreate, actor: User = Depends(require_permission("إدارة بطاقات الدولار")), db: Session = Depends(get_db)):
    _validate_status(data.status)
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    recipient = DollarCardRecipient(
        id=new_id("usdcard"),
        full_name=data.full_name.strip(),
        national_id=data.national_id.strip(),
        phone=data.phone.strip(),
        account_number=(data.account_number or "").strip() or None,
        account_bank=(data.account_bank or "").strip() or None,
        passport_number=(data.passport_number or "").strip() or None,
        status=data.status,
        notes=data.notes,
        created_by=actor.name,
        timestamp=timestamp,
    )
    db.add(recipient)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="DollarCardRecipient", entity_id=recipient.id,
                      description=f"تمت إضافة مستفيد بطاقة الدولار: {recipient.full_name}", username=actor.username)
    db.commit()
    return success_response(data=recipient_to_dict(recipient), message_ar="تمت إضافة المستفيد بنجاح")


@router.put("/dollar_cards/{recipient_id}")
def update_dollar_card(recipient_id: str, data: DollarCardCreate, actor: User = Depends(require_permission("إدارة بطاقات الدولار")), db: Session = Depends(get_db)):
    _validate_status(data.status)
    recipient = db.get(DollarCardRecipient, recipient_id)
    if not recipient:
        raise APIError(code="NOT_FOUND", message_ar="المستفيد غير موجود", message_en="Recipient not found", status_code=404)
    recipient.full_name = data.full_name.strip()
    recipient.national_id = data.national_id.strip()
    recipient.phone = data.phone.strip()
    recipient.account_number = (data.account_number or "").strip() or None
    recipient.account_bank = (data.account_bank or "").strip() or None
    recipient.passport_number = (data.passport_number or "").strip() or None
    recipient.status = data.status
    recipient.notes = data.notes
    recipient.updated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="DollarCardRecipient", entity_id=recipient_id,
                      description=f"تم تعديل بيانات مستفيد بطاقة الدولار: {recipient.full_name}", username=actor.username)
    db.commit()
    return success_response(data=recipient_to_dict(recipient), message_ar="تم تعديل البيانات بنجاح")


class DollarCardStatusUpdate(BaseModel):
    status: str


@router.put("/dollar_cards/{recipient_id}/status")
def update_dollar_card_status(recipient_id: str, data: DollarCardStatusUpdate, actor: User = Depends(require_permission("إدارة بطاقات الدولار")), db: Session = Depends(get_db)):
    _validate_status(data.status)
    recipient = db.get(DollarCardRecipient, recipient_id)
    if not recipient:
        raise APIError(code="NOT_FOUND", message_ar="المستفيد غير موجود", message_en="Recipient not found", status_code=404)
    recipient.status = data.status
    recipient.updated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="DollarCardRecipient", entity_id=recipient_id,
                      description=f"تم تغيير حالة تسليم {recipient.full_name} إلى {data.status}", username=actor.username)
    db.commit()
    return success_response(data=recipient_to_dict(recipient), message_ar="تم تحديث الحالة بنجاح")


@router.delete("/dollar_cards/{recipient_id}")
def delete_dollar_card(recipient_id: str, actor: User = Depends(require_permission("إدارة بطاقات الدولار")), db: Session = Depends(get_db)):
    recipient = db.get(DollarCardRecipient, recipient_id)
    if not recipient:
        raise APIError(code="NOT_FOUND", message_ar="المستفيد غير موجود", message_en="Recipient not found", status_code=404)
    docs = db.scalars(select(DollarCardDocument).where(DollarCardDocument.recipient_id == recipient_id)).all()
    for doc in docs:
        if doc.stored_path:
            try:
                os.remove(resolve_path(doc.stored_path))
            except OSError:
                pass
        db.delete(doc)
    db.delete(recipient)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="DollarCardRecipient", entity_id=recipient_id,
                      description=f"تم حذف مستفيد بطاقة الدولار: {recipient.full_name}", username=actor.username)
    db.commit()
    return success_response(message_ar="تم حذف المستفيد بنجاح")


@router.get("/dollar_cards/{recipient_id}/documents")
def list_dollar_card_documents(recipient_id: str, db: Session = Depends(get_db)):
    docs = db.scalars(select(DollarCardDocument).where(DollarCardDocument.recipient_id == recipient_id)).all()
    return success_response(data=[document_to_dict(d) for d in docs])


@router.post("/dollar_cards/{recipient_id}/documents")
async def upload_dollar_card_document(recipient_id: str, file: UploadFile = File(...), actor: User = Depends(require_permission("إدارة بطاقات الدولار")), db: Session = Depends(get_db)):
    recipient = db.get(DollarCardRecipient, recipient_id)
    if not recipient:
        raise APIError(code="NOT_FOUND", message_ar="المستفيد غير موجود", message_en="Recipient not found", status_code=404)
    doc_id = new_id("usdcarddoc")
    stored_path = await save_upload("dollar_card_documents", doc_id, file)
    doc = DollarCardDocument(
        id=doc_id, recipient_id=recipient_id, file_name=file.filename or "document",
        stored_path=stored_path, uploaded_by=actor.name, timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
    )
    db.add(doc)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="DollarCardDocument", entity_id=doc_id,
                      description=f"تم رفع مستند لمستفيد بطاقة الدولار: {recipient.full_name}", username=actor.username)
    db.commit()
    return success_response(data=document_to_dict(doc), message_ar="تم رفع المستند بنجاح")


@router.get("/dollar_cards/documents/{doc_id}/file")
def download_dollar_card_document(doc_id: str, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.get(DollarCardDocument, doc_id)
    if not doc or not doc.stored_path:
        raise APIError(code="NOT_FOUND", message_ar="لا يوجد ملف مرفوع لهذا المستند", message_en="No file uploaded for this document", status_code=404)
    path = resolve_path(doc.stored_path)
    if not os.path.exists(path):
        raise APIError(code="NOT_FOUND", message_ar="الملف غير موجود على الخادم", message_en="File missing on server", status_code=404)
    return FileResponse(path, filename=doc.file_name, content_disposition_type="inline")


@router.delete("/dollar_cards/documents/{doc_id}")
def delete_dollar_card_document(doc_id: str, actor: User = Depends(require_permission("إدارة بطاقات الدولار")), db: Session = Depends(get_db)):
    doc = db.get(DollarCardDocument, doc_id)
    if not doc:
        raise APIError(code="NOT_FOUND", message_ar="المستند غير موجود", message_en="Document not found", status_code=404)
    if doc.stored_path:
        try:
            os.remove(resolve_path(doc.stored_path))
        except OSError:
            pass
    db.delete(doc)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="DollarCardDocument", entity_id=doc_id,
                      description="تم حذف مستند من سجل بطاقات الدولار", username=actor.username)
    db.commit()
    return success_response(message_ar="تم حذف المستند بنجاح")
