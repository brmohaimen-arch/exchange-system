from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..database import get_db
from ..models import Currency, Transaction, Vault, AuditAction, ExchangeRate, RateHistory, User, CurrencyDenomination
from ..tracking import create_audit_log
from ..core.responses import success_response, error_response
from ..core.errors import APIError
from ..auth_deps import require_permission
from ..id_gen import new_id
from pydantic import BaseModel
from datetime import datetime

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
    marketRate: float | None = None
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
            "marketRate": r.market_rate,
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
def create_currency(data: CurrencyDTO, actor: User = Depends(require_permission("إدارة العملات")), db: Session = Depends(get_db)):
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
def update_currency(code: str, data: CurrencyDTO, actor: User = Depends(require_permission("إدارة العملات")), db: Session = Depends(get_db)):
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
def delete_currency(code: str, actor: User = Depends(require_permission("إدارة العملات")), db: Session = Depends(get_db)):
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

def _validate_rate_bounds(data: ExchangeRateDTO):
    if data.buyRate <= 0 or data.sellRate <= 0:
        raise APIError(code="INVALID_RATE", message_ar="يجب أن يكون سعر الشراء والبيع أكبر من صفر", message_en="Buy/sell rate must be positive", status_code=400)
    if data.minRate and data.maxRate and data.minRate > data.maxRate:
        raise APIError(code="INVALID_RATE_BOUNDS", message_ar="الحد الأدنى للسعر لا يمكن أن يكون أكبر من الحد الأقصى", message_en="min_rate cannot exceed max_rate", status_code=400)

@router.post("/rates")
def create_exchange_rate(data: ExchangeRateDTO, actor: User = Depends(require_permission("تعديل أسعار الصرف")), db: Session = Depends(get_db)):
    _validate_rate_bounds(data)
    existing = db.get(ExchangeRate, data.id)
    if existing:
        # Upsert: rate with this ID already exists — update it
        existing.from_currency = data.fromCurrency
        existing.to_currency = data.toCurrency
        existing.buy_rate = data.buyRate
        existing.sell_rate = data.sellRate
        existing.min_rate = data.minRate
        existing.max_rate = data.maxRate
        existing.market_rate = data.marketRate
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
        market_rate=data.marketRate,
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
def update_exchange_rate(rate_id: str, data: ExchangeRateDTO, actor: User = Depends(require_permission("تعديل أسعار الصرف")), db: Session = Depends(get_db)):
    rate = db.get(ExchangeRate, rate_id)
    if not rate:
        raise APIError(code="NOT_FOUND", message_ar="سعر الصرف غير موجود", message_en="Exchange rate not found", status_code=404)
    _validate_rate_bounds(data)

    # Auto-write rate history server-side so it can't be skipped by any client —
    # only when the buy/sell rate actually changed, not on every metadata edit.
    if rate.buy_rate != data.buyRate or rate.sell_rate != data.sellRate:
        history = RateHistory(
            id=new_id(f"h_{rate_id}"),
            pair=f"{rate.from_currency} / {rate.to_currency}",
            old_buy=rate.buy_rate,
            new_buy=data.buyRate,
            old_sell=rate.sell_rate,
            new_sell=data.sellRate,
            username=data.updatedBy or "غير معروف",
            timestamp=data.lastUpdated or datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
            notes=data.notes or "تحديث سعر الصرف"
        )
        db.add(history)
        create_audit_log(
            db, action=AuditAction.UPDATE, entity_type="ExchangeRate", entity_id=rate_id,
            description=f"تم تحديث سعر الصرف {rate.from_currency}/{rate.to_currency}: شراء {data.buyRate} (سابقاً {rate.buy_rate})، بيع {data.sellRate} (سابقاً {rate.sell_rate})",
            username=data.updatedBy
        )

    rate.buy_rate = data.buyRate
    rate.sell_rate = data.sellRate
    rate.min_rate = data.minRate
    rate.max_rate = data.maxRate
    rate.market_rate = data.marketRate
    rate.valid_from = data.validFrom
    rate.valid_to = data.validTo
    rate.is_active = data.isActive
    rate.last_updated = data.lastUpdated
    rate.updated_by = data.updatedBy
    db.commit()
    return success_response(data={"id": rate.id})

# ----------------- DENOMINATIONS -----------------
class DenominationSetRequest(BaseModel):
    values: list[float]

@router.get("/{code}/denominations")
def list_denominations(code: str, db: Session = Depends(get_db)):
    rows = db.scalars(select(CurrencyDenomination).where(CurrencyDenomination.currency == code.upper())).all()
    values = sorted((r.value for r in rows), reverse=True)
    return success_response(data=values)

@router.put("/{code}/denominations")
def set_denominations(code: str, data: DenominationSetRequest, actor: User = Depends(require_permission("إدارة العملات")), db: Session = Depends(get_db)):
    code = code.upper()
    existing = db.scalars(select(CurrencyDenomination).where(CurrencyDenomination.currency == code)).all()
    for row in existing:
        db.delete(row)
    db.flush()
    for v in sorted(set(data.values), reverse=True):
        db.add(CurrencyDenomination(id=f"den_{code.lower()}_{v}", currency=code, value=v))
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="CurrencyDenomination", entity_id=code, description=f"تم تحديث فئات العملة {code}: {data.values}", username=actor.username)
    db.commit()
    return success_response(data=sorted(data.values, reverse=True), message_ar="تم تحديث الفئات النقدية بنجاح")

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
