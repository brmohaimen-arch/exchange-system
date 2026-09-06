from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..database import get_db
from ..models import Notification, NotificationStatus, NotificationType
from ..core.responses import success_response
from ..core.errors import APIError

router = APIRouter(prefix="/notifications", tags=["Notifications"])

def notification_to_dict(n: Notification):
    # Map NotificationType DANGER to frontend 'error'
    n_type = "info"
    if n.type == NotificationType.WARNING:
        n_type = "warning"
    elif n.type == NotificationType.DANGER:
        n_type = "error"
    elif n.type == NotificationType.SUCCESS:
        n_type = "success"

    return {
        "id": str(n.id),
        "title": n.title,
        "message": n.message,
        "timestamp": n.created_at.strftime("%Y-%m-%d %H:%M:%S") if isinstance(n.created_at, datetime) else str(n.created_at),
        "isRead": n.status == NotificationStatus.READ,
        "role": n.role_name,
        "user": str(n.user_id) if n.user_id is not None else None,
        "type": n_type
    }

@router.get("")
def list_notifications(db: Session = Depends(get_db)):
    notifications = db.scalars(
        select(Notification).order_by(Notification.created_at.desc())
    ).all()
    return success_response(data=[notification_to_dict(n) for n in notifications])

@router.get("/unread")
def unread_notifications(db: Session = Depends(get_db)):
    notifications = db.scalars(
        select(Notification)
        .where(Notification.status == NotificationStatus.UNREAD)
        .order_by(Notification.created_at.desc())
    ).all()
    return success_response(data=[notification_to_dict(n) for n in notifications])

@router.patch("/read-all")
def mark_all_notifications_read(db: Session = Depends(get_db)):
    notifications = db.scalars(
        select(Notification).where(Notification.status == NotificationStatus.UNREAD)
    ).all()
    now = datetime.utcnow()
    for n in notifications:
        n.status = NotificationStatus.READ
        n.read_at = now
    db.commit()
    return success_response(message_ar=f"تم تحديد {len(notifications)} تنبيه كمقروء")

@router.patch("/{notification_id}/read")
def mark_notification_read(notification_id: int, db: Session = Depends(get_db)):
    notification = db.get(Notification, notification_id)
    if not notification:
        raise APIError(code="NOT_FOUND", message_ar="التنبيه غير موجود", message_en="Notification not found", status_code=404)
    notification.status = NotificationStatus.READ
    notification.read_at = datetime.utcnow()
    db.commit()
    return success_response(data=notification_to_dict(notification))

@router.patch("/{notification_id}/dismiss")
def dismiss_notification(notification_id: int, db: Session = Depends(get_db)):
    notification = db.get(Notification, notification_id)
    if not notification:
        raise APIError(code="NOT_FOUND", message_ar="التنبيه غير موجود", message_en="Notification not found", status_code=404)
    notification.status = NotificationStatus.DISMISSED
    db.commit()
    return success_response(data=notification_to_dict(notification))
