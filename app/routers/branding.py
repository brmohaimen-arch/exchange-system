"""Lets the office replace "شركة واكب" and its icon with their own name/logo,
everywhere that name is shown: the landing page, the login screen, the
dashboard sidebar, and the letterhead printed on every PDF statement.

GET /branding and GET /branding/logo are deliberately public (no login) —
the login page and the landing page need the brand before anyone has signed
in. Nothing sensitive lives here: just a display name, a phone line, and an
image. Uploading/removing the logo, and changing the name, need the same
"إدارة الإعدادات" permission every other system setting does.
"""

import os
from datetime import datetime

from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..auth_deps import require_permission
from ..core.errors import APIError
from ..core.responses import success_response
from ..database import get_db
from ..models import AuditAction, SystemSetting, User
from ..tracking import create_audit_log

router = APIRouter(prefix="/branding", tags=["Branding"])

_ASSETS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
_DEFAULT_LOGO = os.path.join(_ASSETS_DIR, "logo.png")
_ALLOWED_LOGO_EXT = {".png", ".jpg", ".jpeg", ".svg"}
_MAX_LOGO_BYTES = 3 * 1024 * 1024
_DEFAULT_NAME = "شركة واكب"


def _setting(db: Session, key: str, default=""):
    row = db.get(SystemSetting, key)
    return row.value.get("val") if row else default


def _set_setting(db: Session, key: str, value) -> None:
    row = db.get(SystemSetting, key)
    if row:
        row.value = {"val": value}
    else:
        db.add(SystemSetting(key=key, value={"val": value}))


def custom_logo_path() -> str | None:
    """The uploaded logo file, if one exists — used here and by export_utils
    (PDF letterhead) so both draw from the exact same file."""
    for ext in _ALLOWED_LOGO_EXT:
        p = os.path.join(_ASSETS_DIR, f"logo_custom{ext}")
        if os.path.exists(p):
            return p
    return None


def brand_info(db: Session) -> dict:
    """(name, phone) — shared with export_utils for the PDF letterhead, so a
    rename here shows up on every export without touching those call sites."""
    return {
        "name": _setting(db, "companyName", _DEFAULT_NAME) or _DEFAULT_NAME,
        "phone": _setting(db, "phone", ""),
    }


@router.get("")
def get_branding(db: Session = Depends(get_db)):
    info = brand_info(db)
    return success_response(data={
        **info,
        "hasCustomLogo": custom_logo_path() is not None,
        "logoVersion": _setting(db, "brandLogoVersion", "0"),
    })


@router.get("/logo")
def get_branding_logo(db: Session = Depends(get_db)):
    path = custom_logo_path() or _DEFAULT_LOGO
    return FileResponse(path)


@router.post("/logo")
async def upload_branding_logo(file: UploadFile = File(...), actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_LOGO_EXT:
        raise APIError(code="INVALID_FILE_TYPE", message_ar="نوع الملف غير مدعوم. استخدم PNG أو JPG أو SVG", message_en="Unsupported file type", status_code=400)
    content = await file.read()
    if len(content) > _MAX_LOGO_BYTES:
        raise APIError(code="FILE_TOO_LARGE", message_ar="حجم الشعار أكبر من الحد المسموح (3 ميغابايت)", message_en="Logo exceeds the 3MB limit", status_code=400)

    os.makedirs(_ASSETS_DIR, exist_ok=True)
    for other_ext in _ALLOWED_LOGO_EXT:
        stale = os.path.join(_ASSETS_DIR, f"logo_custom{other_ext}")
        if os.path.exists(stale):
            os.remove(stale)
    with open(os.path.join(_ASSETS_DIR, f"logo_custom{ext}"), "wb") as f:
        f.write(content)

    version = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    _set_setting(db, "brandLogoVersion", version)
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="SystemSetting", entity_id="branding", description="تم تغيير شعار النظام", username=actor.username)
    db.commit()
    return success_response(data={"logoVersion": version}, message_ar="تم تحديث الشعار بنجاح")


@router.delete("/logo")
def remove_branding_logo(actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    for ext in _ALLOWED_LOGO_EXT:
        p = os.path.join(_ASSETS_DIR, f"logo_custom{ext}")
        if os.path.exists(p):
            os.remove(p)
    version = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    _set_setting(db, "brandLogoVersion", version)
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="SystemSetting", entity_id="branding", description="تمت إعادة الشعار الافتراضي", username=actor.username)
    db.commit()
    return success_response(data={"logoVersion": version}, message_ar="تمت إعادة الشعار الافتراضي")
