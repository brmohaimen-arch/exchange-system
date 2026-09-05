"""
First-run setup wizard.

Every client company gets its own separate deployment/database (confirmed
architecture: not shared multi-tenant SaaS). Before this existed, standing up a
new client meant hand-editing seed.py's hardcoded Libyan branch/currency/admin
values. This lets a reseller or the client themselves fill in their own company
name, base currency, first branch, and first admin account through the UI
instead — the guided equivalent of what seed.py does with placeholder data.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth_deps import hash_password
from ..core.errors import APIError
from ..core.responses import success_response
from ..database import get_db
from ..models import Branch, Currency, SystemSetting, User, Vault
from ..seed import seed_roles
from ..tracking import create_audit_log
from ..models import AuditAction
from ..trial import trial_status

router = APIRouter(prefix="/setup", tags=["First-run Setup"])


class SetupInitRequest(BaseModel):
    companyName: str
    address: str = ""
    phone: str = ""
    baseCurrencyCode: str = "LYD"
    baseCurrencyNameAr: str
    baseCurrencyNameEn: str
    baseCurrencySymbol: str
    firstBranchName: str
    firstBranchCity: str
    adminName: str
    adminUsername: str
    adminPassword: str


@router.get("/status")
def get_setup_status(db: Session = Depends(get_db)):
    initialized = db.query(User).count() > 0
    return success_response(data={"initialized": initialized})


@router.get("/trial")
def get_trial_status(db: Session = Depends(get_db)):
    """Public and unauthenticated on purpose: a user locked out by an expired
    trial still needs to see *why* without being able to log in to ask."""
    return success_response(data=trial_status(db))


@router.post("/initialize")
def initialize_deployment(data: SetupInitRequest, db: Session = Depends(get_db)):
    if db.query(User).count() > 0:
        raise APIError(
            code="ALREADY_INITIALIZED",
            message_ar="تم إعداد النظام بالفعل — لا يمكن تشغيل معالج الإعداد الأولي مرة أخرى",
            message_en="This deployment is already initialized",
            status_code=400,
        )

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M")

    branch = Branch(
        id=data.firstBranchName, name=data.firstBranchName, city=data.firstBranchCity,
        address=data.address, phone=data.phone, manager=data.adminName, is_active=True,
        notes="تم إنشاؤه تلقائياً عبر معالج الإعداد الأولي"
    )
    db.add(branch)
    db.flush()

    currency = Currency(
        code=data.baseCurrencyCode.upper(), name_ar=data.baseCurrencyNameAr, name_en=data.baseCurrencyNameEn,
        symbol=data.baseCurrencySymbol, country="", flag="", decimal_places=2, is_active=True, last_updated=now
    )
    db.add(currency)
    db.flush()

    vault = Vault(
        id="v_main", name="الخزنة الرئيسية", type="main", branch=branch.id, manager=data.adminName,
        balances={currency.code: 0.0}, opening_balances={currency.code: 0.0}, is_active=True, last_movement=now
    )
    db.add(vault)
    db.flush()

    seed_roles(db)  # idempotent — populates the 6 default roles if missing

    admin = User(
        id="u_admin", name=data.adminName, username=data.adminUsername.strip().lower(),
        password=hash_password(data.adminPassword), role="مدير النظام", branch=branch.id,
        allowed_vault_id=vault.id, is_active=True
    )
    db.add(admin)

    for key, val in {
        "companyName": data.companyName,
        "address": data.address,
        "phone": data.phone,
        "defaultCurrency": currency.code,
        "logoUrl": "",
        "primaryColor": "#1E40AF",
        "amlThresholdLYD": 20000.0,
        "sessionTimeout": 30,
        "enableMFA": False,
    }.items():
        db.add(SystemSetting(key=key, value={"val": val}))

    create_audit_log(
        db, action=AuditAction.CREATE, entity_type="Setup", entity_id="initial",
        description=f"تم إعداد النظام لأول مرة بواسطة {data.adminName} — الشركة: {data.companyName}",
        username=admin.username
    )
    db.commit()

    return success_response(
        data={"branchId": branch.id, "currencyCode": currency.code, "vaultId": vault.id, "adminUsername": admin.username},
        message_ar="تم إعداد النظام بنجاح، يمكنك الآن تسجيل الدخول"
    )
