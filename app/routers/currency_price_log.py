from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from pydantic import BaseModel

from ..database import get_db
from ..models import CurrencyPriceLog, AuditAction, User
from ..tracking import create_audit_log
from ..core.responses import success_response
from ..core.errors import APIError
from ..auth_deps import require_permission
from ..id_gen import new_id

router = APIRouter(tags=["Currency Price History (manual daily log)"])


class CurrencyPriceLogCreate(BaseModel):
    currency: str
    date: str  # YYYY-MM-DD
    buy_rate: float
    sell_rate: float
    notes: str | None = None


def log_to_dict(p: CurrencyPriceLog):
    return {
        "id": p.id,
        "currency": p.currency,
        "date": p.date,
        "buyRate": p.buy_rate,
        "sellRate": p.sell_rate,
        "notes": p.notes,
        "enteredBy": p.entered_by,
        "timestamp": p.timestamp,
    }


@router.get("/currency_price_log")
def list_currency_price_log(currency: str = "", date_from: str = "", date_to: str = "", db: Session = Depends(get_db)):
    query = select(CurrencyPriceLog)
    if currency:
        query = query.where(CurrencyPriceLog.currency == currency)
    if date_from:
        query = query.where(CurrencyPriceLog.date >= date_from)
    if date_to:
        query = query.where(CurrencyPriceLog.date <= date_to)
    rows = db.scalars(query.order_by(CurrencyPriceLog.date.asc())).all()
    return success_response(data=[log_to_dict(p) for p in rows])


@router.post("/currency_price_log")
def upsert_currency_price_log(data: CurrencyPriceLogCreate, actor: User = Depends(require_permission("إدارة سجل أسعار العملات")), db: Session = Depends(get_db)):
    if data.buy_rate <= 0 or data.sell_rate <= 0:
        raise APIError(code="INVALID_RATE", message_ar="يجب أن يكون السعر أكبر من صفر", message_en="Rate must be positive", status_code=400)
    # One row per (currency, date) — re-logging the same day updates it in
    # place instead of creating a duplicate point on the chart.
    existing = db.scalar(select(CurrencyPriceLog).where(CurrencyPriceLog.currency == data.currency, CurrencyPriceLog.date == data.date))
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    if existing:
        existing.buy_rate = data.buy_rate
        existing.sell_rate = data.sell_rate
        existing.notes = data.notes
        existing.entered_by = actor.name
        existing.timestamp = timestamp
        row = existing
        message_ar = "تم تحديث سعر هذا اليوم بنجاح"
    else:
        row = CurrencyPriceLog(
            id=new_id("pricelog"), currency=data.currency, date=data.date,
            buy_rate=data.buy_rate, sell_rate=data.sell_rate, notes=data.notes,
            entered_by=actor.name, timestamp=timestamp,
        )
        db.add(row)
        message_ar = "تم تسجيل السعر بنجاح"
    create_audit_log(db, action=AuditAction.CREATE if not existing else AuditAction.UPDATE, entity_type="CurrencyPriceLog", entity_id=row.id,
                      description=f"تسجيل سعر {data.currency} ليوم {data.date}: شراء {data.buy_rate} / بيع {data.sell_rate}", username=actor.username)
    db.commit()
    return success_response(data=log_to_dict(row), message_ar=message_ar)


@router.delete("/currency_price_log/{log_id}")
def delete_currency_price_log(log_id: str, actor: User = Depends(require_permission("إدارة سجل أسعار العملات")), db: Session = Depends(get_db)):
    row = db.get(CurrencyPriceLog, log_id)
    if not row:
        raise APIError(code="NOT_FOUND", message_ar="السجل غير موجود", message_en="Log entry not found", status_code=404)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="CurrencyPriceLog", entity_id=log_id,
                      description=f"تم حذف سجل سعر {row.currency} ليوم {row.date}", username=actor.username)
    db.delete(row)
    db.commit()
    return success_response(message_ar="تم حذف السجل بنجاح")
