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

def start_scheduler():
    scheduler.add_job(
        scheduled_notification_job,
        trigger="interval",
        minutes=15,
        id="notification_checks",
        replace_existing=True,
    )
    scheduler.start()

def stop_scheduler():
    scheduler.shutdown()
