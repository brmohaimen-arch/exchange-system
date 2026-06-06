from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select
from .models import NotificationType
from .notifications import create_notification, notification_exists

def run_notification_checks(db: Session):
    today = datetime.utcnow()
    soon = today + timedelta(days=7)

    check_pending_transfers(db)
    check_unclosed_cashier_boxes(db)
    check_overdue_debts(db, today)
    check_upcoming_asset_documents(db, soon)

    db.commit()

def check_pending_transfers(db: Session):
    pending_transfers = []

    for transfer in pending_transfers:
        if not notification_exists(db, entity_type="Transfer", entity_id=transfer.id, title="تحويل بانتظار الموافقة"):
            create_notification(
                db,
                title="تحويل بانتظار الموافقة",
                message=f"يوجد تحويل رقم {transfer.id} بانتظار الموافقة",
                type=NotificationType.WARNING,
                role_name="مدير الخزنة",
                entity_type="Transfer",
                entity_id=transfer.id,
            )

def check_unclosed_cashier_boxes(db: Session):
    open_sessions = []

    for session in open_sessions:
        if not notification_exists(db, entity_type="CashierBoxSession", entity_id=session.id, title="صندوق صراف غير مقفل"):
            create_notification(
                db,
                title="صندوق صراف غير مقفل",
                message=f"صندوق الصراف {session.id} لا يزال مفتوحاً ويحتاج إقفال",
                type=NotificationType.DANGER,
                role_name="مدير فرع",
                branch_id=session.branch_id,
                entity_type="CashierBoxSession",
                entity_id=session.id,
            )

def check_overdue_debts(db: Session, today: datetime):
    overdue_debts = []

    for debt in overdue_debts:
        if not notification_exists(db, entity_type="Debt", entity_id=debt.id, title="دين متأخر"):
            create_notification(
                db,
                title="دين متأخر",
                message=f"يوجد دين متأخر على العميل رقم {debt.customer_id}",
                type=NotificationType.DANGER,
                role_name="محاسب",
                branch_id=debt.branch_id,
                entity_type="Debt",
                entity_id=debt.id,
                due_date=debt.due_date,
            )

def check_upcoming_asset_documents(db: Session, soon: datetime):
    expiring_documents = []

    for doc in expiring_documents:
        if not notification_exists(db, entity_type="AssetDocument", entity_id=doc.id, title="مستند أصل سينتهي قريباً"):
            create_notification(
                db,
                title="مستند أصل سينتهي قريباً",
                message=f"المستند {doc.document_type} سينتهي بتاريخ {doc.expiry_date}",
                type=NotificationType.WARNING,
                role_name="مدير النظام",
                entity_type="AssetDocument",
                entity_id=doc.id,
                due_date=doc.expiry_date,
            )
