"""
WhatsApp inbound webhook — the "ask it a question" half of the assistant.

A manager can text the business number a short command ("ملخص اليوم",
"التنبيهات", "الموافقات", "الأرصدة") and get a reply built from live data.
Because the manager messaged first, the reply falls inside Meta's free
24h customer-service window — no template, no per-message cost.

The other half — proactive alerts (compliance flags, shift discrepancies,
a scheduled end-of-day summary) — is push-only and lives in
whatsapp_gateway.send_manager_alert, called from business.py, operations.py,
and scheduler.py. Those are business-initiated and always billed, since
nobody messaged first.

Only numbers listed in the whatsappManagerPhone setting get a reply; every
other sender is silently ignored so the assistant can never leak business
data to a stranger who finds the number. If that setting is empty, nothing
is configured yet, so nobody is authorized — safe by default.
"""

import hashlib
import hmac
import json
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Transaction, ApprovalRequest, ComplianceFlag, Notification, NotificationStatus, Vault, User
)
from ..auth_deps import require_permission
from ..core.responses import success_response
from ..core.errors import APIError
from ..whatsapp_gateway import send_whatsapp, send_manager_alert, get_setting

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp Assistant"])


@router.post("/test")
def send_test_message(actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    """Lets the settings page confirm the WhatsApp credentials actually work,
    without waiting for a real alert to fire."""
    if not get_setting(db, "whatsappManagerPhone", ""):
        raise APIError(code="NO_MANAGER_PHONE", message_ar="لم يتم تحديد رقم هاتف المدير في الإعدادات", message_en="No manager phone number configured", status_code=400)
    result = send_manager_alert(db, f"✅ رسالة اختبار من نظام الصرافة — إذا وصلتك هذه الرسالة فالإعداد يعمل بنجاح. ({actor.name})")
    if not result.get("sent"):
        raise APIError(code="WHATSAPP_SEND_FAILED", message_ar=f"تعذر إرسال الرسالة: {result.get('reason')}", message_en=f"Failed to send: {result.get('reason')}", status_code=400)
    return success_response(message_ar="تم إرسال رسالة الاختبار بنجاح")


@router.get("/webhook")
def verify_webhook(request: Request, db: Session = Depends(get_db)):
    """Meta's one-time handshake when you register the webhook URL in the
    Meta App dashboard: it GETs this with a challenge and expects it echoed
    back verbatim, but only if our verify token matches theirs."""
    params = request.query_params
    expected = get_setting(db, "whatsappVerifyToken", "")
    if params.get("hub.mode") == "subscribe" and expected and params.get("hub.verify_token") == expected:
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    return Response(status_code=403)


def _verify_signature(body: bytes, signature_header: str | None, app_secret: str) -> bool:
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header.split("=", 1)[1])


def _authorized_numbers(db: Session) -> set[str]:
    raw = get_setting(db, "whatsappManagerPhone", "") or ""
    return {n.strip().lstrip("+") for n in raw.split(",") if n.strip()}


def _build_reply(db: Session, text: str) -> str:
    t = text.strip().lower()
    today = datetime.utcnow().strftime("%Y-%m-%d")

    if any(k in t for k in ["ملخص", "اليوم", "today", "summary"]):
        txs = db.scalars(select(Transaction).where(Transaction.timestamp.like(f"{today}%"))).all()
        profit = sum(tx.expected_profit or 0.0 for tx in txs)
        pending_approvals = db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.status == "pending")) or 0
        open_flags = db.scalar(select(func.count()).select_from(ComplianceFlag).where(ComplianceFlag.status == "pending")) or 0
        return (
            f"📊 ملخص اليوم ({today})\n"
            f"عدد العمليات: {len(txs)}\n"
            f"الأرباح المتوقعة: {profit:.2f} د.ل\n"
            f"موافقات معلقة: {pending_approvals}\n"
            f"عمليات تستوجب المراجعة: {open_flags}"
        )

    if any(k in t for k in ["تنبيه", "alert"]):
        unread = db.scalars(
            select(Notification).where(Notification.status == NotificationStatus.UNREAD).order_by(Notification.created_at.desc()).limit(5)
        ).all()
        if not unread:
            return "لا توجد تنبيهات غير مقروءة حالياً ✅"
        lines = [f"🔔 آخر {len(unread)} تنبيهات:"]
        lines += [f"- {n.title}: {n.message}" for n in unread]
        return "\n".join(lines)

    if any(k in t for k in ["موافق", "approval"]):
        pending = db.scalars(
            select(ApprovalRequest).where(ApprovalRequest.status == "pending").order_by(ApprovalRequest.timestamp.desc()).limit(5)
        ).all()
        if not pending:
            return "لا توجد طلبات موافقة معلقة حالياً ✅"
        lines = [f"📝 طلبات الموافقة المعلقة ({len(pending)}):"]
        lines += [f"- {a.title} ({a.amount} {a.currency or ''})" for a in pending]
        return "\n".join(lines)

    if any(k in t for k in ["رصيد", "خزن", "balance", "vault"]):
        vaults = db.scalars(select(Vault).where(Vault.is_active == True)).all()
        lines = ["💰 أرصدة الخزنات:"]
        for v in vaults:
            bal_str = " / ".join(f"{amt:,.0f} {ccy}" for ccy, amt in v.balances.items()) or "—"
            lines.append(f"- {v.name}: {bal_str}")
        return "\n".join(lines)

    return (
        "مرحباً 👋 يمكنك سؤالي عن:\n"
        "- \"ملخص اليوم\"\n"
        "- \"التنبيهات\"\n"
        "- \"الموافقات\"\n"
        "- \"الأرصدة\""
    )


@router.post("/webhook")
async def receive_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()

    app_secret = get_setting(db, "whatsappAppSecret", "")
    if app_secret and not _verify_signature(body, request.headers.get("x-hub-signature-256"), app_secret):
        return Response(status_code=403)

    try:
        payload = json.loads(body.decode("utf-8"))
        messages = payload["entry"][0]["changes"][0]["value"].get("messages", [])
    except (KeyError, IndexError, ValueError):
        messages = []

    authorized = _authorized_numbers(db)
    for msg in messages:
        sender = (msg.get("from") or "").lstrip("+")
        text_body = (msg.get("text") or {}).get("body", "")
        if not text_body or not authorized or sender not in authorized:
            continue  # unrecognized sender or non-text message — ignored, not answered
        send_whatsapp(db, sender, _build_reply(db, text_body))

    # Meta requires a 200 response regardless of what we did with the payload,
    # or it will retry delivery and eventually disable the webhook.
    return Response(status_code=200)
