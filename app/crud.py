from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from .tracking import create_audit_log
from .models import AuditAction

def create_record(
    db: Session,
    model,
    data: dict,
    *,
    username: str = "system",
    entity_name: str,
):
    obj = model(**data)
    db.add(obj)
    db.flush()

    create_audit_log(
        db,
        action=AuditAction.CREATE,
        entity_type=entity_name,
        entity_id=getattr(obj, "id", getattr(obj, "code", None)),
        description=f"تمت إضافة {entity_name}",
        username=username,
        new_value=data,
    )

    db.commit()
    db.refresh(obj)
    return obj

def get_record(db: Session, model, record_id):
    obj = db.get(model, record_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Record not found")
    return obj

def list_records(db: Session, model):
    return db.scalars(select(model)).all()

def update_record(
    db: Session,
    model,
    record_id,
    data: dict,
    *,
    username: str = "system",
    entity_name: str,
):
    obj = db.get(model, record_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Record not found")

    old_value = {
        key: getattr(obj, key)
        for key in data.keys()
        if hasattr(obj, key)
    }

    for key, value in data.items():
        if hasattr(obj, key):
            setattr(obj, key, value)

    create_audit_log(
        db,
        action=AuditAction.UPDATE,
        entity_type=entity_name,
        entity_id=record_id,
        description=f"تم تعديل {entity_name}",
        username=username,
        old_value=old_value,
        new_value=data,
    )

    db.commit()
    db.refresh(obj)
    return obj

def disable_record(
    db: Session,
    model,
    record_id,
    *,
    username: str = "system",
    entity_name: str,
):
    obj = db.get(model, record_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Record not found")

    if not hasattr(obj, "is_active"):
        raise HTTPException(status_code=400, detail="This record cannot be disabled")

    old_value = {"is_active": obj.is_active}
    obj.is_active = False

    create_audit_log(
        db,
        action=AuditAction.DISABLE,
        entity_type=entity_name,
        entity_id=record_id,
        description=f"تم تعطيل {entity_name}",
        username=username,
        old_value=old_value,
        new_value={"is_active": False},
    )

    db.commit()
    db.refresh(obj)
    return obj
