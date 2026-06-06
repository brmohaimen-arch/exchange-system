from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..database import get_db
from ..models import (
    FixedAsset, Vehicle, RealEstate, MaintenanceRecord, DepreciationRecord, AssetDocument,
    AuditAction
)
from ..tracking import create_audit_log
from ..core.responses import success_response, error_response
from ..core.errors import APIError
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(tags=["Fixed Assets Management"])

# DTOs
class FixedAssetCreate(BaseModel):
    id: str
    name: str
    type: str
    category: str
    branch: str
    location: str
    purchase_date: str
    purchase_price: float
    currency: str
    current_value: float
    status: str
    responsible: str
    notes: str | None = None

class AssetDocumentCreate(BaseModel):
    id: str
    asset_id: str
    asset_name: str
    document_type: str
    file_name: str
    expiry_date: str | None = None
    status: str
    notes: str | None = None

class AssetSell(BaseModel):
    price: float
    currency: str
    buyer: str
    notes: str | None = None

class AssetTransfer(BaseModel):
    to_branch: str
    to_location: str
    responsible: str

class MaintenanceComplete(BaseModel):
    final_cost: float
    notes: str | None = None

# Helpers for serialization
def asset_to_dict(asset: FixedAsset):
    return {
        "id": asset.id,
        "name": asset.name,
        "type": asset.type,
        "category": asset.category,
        "branch": asset.branch,
        "location": asset.location,
        "purchaseDate": asset.purchase_date,
        "purchasePrice": asset.purchase_price,
        "currency": asset.currency,
        "currentValue": asset.current_value,
        "status": asset.status,
        "responsible": asset.responsible,
        "notes": asset.notes
    }

def vehicle_to_dict(v: Vehicle):
    return {
        "id": v.id,
        "assetId": v.asset_id,
        "carName": v.car_name,
        "plateNumber": v.plate_number,
        "type": v.type,
        "model": v.model,
        "makeYear": v.make_year,
        "vin": v.vin,
        "engineNumber": v.engine_number,
        "color": v.color,
        "mileage": v.mileage,
        "insuranceDate": v.insurance_date,
        "insuranceExpiry": v.insurance_expiry,
        "licenseDate": v.license_date,
        "licenseExpiry": v.license_expiry,
        "driver": v.driver,
        "branch": v.branch,
        "status": v.status
    }

def estate_to_dict(r: RealEstate):
    return {
        "id": r.id,
        "assetId": r.asset_id,
        "propertyName": r.property_name,
        "propertyType": r.property_type,
        "city": r.city,
        "address": r.address,
        "area": r.area,
        "deedNumber": r.deed_number,
        "ownershipType": r.ownership_type,
        "acquisitionDate": r.acquisition_date,
        "purchasePrice": r.purchase_price,
        "currentEstimatedValue": r.current_estimated_value,
        "leaseStart": r.lease_start,
        "leaseEnd": r.lease_end,
        "monthlyRent": r.monthly_rent,
        "status": r.status
    }

def maintenance_to_dict(m: MaintenanceRecord):
    return {
        "id": m.id,
        "assetId": m.asset_id,
        "assetName": m.asset_name,
        "maintenanceType": m.maintenance_type,
        "date": m.date,
        "cost": m.cost,
        "currency": m.currency,
        "provider": m.provider,
        "description": m.description,
        "status": m.status,
        "responsibleEmployee": m.responsible_employee
    }

def depreciation_to_dict(d: DepreciationRecord):
    return {
        "assetId": d.asset_id,
        "assetName": d.asset_name,
        "depreciationMethod": d.depreciation_method,
        "purchasePrice": d.purchase_price,
        "residualValue": d.residual_value,
        "usefulLife": d.useful_life,
        "annualDepreciationRate": d.annual_depreciation_rate,
        "annualDepreciation": d.annual_depreciation,
        "accumulatedDepreciation": d.accumulated_depreciation,
        "currentBookValue": d.current_book_value,
        "lastCalculatedDate": d.last_calculated_date
    }

def document_to_dict(doc: AssetDocument):
    return {
        "id": doc.id,
        "assetId": doc.asset_id,
        "assetName": doc.asset_name,
        "documentType": doc.document_type,
        "fileName": doc.file_name,
        "expiryDate": doc.expiry_date,
        "status": doc.status,
        "notes": doc.notes
    }

# ----------------- ASSETS CRUD -----------------
@router.get("/assets")
def list_assets(db: Session = Depends(get_db)):
    assets = db.scalars(select(FixedAsset)).all()
    return success_response(data=[asset_to_dict(a) for a in assets])

@router.post("/assets")
def create_asset(data: FixedAssetCreate, db: Session = Depends(get_db)):
    asset = FixedAsset(**data.model_dump())
    db.add(asset)
    
    # Also create default depreciation record placeholder
    dep = DepreciationRecord(
        asset_id=asset.id,
        asset_name=asset.name,
        depreciation_method="القسط الثابت",
        purchase_price=asset.purchase_price,
        residual_value=0.0,
        useful_life=5,
        annual_depreciation_rate=20.0,
        annual_depreciation=asset.purchase_price * 0.20,
        accumulated_depreciation=0.0,
        current_book_value=asset.purchase_price,
        last_calculated_date=datetime.utcnow().strftime("%Y-%m-%d")
    )
    db.add(dep)

    create_audit_log(db, action=AuditAction.CREATE, entity_type="FixedAsset", entity_id=data.id, description=f"تم تسجيل أصل ثابت جديد: {data.name}")
    db.commit()
    return success_response(data=asset_to_dict(asset))

@router.put("/assets/{asset_id}")
def update_asset(asset_id: str, data: FixedAssetCreate, db: Session = Depends(get_db)):
    asset = db.get(FixedAsset, asset_id)
    if not asset:
        raise APIError(code="NOT_FOUND", message_ar="الأصل غير موجود", message_en="Asset not found", status_code=404)
    for k, v in data.model_dump().items():
        setattr(asset, k, v)
    db.commit()
    return success_response(data=asset_to_dict(asset))

@router.post("/assets/{asset_id}/sell")
def sell_asset(asset_id: str, data: AssetSell, db: Session = Depends(get_db)):
    asset = db.get(FixedAsset, asset_id)
    if not asset:
        raise APIError(code="NOT_FOUND", message_ar="الأصل غير موجود", message_en="Asset not found", status_code=404)
    
    asset.status = "تم البيع"
    asset.current_value = 0.0
    asset.notes = f"تم البيع للمشتري {data.buyer} بقيمة {data.price} {data.currency} — {data.notes or ''}"

    create_audit_log(db, action=AuditAction.UPDATE, entity_type="FixedAsset", entity_id=asset.id, description=f"تم بيع الأصل الثابت: {asset.name} للمشتري {data.buyer}")
    db.commit()
    return success_response(data=asset_to_dict(asset))

@router.post("/assets/{asset_id}/transfer")
def transfer_asset(asset_id: str, data: AssetTransfer, db: Session = Depends(get_db)):
    asset = db.get(FixedAsset, asset_id)
    if not asset:
         raise APIError(code="NOT_FOUND", message_ar="الأصل غير موجود", message_en="Asset not found", status_code=404)
    
    old_branch = asset.branch
    asset.branch = data.to_branch
    asset.location = data.to_location
    asset.responsible = data.responsible

    create_audit_log(db, action=AuditAction.UPDATE, entity_type="FixedAsset", entity_id=asset.id, description=f"نقل عهدة الأصل {asset.name} من فرع {old_branch} إلى {data.to_branch}")
    db.commit()
    return success_response(data=asset_to_dict(asset))

# ----------------- VEHICLES & REAL ESTATE LISTS -----------------
@router.get("/vehicles")
def list_vehicles(db: Session = Depends(get_db)):
    res = db.scalars(select(Vehicle)).all()
    return success_response(data=[vehicle_to_dict(v) for v in res])

@router.get("/real_estates")
def list_real_estates(db: Session = Depends(get_db)):
    res = db.scalars(select(RealEstate)).all()
    return success_response(data=[estate_to_dict(r) for r in res])

# ----------------- MAINTENANCE RECORDS -----------------
@router.get("/maintenance_records")
def list_maintenance_records(db: Session = Depends(get_db)):
    res = db.scalars(select(MaintenanceRecord)).all()
    return success_response(data=[maintenance_to_dict(m) for m in res])

@router.post("/maintenance_records")
def add_maintenance_record(record: FixedAssetCreate, db: Session = Depends(get_db)):
    m = MaintenanceRecord(
        id=record.id,
        asset_id=record.category,
        asset_name=record.name,
        maintenance_type=record.type,
        date=record.purchase_date,
        cost=record.purchase_price,
        currency=record.currency,
        provider=record.location,
        description=record.notes or "",
        status="قيد التنفيذ",
        responsible_employee=record.responsible
    )
    db.add(m)
    db.commit()
    return success_response(data=maintenance_to_dict(m))

@router.post("/maintenance_records/{id}/complete")
def complete_maintenance(id: str, data: MaintenanceComplete, db: Session = Depends(get_db)):
    record = db.get(MaintenanceRecord, id)
    if not record:
        raise APIError(code="NOT_FOUND", message_ar="سجل الصيانة غير موجود", message_en="Record not found", status_code=404)
    record.status = "مكتملة"
    record.cost = data.final_cost
    if data.notes:
        record.description = f"{record.description} — إقفال: {data.notes}"
    db.commit()
    return success_response(data=maintenance_to_dict(record))

# ----------------- DEPRECIATION RECORDS -----------------
@router.get("/depreciation_records")
def list_depreciation_records(db: Session = Depends(get_db)):
    res = db.scalars(select(DepreciationRecord)).all()
    return success_response(data=[depreciation_to_dict(d) for d in res])

# ----------------- ASSET DOCUMENTS -----------------
@router.get("/asset_documents")
def list_asset_documents(db: Session = Depends(get_db)):
    res = db.scalars(select(AssetDocument)).all()
    return success_response(data=[document_to_dict(d) for d in res])

@router.post("/asset_documents")
def add_asset_document(data: AssetDocumentCreate, db: Session = Depends(get_db)):
    doc = AssetDocument(**data.model_dump())
    db.add(doc)
    db.commit()
    return success_response(data=document_to_dict(doc))

# ----------------- VEHICLES & REAL ESTATE CRUD -----------------
class VehicleCreate(BaseModel):
    id: str
    asset_id: str
    car_name: str
    plate_number: str
    type: str
    model: str
    make_year: int
    vin: str
    engine_number: str
    color: str
    mileage: int
    insurance_date: str
    insurance_expiry: str
    license_date: str
    license_expiry: str
    driver: str
    branch: str
    status: str

class RealEstateCreate(BaseModel):
    id: str
    asset_id: str
    property_name: str
    property_type: str
    city: str
    address: str
    area: float
    deed_number: str
    ownership_type: str
    acquisition_date: str
    purchase_price: float
    current_estimated_value: float
    lease_start: str | None = None
    lease_end: str | None = None
    monthly_rent: float
    status: str

@router.post("/vehicles")
def create_vehicle(data: VehicleCreate, db: Session = Depends(get_db)):
    v = Vehicle(**data.model_dump())
    db.add(v)
    db.commit()
    return success_response(data=vehicle_to_dict(v))

@router.put("/vehicles/{id}")
def update_vehicle(id: str, data: VehicleCreate, db: Session = Depends(get_db)):
    v = db.get(Vehicle, id)
    if not v:
        raise APIError(code="NOT_FOUND", message_ar="المركبة غير موجودة", message_en="Vehicle not found", status_code=404)
    for k, val in data.model_dump().items():
        setattr(v, k, val)
    db.commit()
    return success_response(data=vehicle_to_dict(v))

@router.post("/real_estates")
def create_real_estate(data: RealEstateCreate, db: Session = Depends(get_db)):
    r = RealEstate(**data.model_dump())
    db.add(r)
    db.commit()
    return success_response(data=estate_to_dict(r))

@router.put("/real_estates/{id}")
def update_real_estate(id: str, data: RealEstateCreate, db: Session = Depends(get_db)):
    r = db.get(RealEstate, id)
    if not r:
        raise APIError(code="NOT_FOUND", message_ar="العقار غير موجود", message_en="Real estate not found", status_code=404)
    for k, val in data.model_dump().items():
        setattr(r, k, val)
    db.commit()
    return success_response(data=estate_to_dict(r))
