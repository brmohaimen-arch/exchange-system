from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..database import get_db
from ..models import Currency, Transaction, Vault, AuditAction, ExchangeRate, RateHistory
from ..tracking import create_audit_log
from ..core.responses import success_response, error_response
from ..core.errors import APIError
from pydantic import BaseModel

router = APIRouter(prefix="/currencies", tags=["Currencies"])

class CurrencyDTO(BaseModel):
    code: str
    nameAr: str
    nameEn: str
    symbol: str
    country: str
    flag: str
    decimalPlaces: int
    isActive: bool = True
    lastUpdated: str | None = None

class ExchangeRateDTO(BaseModel):
    id: str
    fromCurrency: str
    toCurrency: str
    buyRate: float
    sellRate: float
    minRate: float = 0.0
    maxRate: float = 100.0
    validFrom: str = ""
    validTo: str = ""
    isActive: bool = True
    lastUpdated: str = ""
    updatedBy: str = ""
    notes: str | None = None

class RateHistoryDTO(BaseModel):
    id: str
    pair: str
    oldBuy: float
    newBuy: float
    oldSell: float
    newSell: float
    user: str
    timestamp: str
    notes: str | None = None

@router.get("")
def list_currencies(db: Session = Depends(get_db)):
    currencies = db.scalars(select(Currency)).all()
    res = []
    for c in currencies:
        res.append({
            "code": c.code,
            "nameAr": c.name_ar,
            "nameEn": c.name_en,
            "symbol": c.symbol,
            "country": c.country,
            "flag": c.flag,
            "decimalPlaces": c.decimal_places,
            "isActive": c.is_active,
            "lastUpdated": c.last_updated
        })
    return success_response(data=res)

@router.get("/rates")
def list_rates(db: Session = Depends(get_db)):
    rates = db.scalars(select(ExchangeRate)).all()
    res_list = []
    for r in rates:
        res_list.append({
            "id": r.id,
            "fromCurrency": r.from_currency,
            "toCurrency": r.to_currency,
            "buyRate": r.buy_rate,
            "sellRate": r.sell_rate,
            "minRate": r.min_rate,
            "maxRate": r.max_rate,
            "validFrom": r.valid_from,
            "validTo": r.valid_to,
            "isActive": r.is_active,
            "lastUpdated": r.last_updated,
            "updatedBy": r.updated_by
        })
    return success_response(data=res_list)

@router.get("/rate_histories")
def list_histories(db: Session = Depends(get_db)):
    histories = db.scalars(select(RateHistory)).all()
    res_list = []
    for h in histories:
        res_list.append({
            "id": h.id,
            "pair": h.pair,
            "oldBuy": h.old_buy,
            "newBuy": h.new_buy,
            "oldSell": h.old_sell,
            "newSell": h.new_sell,
            "user": h.username,
            "timestamp": h.timestamp,
            "notes": h.notes
        })
    return success_response(data=res_list)

@router.get("/{code}")
def get_currency(code: str, db: Session = Depends(get_db)):
    c = db.get(Currency, code.upper())
    if not c:
        raise APIError(code="NOT_FOUND", message_ar="العملة غير موجودة", message_en="Currency not found", status_code=404)
    res = {
        "code": c.code,
        "nameAr": c.name_ar,
        "nameEn": c.name_en,
        "symbol": c.symbol,
        "country": c.country,
        "flag": c.flag,
        "decimalPlaces": c.decimal_places,
        "isActive": c.is_active,
        "lastUpdated": c.last_updated
    }
    return success_response(data=res)

@router.post("")
def create_currency(data: CurrencyDTO, db: Session = Depends(get_db)):
    obj = Currency(
        code=data.code.upper(),
        name_ar=data.nameAr,
        name_en=data.nameEn,
        symbol=data.symbol,
        country=data.country,
        flag=data.flag,
        decimal_places=data.decimalPlaces,
        is_active=data.isActive,
        last_updated=data.lastUpdated
    )
    db.add(obj)

    create_audit_log(
        db,
        action=AuditAction.CREATE,
        entity_type="Currency",
        entity_id=data.code.upper(),
        description=f"تمت إضافة العملة {data.code.upper()}",
        username="system",
        new_value=data.model_dump(),
    )

    db.commit()
    return success_response(data={"code": obj.code}, message_ar=f"تمت إضافة العملة {data.code.upper()} بنجاح")

@router.put("/{code}")
def update_currency(code: str, data: CurrencyDTO, db: Session = Depends(get_db)):
    obj = db.get(Currency, code.upper())
    if not obj:
        raise APIError(code="NOT_FOUND", message_ar="العملة غير موجودة", message_en="Currency not found", status_code=404)

    obj.name_ar = data.nameAr
    obj.name_en = data.nameEn
    obj.symbol = data.symbol
    obj.country = data.country
    obj.flag = data.flag
    obj.decimal_places = data.decimalPlaces
    obj.is_active = data.isActive
    obj.last_updated = data.lastUpdated

    create_audit_log(
        db,
        action=AuditAction.UPDATE,
        entity_type="Currency",
        entity_id=code.upper(),
        description=f"تم تعديل العملة {code.upper()}",
        username="system",
        new_value=data.model_dump(),
    )

    db.commit()
    return success_response(data={"code": obj.code}, message_ar=f"تم تعديل العملة {code.upper()} بنجاح")

@router.delete("/{code}")
def delete_currency(code: str, db: Session = Depends(get_db)):
    code = code.upper()

    has_transactions = db.scalar(
        select(Transaction).where(
            (Transaction.from_currency == code) | (Transaction.to_currency == code)
        ).limit(1)
    )

    vaults = db.scalars(select(Vault)).all()
    has_balance = any(v.balances.get(code, 0.0) > 0 for v in vaults)

    if has_transactions or has_balance:
        raise APIError(
            code="CURRENCY_HAS_TRANSACTIONS",
            message_ar="لا يمكن حذف العملة لأنها مرتبطة بعمليات أو أرصدة سابقة",
            message_en="Cannot delete currency because it has transactions or balances. Disable it instead.",
            status_code=400
        )

    obj = db.get(Currency, code)
    if not obj:
        raise APIError(code="NOT_FOUND", message_ar="العملة غير موجودة", message_en="Currency not found", status_code=404)

    db.delete(obj)

    create_audit_log(
        db,
        action=AuditAction.DELETE,
        entity_type="Currency",
        entity_id=code,
        description=f"تم حذف العملة {code}",
        username="system"
    )

    db.commit()
    return success_response(message_ar=f"تم حذف العملة {code} بنجاح", message_en="Currency deleted successfully")

@router.post("/rates")
def create_exchange_rate(data: ExchangeRateDTO, db: Session = Depends(get_db)):
    existing = db.get(ExchangeRate, data.id)
    if existing:
        # Upsert: rate with this ID already exists — update it
        existing.from_currency = data.fromCurrency
        existing.to_currency = data.toCurrency
        existing.buy_rate = data.buyRate
        existing.sell_rate = data.sellRate
        existing.min_rate = data.minRate
        existing.max_rate = data.maxRate
        existing.valid_from = data.validFrom
        existing.valid_to = data.validTo
        existing.is_active = data.isActive
        existing.last_updated = data.lastUpdated
        existing.updated_by = data.updatedBy
        db.commit()
        return success_response(data={"id": existing.id})
    rate = ExchangeRate(
        id=data.id,
        from_currency=data.fromCurrency,
        to_currency=data.toCurrency,
        buy_rate=data.buyRate,
        sell_rate=data.sellRate,
        min_rate=data.minRate,
        max_rate=data.maxRate,
        valid_from=data.validFrom,
        valid_to=data.validTo,
        is_active=data.isActive,
        last_updated=data.lastUpdated,
        updated_by=data.updatedBy
    )
    db.add(rate)
    db.commit()
    return success_response(data={"id": rate.id})

@router.put("/rates/{rate_id}")
def update_exchange_rate(rate_id: str, data: ExchangeRateDTO, db: Session = Depends(get_db)):
    rate = db.get(ExchangeRate, rate_id)
    if not rate:
        raise APIError(code="NOT_FOUND", message_ar="سعر الصرف غير موجود", message_en="Exchange rate not found", status_code=404)
    rate.buy_rate = data.buyRate
    rate.sell_rate = data.sellRate
    rate.min_rate = data.minRate
    rate.max_rate = data.maxRate
    rate.valid_from = data.validFrom
    rate.valid_to = data.validTo
    rate.is_active = data.isActive
    rate.last_updated = data.lastUpdated
    rate.updated_by = data.updatedBy
    db.commit()
    return success_response(data={"id": rate.id})

@router.post("/rate_histories")
def create_rate_history(data: RateHistoryDTO, db: Session = Depends(get_db)):
    history = RateHistory(
        id=data.id,
        pair=data.pair,
        old_buy=data.oldBuy,
        new_buy=data.newBuy,
        old_sell=data.oldSell,
        new_sell=data.newSell,
        username=data.user,
        timestamp=data.timestamp,
        notes=data.notes
    )
    db.add(history)
    db.commit()
    return success_response(data={"id": history.id})
