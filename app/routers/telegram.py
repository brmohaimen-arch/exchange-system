"""
Telegram inbound webhook + outbound test — Telegram's counterpart to
whatsapp.py, added as a second manager-alert channel alongside WhatsApp
(nothing about the WhatsApp integration changes; the two run independently).

Telegram has no 24h template restriction and no manual dashboard step for
registering a webhook — Telegram's own Bot API does it with a single
setWebhook call, which /telegram/register-webhook makes on the operator's
behalf using the bot token already saved in settings.

Same "ask it a question" behavior as WhatsApp (build_reply in
assistant_replies.py is shared by both), gated the same way: only chat ids
listed in telegramManagerChatId get a reply.
"""

import json
import urllib.error
import urllib.request

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..auth_deps import require_permission
from ..core.responses import success_response
from ..core.errors import APIError
from ..assistant_replies import build_reply
from ..telegram_gateway import send_telegram, send_manager_alert, get_setting

router = APIRouter(prefix="/telegram", tags=["Telegram Assistant"])


@router.post("/test")
def send_test_message(actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    """Lets the settings page confirm the Telegram bot token + chat id actually
    work, without waiting for a real alert to fire."""
    if not get_setting(db, "telegramManagerChatId", ""):
        raise APIError(code="NO_MANAGER_CHAT", message_ar="لم يتم تحديد معرف محادثة المدير في الإعدادات", message_en="No manager chat id configured", status_code=400)
    result = send_manager_alert(db, f"✅ رسالة اختبار من نظام الصرافة — إذا وصلتك هذه الرسالة فالإعداد يعمل بنجاح. ({actor.name})")
    if not result.get("sent"):
        raise APIError(code="TELEGRAM_SEND_FAILED", message_ar=_friendly_send_error(result), message_en=f"Failed to send: {result.get('reason')}", status_code=400)
    return success_response(message_ar="تم إرسال رسالة الاختبار بنجاح")


def _friendly_send_error(result: dict) -> str:
    """Telegram's own `description` (e.g. "Bad Request: chat not found") is far
    more actionable than our internal reason code — surface it when we have it,
    since that's almost always exactly what the operator needs to fix."""
    reason = result.get("reason")
    if reason == "not_configured":
        return "الإعداد غير مكتمل — تحقق من تفعيل التنبيهات وBot Token ومعرف المحادثة"
    if reason == "network_error":
        return f"تعذر الاتصال بخوادم تيليجرام (قد تكون مشكلة شبكة مؤقتة) — حاول مرة أخرى. التفاصيل: {result.get('details')}"
    if reason == "api_error":
        details = result.get("details")
        try:
            desc = json.loads(details).get("description") if details else None
        except (ValueError, TypeError):
            desc = None
        if desc == "Bad Request: chat not found":
            return "لم يتم العثور على المحادثة — يجب على المدير مراسلة البوت أولاً (إرسال /start له) قبل أن يتمكن البوت من مراسلته"
        return f"رفض تيليجرام الطلب: {desc or details}"
    return f"تعذر إرسال الرسالة: {reason}"


@router.post("/register-webhook")
def register_webhook(request: Request, actor: User = Depends(require_permission("إدارة الإعدادات")), db: Session = Depends(get_db)):
    """One-click alternative to calling Telegram's setWebhook API by hand —
    points the bot at this server's own /telegram/webhook."""
    bot_token = get_setting(db, "telegramBotToken", "")
    if not bot_token:
        raise APIError(code="NO_BOT_TOKEN", message_ar="لم يتم تحديد Bot Token", message_en="No bot token configured", status_code=400)

    webhook_url = f"{str(request.base_url).rstrip('/')}/api/telegram/webhook"

    # Telegram refuses anything but a public HTTPS address — catch this before
    # even calling their API, since the resulting HTTPError body is otherwise
    # easy to misread as a bad token when the real problem is the URL.
    host = request.url.hostname or ""
    is_local_host = host in ("localhost", "127.0.0.1", "0.0.0.0") or host.endswith(".local")
    if webhook_url.startswith("http://") or is_local_host:
        raise APIError(
            code="URL_NOT_PUBLIC",
            message_ar=f"لا يمكن تسجيل هذا العنوان لدى تيليجرام لأنه غير متاح للعامة عبر HTTPS: {webhook_url} — يتطلب هذا نشر الخادم على نطاق عام (أو نفق مؤقت مثل ngrok) قبل تسجيل الويب هوك. تنبيهات المدير الصادرة (اختبار، امتثال، فروقات وردية، ملخص يومي) تعمل بدون هذه الخطوة.",
            message_en=f"Telegram cannot call back a non-public address: {webhook_url}. Deploy publicly (or use a tunnel like ngrok) before registering the webhook. Outbound manager alerts already work without this.",
            status_code=400,
        )

    secret = get_setting(db, "telegramWebhookSecret", "") or None

    payload = {"url": webhook_url}
    if secret:
        payload["secret_token"] = secret

    req = urllib.request.Request(
        f"https://api.telegram.org/bot{bot_token}/setWebhook",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode("utf-8")).get("description", str(e))
        except Exception:
            detail = str(e)
        raise APIError(code="TELEGRAM_API_ERROR", message_ar=f"رفض تيليجرام تسجيل الويب هوك: {detail}", message_en=f"Telegram rejected the webhook: {detail}", status_code=400)
    except urllib.error.URLError:
        raise APIError(code="NETWORK_ERROR", message_ar="تعذر الاتصال بخوادم تيليجرام", message_en="Could not reach Telegram", status_code=400)

    if not body.get("ok"):
        raise APIError(code="TELEGRAM_API_ERROR", message_ar=f"رفض تيليجرام تسجيل الويب هوك: {body.get('description')}", message_en=f"Telegram rejected the webhook: {body.get('description')}", status_code=400)

    return success_response(message_ar="تم تسجيل الويب هوك بنجاح", data={"url": webhook_url})


def _authorized_chat_ids(db: Session) -> set[str]:
    raw = get_setting(db, "telegramManagerChatId", "") or ""
    return {c.strip() for c in raw.split(",") if c.strip()}


@router.post("/webhook")
async def receive_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    expected_secret = get_setting(db, "telegramWebhookSecret", "")
    if expected_secret and x_telegram_bot_api_secret_token != expected_secret:
        return Response(status_code=403)

    try:
        payload = json.loads((await request.body()).decode("utf-8"))
        message = payload.get("message") or payload.get("edited_message") or {}
        chat_id = str(message["chat"]["id"])
        text_body = message.get("text", "")
    except (KeyError, ValueError):
        return Response(status_code=200)

    authorized = _authorized_chat_ids(db)
    if text_body and authorized and chat_id in authorized:
        send_telegram(db, chat_id, build_reply(db, text_body))

    # Telegram doesn't retry non-200 responses the way Meta does, but respond
    # 200 regardless so it never flags the webhook itself as failing.
    return Response(status_code=200)
