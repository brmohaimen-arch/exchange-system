"""Lets an admin add another fleet-style sub-company (like بيان الدولية) from
the sidebar instead of a code change — it always reuses the exact same
template (vehicles, warehouses, accounts, statement, KPIs) that fleet.py
already implements; this module only manages the *list* of companies and
their permission strings.

A brand-new company's API routes work immediately: main.py mounts fleet.router
once at "/api/co/{company_id}" for every possible id (not per-row), and
fleet.get_company() reads the id straight out of the URL — so there's nothing
to (re)register when a row is added here, and no restart is needed.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth_deps import require_permission, get_current_user
from ..core.errors import APIError
from ..core.responses import success_response
from ..database import get_db
from ..id_gen import new_id
from ..models import AuditAction, FleetAccount, FleetCompanyDef, FleetVehicle, FleetWarehouse, Role, User
from ..tracking import create_audit_log

router = APIRouter(tags=["Fleet companies (dynamic list)"])

DEFAULT_FLEET_WAREHOUSES = ["11 يوليو", "النوفلين", "عرادة طريق المطار"]
ICON_CHOICES = {"Truck", "Car", "Package", "Building2", "Boxes", "Warehouse"}


def _company_to_dict(c: FleetCompanyDef) -> dict:
    return {"id": c.id, "name": c.name, "permission": c.permission, "icon": c.icon, "isActive": c.is_active, "createdBy": c.created_by, "timestamp": c.timestamp}


@router.get("/fleet_companies")
def list_fleet_companies(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Every logged-in user can see the list (same as the 3 built-in companies
    already being visible in the sidebar's source) — the frontend filters what
    it links to by whether the viewer actually holds each company's permission."""
    rows = db.scalars(select(FleetCompanyDef).where(FleetCompanyDef.is_active == True).order_by(FleetCompanyDef.timestamp)).all()  # noqa: E712
    return success_response(data=[_company_to_dict(c) for c in rows])


class FleetCompanyCreate(BaseModel):
    name: str
    icon: str = "Truck"


@router.post("/fleet_companies")
def create_fleet_company(data: FleetCompanyCreate, actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise APIError(code="NAME_REQUIRED", message_ar="اسم الشركة مطلوب", message_en="Company name is required", status_code=400)
    if len(name) > 100:
        raise APIError(code="NAME_TOO_LONG", message_ar="اسم الشركة طويل جداً", message_en="Company name is too long", status_code=400)
    icon = data.icon if data.icon in ICON_CHOICES else "Truck"
    # Matches the 3 built-in companies' own permission strings ("إدارة شركة
    # الامتياز") — don't double up "شركة" when the typed name already has it.
    permission = f"إدارة {name}" if name.startswith("شركة") else f"إدارة شركة {name}"
    if db.scalar(select(FleetCompanyDef).where(FleetCompanyDef.permission == permission)):
        raise APIError(code="ALREADY_EXISTS", message_ar="توجد شركة بنفس هذا الاسم بالفعل", message_en="A company with this name already exists", status_code=400)

    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    company = FleetCompanyDef(id=new_id("co"), name=name, permission=permission, icon=icon, is_active=True, created_by=actor.name, timestamp=ts)
    db.add(company)

    # Same starting warehouses every other company gets, and the permission
    # granted to the current admin's own role right away (so whoever created
    # it can use it — like NEW_PERMISSIONS_FOR_ADMIN does for the 3 built-ins,
    # but at creation time instead of a migration).
    for wh_name in DEFAULT_FLEET_WAREHOUSES:
        db.add(FleetWarehouse(id=new_id("fleetwh"), company=company.id, name=wh_name, created_by=actor.name, timestamp=ts))
    role = db.get(Role, actor.role)
    if role and permission not in (role.permissions or []):
        role.permissions = [*role.permissions, permission]

    create_audit_log(db, action=AuditAction.CREATE, entity_type="FleetCompanyDef", entity_id=company.id,
                      description=f"تمت إضافة شركة جديدة من الشريط الجانبي: {name}", username=actor.username)
    db.commit()
    return success_response(data=_company_to_dict(company), message_ar=f"تمت إضافة {name} بنجاح")


class FleetCompanyRename(BaseModel):
    name: str


@router.put("/fleet_companies/{company_id}")
def rename_fleet_company(company_id: str, data: FleetCompanyRename, actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    """Renames the DISPLAY name only — the permission string (granted to
    roles already) stays fixed, so renaming never silently revokes access."""
    c = db.get(FleetCompanyDef, company_id)
    if not c:
        raise APIError(code="NOT_FOUND", message_ar="الشركة غير موجودة", message_en="Company not found", status_code=404)
    name = data.name.strip()
    if not name:
        raise APIError(code="NAME_REQUIRED", message_ar="اسم الشركة مطلوب", message_en="Company name is required", status_code=400)
    c.name = name
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="FleetCompanyDef", entity_id=c.id, description=f"تم تعديل اسم الشركة إلى: {name}", username=actor.username)
    db.commit()
    return success_response(data=_company_to_dict(c), message_ar="تم تعديل الاسم بنجاح")


@router.put("/fleet_companies/{company_id}/toggle_active")
def toggle_fleet_company(company_id: str, actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    """Deactivating hides it from the sidebar list — its data, accounts and
    permission all stay intact, so re-activating brings it back exactly as it
    was. A brand-new backend route mount is never removed by this (routes are
    only created at startup), so a deactivated-then-reactivated company works
    immediately without another restart."""
    c = db.get(FleetCompanyDef, company_id)
    if not c:
        raise APIError(code="NOT_FOUND", message_ar="الشركة غير موجودة", message_en="Company not found", status_code=404)
    c.is_active = not c.is_active
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="FleetCompanyDef", entity_id=c.id,
                      description=f"تم {'تفعيل' if c.is_active else 'تعطيل'} الشركة: {c.name}", username=actor.username)
    db.commit()
    return success_response(data=_company_to_dict(c))
