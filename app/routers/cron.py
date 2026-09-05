"""
Cron-triggered endpoints — the serverless equivalent of the in-process
APScheduler jobs in scheduler.py.

On a normal persistent host (uvicorn running continuously), those jobs poll
on a timer inside the running process. On Vercel there is no running process
between requests, so nothing can poll — instead, Vercel Cron hits these
endpoints on a schedule (see vercel.json) and each one does exactly what its
scheduler.py counterpart does for a single tick.

Protected by a shared secret (CRON_SECRET env var) so nothing else on the
internet can trigger a backup or a WhatsApp send by guessing the URL. Vercel
Cron sends this automatically as `Authorization: Bearer <CRON_SECRET>` when
the env var is set — see https://vercel.com/docs/cron-jobs/manage-cron-jobs.
"""

import os

from fastapi import APIRouter, Header
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..core.responses import success_response
from ..core.errors import APIError
from ..notification_checks import run_notification_checks

router = APIRouter(prefix="/cron", tags=["Cron (serverless scheduling)"])


def _require_cron_secret(authorization: str | None):
    secret = os.environ.get("CRON_SECRET", "")
    if not secret:
        # No secret configured — refuse rather than run unauthenticated
        # background jobs open to the whole internet.
        raise APIError(code="CRON_NOT_CONFIGURED", message_ar="لم يتم إعداد CRON_SECRET", message_en="CRON_SECRET is not configured", status_code=503)
    if authorization != f"Bearer {secret}":
        raise APIError(code="FORBIDDEN", message_ar="غير مصرح", message_en="Forbidden", status_code=403)


@router.get("/notifications")
def cron_notifications(authorization: str | None = Header(default=None)):
    _require_cron_secret(authorization)
    db: Session = SessionLocal()
    try:
        run_notification_checks(db)
    finally:
        db.close()
    return success_response(message_ar="تم فحص التنبيهات")


@router.get("/backup")
def cron_backup(authorization: str | None = Header(default=None)):
    _require_cron_secret(authorization)
    from ..scheduler import scheduled_backup_job
    scheduled_backup_job()
    return success_response(message_ar="تم فحص النسخ الاحتياطي التلقائي")


@router.get("/whatsapp-summary")
def cron_whatsapp_summary(authorization: str | None = Header(default=None)):
    _require_cron_secret(authorization)
    from ..scheduler import scheduled_whatsapp_summary_job
    scheduled_whatsapp_summary_job()
    return success_response(message_ar="تم فحص ملخص واتساب اليومي")


@router.get("/trial-check")
def cron_trial_check(authorization: str | None = Header(default=None)):
    _require_cron_secret(authorization)
    from ..scheduler import scheduled_trial_check_job
    scheduled_trial_check_job()
    return success_response(message_ar="تم فحص حالة الفترة التجريبية")
