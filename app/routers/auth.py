from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..database import get_db
from ..models import User, Role, AuditAction, LoginLog
from ..tracking import create_audit_log
from ..core.responses import success_response, error_response
from ..core.errors import APIError
from ..auth_deps import hash_password, verify_password, create_access_token, get_current_user, require_permission
from ..id_gen import new_id
from ..request_context import get_client_ip, get_client_device
from .. import mfa
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    username: str
    password: str

class MfaLoginVerifyRequest(BaseModel):
    userId: str
    code: str

class MfaEnableRequest(BaseModel):
    code: str

class MfaDisableRequest(BaseModel):
    password: str


def _record_login(db: Session, *, user: User | None, username_attempted: str, status: str):
    db.add(LoginLog(
        id=new_id("ll"),
        user=user.name if user else username_attempted,
        role=user.role if user else "-",
        branch=user.branch if user else "-",
        login_time=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        ip=get_client_ip(),
        device=get_client_device(),
        status=status,
    ))


def _issue_login(db: Session, user: User) -> dict:
    token = create_access_token(db, user)
    create_audit_log(
        db,
        action=AuditAction.LOGIN,
        entity_type="USER",
        entity_id=user.id,
        description=f"تسجيل دخول ناجح للمستخدم {user.username}",
        username=user.username,
        role_name=user.role,
        branch_id=None,
    )
    _record_login(db, user=user, username_attempted=user.username, status="successful")
    db.commit()
    return {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "branch": user.branch,
        "allowedVaultId": user.allowed_vault_id,
        "isActive": user.is_active,
        "token": token,
    }

class UserCreate(BaseModel):
    id: str
    name: str
    username: str
    password: str
    email: str | None = None
    phone: str | None = None
    role: str
    branch: str
    allowed_vault_id: str | None = None
    is_active: bool = True

@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(
        select(User).where(
            User.username == data.username,
            User.is_active == True
        )
    )
    if not user:
        _record_login(db, user=None, username_attempted=data.username, status="failed")
        db.commit()
        raise APIError(code="INVALID_CREDENTIALS", message_ar="اسم المستخدم غير صحيح أو الحساب غير نشط", message_en="Invalid username or inactive account", status_code=400)

    if not verify_password(data.password, user.password):
        _record_login(db, user=user, username_attempted=data.username, status="failed")
        db.commit()
        raise APIError(code="INVALID_PASSWORD", message_ar="كلمة المرور غير صحيحة", message_en="Invalid password", status_code=400)

    if user.mfa_enabled:
        # Password checks out but a second factor is still required — no token yet.
        # The frontend shows an OTP step and completes login via /auth/mfa/login-verify.
        return success_response(data={"mfaRequired": True, "userId": user.id})

    return success_response(data=_issue_login(db, user))


@router.post("/mfa/login-verify")
def mfa_login_verify(data: MfaLoginVerifyRequest, db: Session = Depends(get_db)):
    user = db.get(User, data.userId)
    if not user or not user.is_active or not user.mfa_enabled or not user.mfa_secret:
        raise APIError(code="INVALID_MFA_STATE", message_ar="طلب غير صالح", message_en="Invalid MFA verification request", status_code=400)

    if not mfa.verify_code(user.mfa_secret, data.code):
        _record_login(db, user=user, username_attempted=user.username, status="failed")
        db.commit()
        raise APIError(code="INVALID_MFA_CODE", message_ar="رمز التحقق غير صحيح", message_en="Invalid verification code", status_code=400)

    return success_response(data=_issue_login(db, user))


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    role = db.get(Role, current_user.role)
    return success_response(data={
        "id": current_user.id,
        "name": current_user.name,
        "username": current_user.username,
        "email": current_user.email,
        "phone": current_user.phone,
        "role": current_user.role,
        "branch": current_user.branch,
        "allowedVaultId": current_user.allowed_vault_id,
        "isActive": current_user.is_active,
        "mfaEnabled": current_user.mfa_enabled,
        "permissions": role.permissions if role else []
    })


# ----------------- MFA (TOTP) SELF-SERVICE ENROLLMENT -----------------
@router.post("/mfa/setup")
def mfa_setup(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Step 1 of enrollment: generate a secret (not yet active) and return it plus
    an otpauth:// URI so the user can add it to an authenticator app."""
    secret = mfa.generate_secret()
    current_user.mfa_secret = secret
    db.commit()
    return success_response(data={
        "secret": secret,
        "otpauthUrl": mfa.provisioning_uri(secret, current_user.username),
    })


@router.post("/mfa/enable")
def mfa_enable(data: MfaEnableRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Step 2: confirm the user actually set the secret up correctly by verifying
    a live code from their app before turning enforcement on."""
    if not current_user.mfa_secret:
        raise APIError(code="MFA_NOT_SETUP", message_ar="يجب إعداد رمز المصادقة أولاً", message_en="Run MFA setup first", status_code=400)
    if not mfa.verify_code(current_user.mfa_secret, data.code):
        raise APIError(code="INVALID_MFA_CODE", message_ar="رمز التحقق غير صحيح", message_en="Invalid verification code", status_code=400)

    current_user.mfa_enabled = True
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="USER", entity_id=current_user.id, description=f"قام {current_user.name} بتفعيل المصادقة الثنائية لحسابه", username=current_user.username)
    db.commit()
    return success_response(message_ar="تم تفعيل المصادقة الثنائية بنجاح")


@router.post("/mfa/disable")
def mfa_disable(data: MfaDisableRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.password, current_user.password):
        raise APIError(code="INVALID_PASSWORD", message_ar="كلمة المرور غير صحيحة", message_en="Invalid password", status_code=400)

    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="USER", entity_id=current_user.id, description=f"قام {current_user.name} بتعطيل المصادقة الثنائية لحسابه", username=current_user.username)
    db.commit()
    return success_response(message_ar="تم تعطيل المصادقة الثنائية")

@router.get("/users")
def get_users(current_user: User = Depends(require_permission("إدارة المستخدمين")), db: Session = Depends(get_db)):
    users = db.scalars(select(User)).all()
    users_list = []
    for u in users:
        users_list.append({
            "id": u.id,
            "name": u.name,
            "username": u.username,
            "email": u.email,
            "phone": u.phone,
            "role": u.role,
            "branch": u.branch,
            "allowedVaultId": u.allowed_vault_id,
            "isActive": u.is_active
        })
    return success_response(data=users_list)

@router.post("/users")
def create_user(data: UserCreate, actor: User = Depends(require_permission("إدارة المستخدمين")), db: Session = Depends(get_db)):
    # Check if username or ID already exists
    existing_user = db.get(User, data.id)
    if existing_user:
        raise APIError(code="USER_EXISTS", message_ar="رمز المستخدم موجود بالفعل", message_en="User ID already exists", status_code=400)

    existing_username = db.scalar(select(User).where(User.username == data.username))
    if existing_username:
        raise APIError(code="USERNAME_TAKEN", message_ar="اسم المستخدم محجوز بالفعل", message_en="Username already taken", status_code=400)

    user = User(
        id=data.id,
        name=data.name,
        username=data.username,
        password=hash_password(data.password),
        email=data.email,
        phone=data.phone,
        role=data.role,
        branch=data.branch,
        allowed_vault_id=data.allowed_vault_id,
        is_active=True
    )
    db.add(user)

    create_audit_log(
        db,
        action=AuditAction.CREATE,
        entity_type="USER",
        entity_id=user.id,
        description=f"تمت إضافة مستخدم جديد: {user.username}",
        username=actor.username
    )

    db.commit()
    return success_response(data={"id": user.id}, message_ar="تمت إضافة المستخدم بنجاح")

@router.put("/users/{user_id}")
def update_user(user_id: str, data: UserCreate, actor: User = Depends(require_permission("إدارة المستخدمين")), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise APIError(code="NOT_FOUND", message_ar="المستخدم غير موجود", message_en="User not found", status_code=404)

    user.name = data.name
    user.username = data.username
    if data.password:
        user.password = hash_password(data.password)
    user.email = data.email
    user.phone = data.phone
    user.role = data.role
    user.branch = data.branch
    user.allowed_vault_id = data.allowed_vault_id
    user.is_active = data.is_active

    create_audit_log(
        db,
        action=AuditAction.UPDATE,
        entity_type="USER",
        entity_id=user.id,
        description=f"تم تعديل بيانات المستخدم: {user.username}",
        username=actor.username
    )

    db.commit()
    return success_response(data={"id": user.id}, message_ar="تم تعديل بيانات المستخدم بنجاح")

@router.delete("/users/{user_id}")
def delete_user(user_id: str, actor: User = Depends(require_permission("إدارة المستخدمين")), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise APIError(code="NOT_FOUND", message_ar="المستخدم غير موجود", message_en="User not found", status_code=404)

    db.delete(user)

    create_audit_log(
        db,
        action=AuditAction.DELETE,
        entity_type="USER",
        entity_id=user_id,
        description=f"تم حذف المستخدم: {user_id}",
        username=actor.username
    )

    db.commit()
    return success_response(message_ar="تم حذف المستخدم بنجاح")

# ----------------- ROLES & PERMISSIONS -----------------
class RoleDTO(BaseModel):
    name: str
    permissions: list[str] = []

@router.get("/roles")
def list_roles(db: Session = Depends(get_db)):
    roles = db.scalars(select(Role)).all()
    return success_response(data=[{"name": r.name, "permissions": r.permissions, "isSystem": r.is_system} for r in roles])

@router.post("/roles")
def create_role(data: RoleDTO, actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    if db.get(Role, data.name):
        raise APIError(code="ROLE_EXISTS", message_ar="اسم الدور مستخدم بالفعل", message_en="Role name already exists", status_code=400)
    role = Role(name=data.name, permissions=data.permissions, is_system=False)
    db.add(role)
    create_audit_log(db, action=AuditAction.CREATE, entity_type="Role", entity_id=data.name, description=f"تمت إضافة دور جديد: {data.name}", username=actor.username)
    db.commit()
    return success_response(data={"name": role.name}, message_ar="تمت إضافة الدور بنجاح")

@router.put("/roles/{name}")
def update_role(name: str, data: RoleDTO, actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    role = db.get(Role, name)
    if not role:
        raise APIError(code="NOT_FOUND", message_ar="الدور غير موجود", message_en="Role not found", status_code=404)
    role.permissions = data.permissions
    create_audit_log(db, action=AuditAction.UPDATE, entity_type="Role", entity_id=name, description=f"تم تعديل صلاحيات الدور: {name}", username=actor.username)
    db.commit()
    return success_response(data={"name": role.name}, message_ar="تم تحديث صلاحيات الدور بنجاح")

@router.delete("/roles/{name}")
def delete_role(name: str, actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    role = db.get(Role, name)
    if not role:
        raise APIError(code="NOT_FOUND", message_ar="الدور غير موجود", message_en="Role not found", status_code=404)
    if role.is_system:
        raise APIError(code="SYSTEM_ROLE", message_ar="لا يمكن حذف أحد الأدوار الأساسية للنظام", message_en="Cannot delete a built-in system role", status_code=400)
    in_use = db.scalar(select(User).where(User.role == name))
    if in_use:
        raise APIError(code="ROLE_IN_USE", message_ar="لا يمكن حذف الدور لوجود مستخدمين مرتبطين به", message_en="Cannot delete a role still assigned to users", status_code=400)
    db.delete(role)
    create_audit_log(db, action=AuditAction.DELETE, entity_type="Role", entity_id=name, description=f"تم حذف الدور: {name}", username=actor.username)
    db.commit()
    return success_response(message_ar="تم حذف الدور بنجاح")
