from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select
from .models import NotificationType, Transfer, Shift, Debt, AssetDocument, CustomerDocument, Customer, SystemSetting
from .notifications import create_notification, notification_exists
from .sms_gateway import send_sms

# How long a shift can stay open before it's flagged as forgotten-not-closed
UNCLOSED_SHIFT_THRESHOLD_HOURS = 14

def run_notification_checks(db: Session):
    today = datetime.utcnow()
    soon = today + timedelta(days=7)

    check_pending_transfers(db)
    check_unclosed_cashier_boxes(db, today)
    check_overdue_debts(db, today)
    check_upcoming_asset_documents(db, soon)
    check_upcoming_customer_documents(db, soon)

    db.commit()

def check_pending_transfers(db: Session):
    pending_transfers = db.scalars(select(Transfer).where(Transfer.status == "pending")).all()

    for transfer in pending_transfers:
        if not notification_exists(db, entity_type="Transfer", entity_id=transfer.id, title="تحويل بانتظار الموافقة"):
            create_notification(
                db,
                title="تحويل بانتظار الموافقة",
                message=f"يوجد تحويل رقم {transfer.id} بمبلغ {transfer.amount} {transfer.currency} بانتظار الموافقة ({transfer.source_name} ➔ {transfer.dest_name})",
                type=NotificationType.WARNING,
                role_name="مدير الخزينة",
                entity_type="Transfer",
                entity_id=transfer.id,
            )

def check_unclosed_cashier_boxes(db: Session, today: datetime):
    open_shifts = db.scalars(select(Shift).where(Shift.status == "open")).all()

    for shift in open_shifts:
        try:
            started = datetime.strptime(shift.start_time, "%Y-%m-%d %H:%M")
        except (ValueError, TypeError):
            continue
        if today - started < timedelta(hours=UNCLOSED_SHIFT_THRESHOLD_HOURS):
            continue
        if not notification_exists(db, entity_type="Shift", entity_id=shift.id, title="صندوق صراف غير مقفل"):
            create_notification(
                db,
                title="صندوق صراف غير مقفل",
                message=f"وردية الصراف {shift.cashier} في {shift.vault_name} لا تزال مفتوحة منذ {shift.start_time} وتحتاج إقفال",
                type=NotificationType.DANGER,
                role_name="مدير فرع",
                entity_type="Shift",
                entity_id=shift.id,
            )

def check_overdue_debts(db: Session, today: datetime):
    today_str = today.strftime("%Y-%m-%d")
    overdue_debts = db.scalars(
        select(Debt).where(Debt.status != "paid", Debt.due_date < today_str)
    ).all()

    sms_setting = db.get(SystemSetting, "smsRemindersEnabled")
    sms_enabled = bool(sms_setting.value.get("val")) if sms_setting else False

    for debt in overdue_debts:
        already_notified = notification_exists(db, entity_type="Debt", entity_id=debt.id, title="دين متأخر")
        if not already_notified:
            create_notification(
                db,
                title="دين متأخر",
                message=f"دين العميل {debt.customer_name} بقيمة {debt.remaining_amount} {debt.currency} متأخر السداد (كان مستحقاً بتاريخ {debt.due_date})",
                type=NotificationType.DANGER,
                role_name="محاسب",
                entity_type="Debt",
                entity_id=debt.id,
            )
            if sms_enabled:
                customer = db.get(Customer, debt.customer_id)
                if customer and customer.phone:
                    send_sms(db, customer.phone, f"تذكير: لديكم دين متأخر السداد بقيمة {debt.remaining_amount} {debt.currency}")

def check_upcoming_asset_documents(db: Session, soon: datetime):
    soon_str = soon.strftime("%Y-%m-%d")
    expiring_documents = db.scalars(
        select(AssetDocument).where(AssetDocument.expiry_date.isnot(None), AssetDocument.expiry_date <= soon_str)
    ).all()

    for doc in expiring_documents:
        if not notification_exists(db, entity_type="AssetDocument", entity_id=doc.id, title="مستند أصل سينتهي قريباً"):
            create_notification(
                db,
                title="مستند أصل سينتهي قريباً",
                message=f"مستند ({doc.document_type}) الخاص بالأصل {doc.asset_name} سينتهي بتاريخ {doc.expiry_date}",
                type=NotificationType.WARNING,
                role_name="مدير النظام",
                entity_type="AssetDocument",
                entity_id=doc.id,
            )

def check_upcoming_customer_documents(db: Session, soon: datetime):
    soon_str = soon.strftime("%Y-%m-%d")
    expiring_documents = db.scalars(
        select(CustomerDocument).where(CustomerDocument.expiry_date.isnot(None), CustomerDocument.expiry_date <= soon_str)
    ).all()

    for doc in expiring_documents:
        if not notification_exists(db, entity_type="CustomerDocument", entity_id=doc.id, title="مستند عميل (KYC) سينتهي قريباً"):
            create_notification(
                db,
                title="مستند عميل (KYC) سينتهي قريباً",
                message=f"مستند ({doc.document_type}) الخاص بالعميل {doc.customer_name} سينتهي بتاريخ {doc.expiry_date}",
                type=NotificationType.WARNING,
                role_name="مدير فرع",
                entity_type="CustomerDocument",
                entity_id=doc.id,
            )
