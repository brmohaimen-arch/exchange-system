"""
Telegram Bot API notification channel — a second push channel for manager
alerts alongside WhatsApp (whatsapp_gateway.py). Telegram has no 24h
customer-service window and no per-message template requirement, so every
message here is sent as free text via a bot token — nothing else in the
codebase needs to change to add or drop this channel.

Same philosophy as whatsapp_gateway.py: nothing sends until the client's own
bot token + manager chat id are configured, so it's always safe to leave
telegram_gateway wired in even when a client never sets it up.
"""

import json
import urllib.error
import urllib.request

from sqlalchemy.orm import Session

from .models import SystemSetting

API_BASE = "https://api.telegram.org"


def get_setting(db: Session, key: str, default=None):
    row = db.get(SystemSetting, key)
    return row.value.get("val") if row else default


def send_telegram(db: Session, chat_id: str, message: str) -> dict:
    """Sends a plain-text Telegram message via the Bot API's sendMessage call."""
    enabled = get_setting(db, "telegramEnabled", False)
    bot_token = get_setting(db, "telegramBotToken", "")

    if not enabled or not bot_token or not chat_id:
        print(f"[telegram_gateway] Not configured — would have sent to {chat_id}: {message}")
        return {"sent": False, "reason": "not_configured"}

    url = f"{API_BASE}/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": message}
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return {"sent": True, "response": body}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"[telegram_gateway] Telegram API error {e.code}: {error_body}")
        return {"sent": False, "reason": "api_error", "status": e.code, "details": error_body}
    except urllib.error.URLError as e:
        print(f"[telegram_gateway] Network error: {e}")
        return {"sent": False, "reason": "network_error", "details": str(e)}


def send_manager_alert(db: Session, message: str) -> dict:
    """Convenience wrapper: sends to whichever chat id is configured as the
    manager's alert recipient."""
    manager_chat_id = get_setting(db, "telegramManagerChatId", "")
    return send_telegram(db, manager_chat_id, message)
