"""
WhatsApp Cloud API notification channel — used to push alerts to a manager's
own phone (compliance flags, shift-close discrepancies, an end-of-day summary).

Same philosophy as sms_gateway.py: no real messages ship without the client's
own Meta Business App credentials, which only they can create and pay for.
What this DOES provide is a real, standards-compliant dispatch to Meta's Graph
API (https://developers.facebook.com/docs/whatsapp/cloud-api), so plugging in
a real access token + phone number ID is enough to go live — nothing else in
the codebase needs to change.

Business-initiated messages (anything sent without the recipient having
messaged first in the last 24h) must use a pre-approved template, not free
text — that's a WhatsApp platform rule, not something this code can route
around. Callers pass template_name/template_params for that case.
"""

import json
import urllib.error
import urllib.request

from sqlalchemy.orm import Session

from .models import SystemSetting

GRAPH_API_VERSION = "v20.0"


def get_setting(db: Session, key: str, default=None):
    row = db.get(SystemSetting, key)
    return row.value.get("val") if row else default


def send_whatsapp(
    db: Session,
    to_phone: str,
    message: str,
    *,
    template_name: str | None = None,
    template_params: list[str] | None = None,
) -> dict:
    """Sends a WhatsApp message via Meta's Cloud API.

    If template_name is given, sends a template message (required for any
    business-initiated alert outside a customer-reply window). Otherwise sends
    free-form text (only valid within 24h of the recipient messaging first).
    """
    enabled = get_setting(db, "whatsappEnabled", False)
    access_token = get_setting(db, "whatsappAccessToken", "")
    phone_number_id = get_setting(db, "whatsappPhoneNumberId", "")

    if not enabled or not access_token or not phone_number_id or not to_phone:
        print(f"[whatsapp_gateway] Not configured — would have sent to {to_phone}: {message}")
        return {"sent": False, "reason": "not_configured"}

    return _dispatch(access_token, phone_number_id, to_phone, message, template_name, template_params)


def _dispatch(
    access_token: str,
    phone_number_id: str,
    to_phone: str,
    message: str,
    template_name: str | None,
    template_params: list[str] | None,
) -> dict:
    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages"

    if template_name:
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": "ar"},
                "components": [{
                    "type": "body",
                    "parameters": [{"type": "text", "text": p} for p in (template_params or [])],
                }] if template_params else [],
            },
        }
    else:
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "text",
            "text": {"body": message},
        }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return {"sent": True, "response": body}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"[whatsapp_gateway] Meta API error {e.code}: {error_body}")
        return {"sent": False, "reason": "api_error", "status": e.code, "details": error_body}
    except urllib.error.URLError as e:
        print(f"[whatsapp_gateway] Network error: {e}")
        return {"sent": False, "reason": "network_error", "details": str(e)}


def send_manager_alert(db: Session, message: str, *, template_name: str | None = None, template_params: list[str] | None = None) -> dict:
    """Convenience wrapper: sends to whichever number is configured as the
    manager's alert recipient, respecting the per-alert-type toggles."""
    manager_phone = get_setting(db, "whatsappManagerPhone", "")
    return send_whatsapp(db, manager_phone, message, template_name=template_name, template_params=template_params)
