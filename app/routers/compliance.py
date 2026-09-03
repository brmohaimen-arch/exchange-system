from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..database import get_db
from ..models import ComplianceFlag, AuditAction, User
from ..tracking import create_audit_log
from ..core.responses import success_response
from ..core.errors import APIError
from ..auth_deps import require_permission
from pydantic import BaseModel
from typing import Literal

router = APIRouter(prefix="/compliance", tags=["Compliance & AML"])

class FlagReviewRequest(BaseModel):
    status: Literal["reviewed", "reported"]
    notes: str | None = None


def flag_to_dict(f: ComplianceFlag):
    return {
        "id": f.id,
        "transactionId": f.transaction_id,
        "customerId": f.customer_id,
        "customerName": f.customer_name,
        "reason": f.reason,
        "amountLydEquivalent": f.amount_lyd_equivalent,
        "currency": f.currency,
        "timestamp": f.timestamp,
        "status": f.status,
        "reviewedBy": f.reviewed_by,
        "notes": f.notes,
    }

@router.get("/flags")
def list_flags(actor: User = Depends(require_permission("رؤية سجل العمليات")), db: Session = Depends(get_db)):
    res = db.scalars(select(ComplianceFlag).order_by(ComplianceFlag.timestamp.desc())).all()
    return success_response(data=[flag_to_dict(f) for f in res])

@router.put("/flags/{flag_id}")
def review_flag(flag_id: str, data: FlagReviewRequest, actor: User = Depends(require_permission("رؤية سجل العمليات")), db: Session = Depends(get_db)):
    flag = db.get(ComplianceFlag, flag_id)
    if not flag:
        raise APIError(code="NOT_FOUND", message_ar="سجل المراجعة غير موجود", message_en="Compliance flag not found", status_code=404)
    flag.status = data.status
    flag.reviewed_by = actor.name
    if data.notes:
        flag.notes = data.notes
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="ComplianceFlag", entity_id=flag_id, description=f"تم تحديث حالة المراجعة إلى {data.status} للعملية {flag.transaction_id}", username=actor.username)
    db.commit()
    return success_response(data=flag_to_dict(flag), message_ar="تم تحديث حالة المراجعة بنجاح")
