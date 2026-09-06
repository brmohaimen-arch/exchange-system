"""Cron entry point for the periodic notification check.

Run this every 15 minutes via cPanel Cron Jobs on shared hosting, instead of
relying on the in-process APScheduler in app/scheduler.py — Passenger can
recycle an idle app process on shared hosting, which would silently stop
that in-process timer. Pair with DISABLE_INPROCESS_SCHEDULER=1 in the app's
environment so the job doesn't also run in-process and double-send.
"""
from app.database import SessionLocal
from app.notification_checks import run_notification_checks


def main():
    db = SessionLocal()
    try:
        run_notification_checks(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
