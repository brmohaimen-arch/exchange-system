from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select
from .models import Notification, NotificationType, NotificationStatus

def notification_exists(
    db: Session,
    *,
    entity_type: str,
    entity_id: str | int,
    title: str,
):
    existing = db.scalar(
        select(Notification).where(
            Notification.entity_type == entity_type,
            Notification.entity_id == str(entity_id),
            Notification.title == title,
            Notification.status == NotificationStatus.UNREAD,
        )
    )
    return existing is not None

def create_notification(
    db: Session,
    *,
    title: str,
    message: str,
    type: NotificationType = NotificationType.INFO,
    user_id: int | None = None,
    role_name: str | None = None,
    branch_id: int | None = None,
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    due_date: datetime | None = None,
):
    notification = Notification(
        title=title,
        message=message,
        type=type,
        user_id=user_id,
        role_name=role_name,
        branch_id=branch_id,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        due_date=due_date,
    )

    db.add(notification)
    return notification

def notify_upcoming_deadline(
    db: Session,
    *,
    title: str,
    entity_type: str,
    entity_id: str | int,
    due_date: datetime,
    days_before: int,
    role_name: str | None = "مدير النظام",
):
    alert_date = due_date - timedelta(days=days_before)

    if datetime.utcnow() >= alert_date:
        if not notification_exists(db, entity_type=entity_type, entity_id=entity_id, title=title):
            create_notification(
                db,
                title=title,
                message=f"يوجد موعد قادم بتاريخ {due_date.date()}",
                type=NotificationType.WARNING,
                role_name=role_name,
                entity_type=entity_type,
                entity_id=entity_id,
                due_date=due_date,
            )
