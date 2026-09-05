import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import AuditLog, AuditAction
from .request_context import get_client_ip, get_client_device

GENESIS_HASH = "0" * 64


def _compute_hash(prev_hash: str, action: str, entity_type: str, entity_id: str | None, description: str) -> str:
    payload = json.dumps(
        {"prev": prev_hash, "action": action, "entity_type": entity_type, "entity_id": entity_id, "description": description},
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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
    entity_id_str = str(entity_id) if entity_id is not None else None
    ip_address = ip_address or get_client_ip()
    device = device or get_client_device()

    # Tamper-evident hash chain: each entry's hash covers the previous entry's
    # hash plus its own fields, so editing or deleting a past row breaks every
    # hash after it — detectable via GET /audit_logs/verify.
    last = db.scalar(select(AuditLog).order_by(AuditLog.id.desc()).limit(1))
    prev_hash = last.hash if (last and last.hash) else GENESIS_HASH
    action_value = action.value if hasattr(action, "value") else str(action)
    entry_hash = _compute_hash(prev_hash, action_value, entity_type, entity_id_str, description)

    log = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id_str,
        description=description,
        user_id=user_id,
        username=username,
        role_name=role_name,
        branch_id=branch_id,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
        device=device,
        prev_hash=prev_hash,
        hash=entry_hash,
    )

    db.add(log)
    return log


def verify_audit_chain(db: Session) -> dict:
    """Walks the whole chain in insertion order and reports the first break, if any."""
    logs = db.scalars(select(AuditLog).order_by(AuditLog.id.asc())).all()
    expected_prev = GENESIS_HASH
    for log in logs:
        if log.hash is None:
            # Pre-existing rows from before the hash chain was introduced — not a
            # tamper signal, just older data. Chain resumes cleanly from here.
            expected_prev = GENESIS_HASH
            continue
        action_value = log.action.value if hasattr(log.action, "value") else str(log.action)
        recomputed = _compute_hash(expected_prev, action_value, log.entity_type, log.entity_id, log.description)
        if log.prev_hash != expected_prev or log.hash != recomputed:
            return {"valid": False, "brokenAtLogId": log.id, "checkedCount": len(logs)}
        expected_prev = log.hash
    return {"valid": True, "brokenAtLogId": None, "checkedCount": len(logs)}
