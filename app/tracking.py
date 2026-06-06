from sqlalchemy.orm import Session
from .models import AuditLog, AuditAction

def create_audit_log(
    db: Session,
    *,
    action: AuditAction,
    entity_type: str,
    entity_id: str | int | None = None,
    description: str,
    user_id: int | None = None,
    username: str | None = None,
    role_name: str | None = None,
    branch_id: int | None = None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    ip_address: str | None = None,
    device: str | None = None,
):
    log = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        description=description,
        user_id=user_id,
        username=username,
        role_name=role_name,
        branch_id=branch_id,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
        device=device,
    )

    db.add(log)
    return log
