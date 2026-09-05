from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from .database import SessionLocal
from .notification_checks import run_notification_checks

scheduler = BackgroundScheduler()

def scheduled_notification_job():
    db = SessionLocal()
    try:
        run_notification_checks(db)
    finally:
        db.close()


def scheduled_trial_check_job():
    """Disables every user account once the free trial has expired. The API
    itself already refuses every request once expired (auth_deps.get_current_user),
    so this doesn't gate access on its own — it's the literal 'disable all users'
    action, and it's what makes an expired trial visible in the Users list
    rather than just an invisible API-level block. Safe to re-run — setting an
    already-inactive user to inactive again is a no-op."""
    from .models import User
    from .trial import is_trial_expired
    from sqlalchemy import select

    db = SessionLocal()
    try:
        if not is_trial_expired(db):
            return
        users = db.scalars(select(User).where(User.is_active == True)).all()
        if not users:
            return
        for u in users:
            u.is_active = False
        db.commit()
        print(f"[trial] Trial expired — disabled {len(users)} active user account(s)")
    finally:
        db.close()


def scheduled_backup_job():
    """Runs every 30 minutes and performs a backup once the configured interval
    has elapsed since the last one — rather than trying to schedule an exact
    cron time, this just polls 'is it due yet?' against the stored settings,
    which self-heals if the server was down when a backup would have fired."""
    from .models import SystemSetting
    from .routers.accounting import perform_backup

    db = SessionLocal()
    try:
        enabled = db.get(SystemSetting, "autoBackupEnabled")
        if not enabled or not enabled.value.get("val"):
            return

        interval_setting = db.get(SystemSetting, "autoBackupIntervalHours")
        interval_hours = (interval_setting.value.get("val") if interval_setting else None) or 24

        last_setting = db.get(SystemSetting, "lastAutoBackupAt")
        last_at = last_setting.value.get("val") if last_setting else ""
        if last_at:
            try:
                elapsed_hours = (datetime.utcnow() - datetime.strptime(last_at, "%Y-%m-%d %H:%M")).total_seconds() / 3600
                if elapsed_hours < interval_hours:
                    return
            except ValueError:
                pass  # unparseable stored value — treat as never backed up, proceed

        retention_setting = db.get(SystemSetting, "autoBackupRetentionCount")
        retention = (retention_setting.value.get("val") if retention_setting else None) or 14

        perform_backup(db, actor_name="النظام (تلقائي)", backup_type="نسخة احتياطية تلقائية مجدولة", retention_count=retention)

        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
        if last_setting:
            last_setting.value = {"val": now_str}
        else:
            db.add(SystemSetting(key="lastAutoBackupAt", value={"val": now_str}))
        db.commit()
    finally:
        db.close()


def scheduled_whatsapp_summary_job():
    """Runs every 30 minutes and sends the manager an end-of-day WhatsApp
    summary once the configured hour has passed and today's summary hasn't
    gone out yet — same 'poll for due, self-heal' pattern as the backup job.
    This is a business-initiated message (nobody messaged first), so it goes
    out as a template if one is configured, matching what Meta requires."""
    from .models import Transaction, ApprovalRequest, ComplianceFlag, SystemSetting
    from .whatsapp_gateway import send_manager_alert
    from sqlalchemy import select, func

    db = SessionLocal()
    try:
        enabled = db.get(SystemSetting, "whatsappDailySummaryEnabled")
        if not enabled or not enabled.value.get("val"):
            return

        hour_setting = db.get(SystemSetting, "whatsappDailySummaryHour")
        target_hour = (hour_setting.value.get("val") if hour_setting else None)
        if target_hour is None:
            target_hour = 20

        # The configured hour is Libya local time (UTC+2 year-round, no DST) —
        # every other timestamp in this system is stored as naive UTC, so this
        # is the one place that has to bridge the two.
        local_now = datetime.utcnow() + timedelta(hours=2)
        if local_now.hour < target_hour:
            return

        today = datetime.utcnow().strftime("%Y-%m-%d")
        last_setting = db.get(SystemSetting, "lastWhatsappDailySummaryAt")
        last_at = last_setting.value.get("val") if last_setting else ""
        if last_at == today:
            return  # already sent today

        txs = db.scalars(select(Transaction).where(Transaction.timestamp.like(f"{today}%"))).all()
        profit = sum(tx.expected_profit or 0.0 for tx in txs)
        pending_approvals = db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.status == "pending")) or 0
        open_flags = db.scalar(select(func.count()).select_from(ComplianceFlag).where(ComplianceFlag.status == "pending")) or 0

        template_setting = db.get(SystemSetting, "whatsappTemplateName")
        template_name = (template_setting.value.get("val") if template_setting else None) or None

        message = (
            f"📊 ملخص نهاية اليوم ({today})\n"
            f"عدد العمليات: {len(txs)}\n"
            f"الأرباح المتوقعة: {profit:.2f} د.ل\n"
            f"موافقات معلقة: {pending_approvals}\n"
            f"عمليات تستوجب المراجعة: {open_flags}"
        )
        send_manager_alert(
            db, message,
            template_name=template_name,
            template_params=[today, str(len(txs)), f"{profit:.2f}", str(pending_approvals), str(open_flags)],
        )

        if last_setting:
            last_setting.value = {"val": today}
        else:
            db.add(SystemSetting(key="lastWhatsappDailySummaryAt", value={"val": today}))
        db.commit()
    finally:
        db.close()


def start_scheduler():
    scheduler.add_job(
        scheduled_notification_job,
        trigger="interval",
        minutes=15,
        id="notification_checks",
        replace_existing=True,
    )
    scheduler.add_job(
        scheduled_backup_job,
        trigger="interval",
        minutes=30,
        id="scheduled_backups",
        replace_existing=True,
    )
    scheduler.add_job(
        scheduled_whatsapp_summary_job,
        trigger="interval",
        minutes=30,
        id="whatsapp_daily_summary",
        replace_existing=True,
    )
    scheduler.add_job(
        scheduled_trial_check_job,
        trigger="interval",
        minutes=30,
        id="trial_check",
        replace_existing=True,
    )
    scheduler.start()

def stop_scheduler():
    scheduler.shutdown()
