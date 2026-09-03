from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..database import get_db
from ..models import User, Role, AuditAction
from ..tracking import create_audit_log
from ..core.responses import success_response, error_response
from ..core.errors import APIError
from ..auth_deps import hash_password, verify_password, create_access_token, get_current_user, require_permission
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    username: str
    password: str

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
        raise APIError(code="INVALID_CREDENTIALS", message_ar="اسم المستخدم غير صحيح أو الحساب غير نشط", message_en="Invalid username or inactive account", status_code=400)

    if not verify_password(data.password, user.password):
        raise APIError(code="INVALID_PASSWORD", message_ar="كلمة المرور غير صحيحة", message_en="Invalid password", status_code=400)

    token = create_access_token(db, user)

    create_audit_log(
        db,
        action=AuditAction.LOGIN,
        entity_type="USER",
        entity_id=user.id,
        description=f"تسجيل دخول ناجح للمستخدم {user.username}",
        username=user.username,
        role_name=user.role,
        branch_id=None
    )
    db.commit()

    # Prepare response user dictionary without password
    user_dict = {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "branch": user.branch,
        "allowedVaultId": user.allowed_vault_id,
        "isActive": user.is_active,
        "token": token
    }
    return success_response(data=user_dict)

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
        "permissions": role.permissions if role else []
    })

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
