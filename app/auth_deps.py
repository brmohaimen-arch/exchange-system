"""
Authentication & permission dependencies.

Two concerns live here on purpose: password hashing/JWT issuance (so every router
can import one place for "who is this?"), and permission checking against the
Role table (so every router can import one place for "are they allowed to?").
"""

import secrets
from datetime import datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from .core.errors import APIError
from .database import get_db
from .models import Role, SystemSetting, User

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 12

# bcrypt only looks at the first 72 bytes of the input — truncate defensively
# rather than let a long passphrase raise inside the library.
_BCRYPT_MAX_BYTES = 72


def hash_password(raw_password: str) -> str:
    truncated = raw_password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(truncated, bcrypt.gensalt()).decode("utf-8")


def verify_password(raw_password: str, stored_value: str) -> bool:
    if not is_hashed(stored_value):
        # Legacy plaintext row that hasn't been migrated yet (should only happen
        # for a split second between app startup and the migration pass running).
        return raw_password == stored_value
    try:
        truncated = raw_password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
        return bcrypt.checkpw(truncated, stored_value.encode("utf-8"))
    except ValueError:
        return False


def is_hashed(value: str) -> bool:
    return value.startswith(("$2a$", "$2b$", "$2y$"))


def get_jwt_secret(db: Session) -> str:
    """Every deployment gets its own random secret, generated once and persisted —
    avoids every client installation trusting a shared default secret."""
    setting = db.get(SystemSetting, "jwtSecretKey")
    if setting and setting.value.get("val"):
        return setting.value["val"]
    new_secret = secrets.token_hex(32)
    if setting:
        setting.value = {"val": new_secret}
    else:
        setting = SystemSetting(key="jwtSecretKey", value={"val": new_secret})
        db.add(setting)
    db.commit()
    return new_secret


def create_access_token(db: Session, user: User) -> str:
    secret = get_jwt_secret(db)
    payload = {
        "sub": user.id,
        "username": user.username,
        "role": user.role,
        "branch": user.branch,
        "allowedVaultId": user.allowed_vault_id,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise APIError(
            code="NOT_AUTHENTICATED",
            message_ar="يجب تسجيل الدخول للوصول لهذه الخدمة",
            message_en="Authentication required",
            status_code=401,
        )
    token = authorization.split(" ", 1)[1]
    secret = get_jwt_secret(db)
    try:
        payload = jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise APIError(
            code="TOKEN_EXPIRED",
            message_ar="انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مجددا",
            message_en="Session expired",
            status_code=401,
        )
    except jwt.InvalidTokenError:
        raise APIError(
            code="INVALID_TOKEN",
            message_ar="جلسة غير صالحة",
            message_en="Invalid session",
            status_code=401,
        )

    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise APIError(
            code="USER_INACTIVE",
            message_ar="المستخدم غير موجود أو غير نشط",
            message_en="User not found or inactive",
            status_code=401,
        )
    return user


def require_permission(permission: str):
    """FastAPI dependency factory: require_permission('إدارة المستخدمين') gates a route
    to users whose Role includes that permission string. The permission vocabulary is
    shared with the frontend's ALL_PERMISSIONS list (src/config/permissions.ts) by
    convention — same Arabic strings on both sides."""

    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        role = db.get(Role, current_user.role)
        permissions = role.permissions if role else []
        if permission not in permissions:
            raise APIError(
                code="FORBIDDEN",
                message_ar=f"لا تملك صلاحية تنفيذ هذا الإجراء: {permission}",
                message_en=f"Missing required permission: {permission}",
                status_code=403,
            )
        return current_user

    return dependency


# A role holding either of these effectively operates across every branch — a system
# admin (إدارة الفروع) or a treasury manager moving cash between branches (إدارة الخزنات).
# Anyone else (branch manager, cashier, accountant, auditor) is confined to their own
# branch for the actions this guards. Doc requirement: "role-based AND branch-based
# access control" — this is the branch half of that.
COMPANY_WIDE_PERMISSIONS = ("إدارة الفروع", "إدارة الخزنات")


def is_company_wide(permissions: list[str]) -> bool:
    return any(p in permissions for p in COMPANY_WIDE_PERMISSIONS)


def check_branch_access(actor: User, db: Session, branch_id: str) -> None:
    """Raise 403 unless the actor's role is company-wide or the branch is their own."""
    role = db.get(Role, actor.role)
    permissions = role.permissions if role else []
    if is_company_wide(permissions):
        return
    if actor.branch != branch_id:
        raise APIError(
            code="FORBIDDEN_BRANCH",
            message_ar=f"لا تملك صلاحية الوصول لفرع غير فرعك ({actor.branch})",
            message_en="You do not have access to a branch other than your own",
            status_code=403,
        )
