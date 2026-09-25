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

import base64
import json
import mimetypes
import urllib.error
import urllib.request
import uuid

from sqlalchemy.orm import Session

from .models import SystemSetting

GRAPH_API_VERSION = "v20.0"


def get_setting(db: Session, key: str, default=None):
    row = db.get(SystemSetting, key)
    return row.value.get("val") if row else default


def _openwa_settings(db: Session) -> tuple[str, str, str] | None:
    """(base_url, api_key, session_id) when the OpenWA provider is selected and
    fully configured, else None."""
    if get_setting(db, "whatsappProvider", "cloud") != "openwa":
        return None
    base = (get_setting(db, "openwaBaseUrl", "") or "").strip().rstrip("/")
    key = (get_setting(db, "openwaApiKey", "") or "").strip()
    session = (get_setting(db, "openwaSessionId", "") or "").strip()
    if not (get_setting(db, "whatsappEnabled", False) and base and key and session):
        return None
    return base, key, session


def _chat_id(phone: str) -> str:
    """OpenWA addresses a person as <digits>@c.us — international format, no + or leading 00."""
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("00"):
        digits = digits[2:]
    return f"{digits}@c.us"


def _openwa_post(cfg: tuple[str, str, str], path: str, payload: dict) -> dict:
    base, key, session = cfg
    req = urllib.request.Request(
        f"{base}/api/sessions/{session}/messages/{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"X-API-Key": key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return {"sent": True, "response": json.loads(body) if body else {}}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"[whatsapp_gateway] OpenWA error {e.code}: {error_body}")
        return {"sent": False, "reason": "api_error", "status": e.code, "details": error_body}
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"[whatsapp_gateway] OpenWA network error: {e}")
        return {"sent": False, "reason": "network_error", "details": str(e)}


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
    if get_setting(db, "whatsappProvider", "cloud") == "openwa":
        cfg = _openwa_settings(db)
        if not cfg or not to_phone:
            print(f"[whatsapp_gateway] OpenWA not configured — would have sent to {to_phone}: {message}")
            return {"sent": False, "reason": "not_configured"}
        # Templates are a Meta Cloud API concept; OpenWA just sends the plain text.
        return _openwa_post(cfg, "send-text", {"chatId": _chat_id(to_phone), "text": message})

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


def _upload_media(access_token: str, phone_number_id: str, file_bytes: bytes, filename: str) -> dict:
    """Uploads a file to Meta's Media API so it can be attached to a document
    message — WhatsApp requires media to be uploaded first and referenced by
    the media id it returns, it can't be attached inline on the message itself."""
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    boundary = uuid.uuid4().hex
    parts = []
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"messaging_product\"\r\n\r\nwhatsapp\r\n".encode())
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"type\"\r\n\r\n{content_type}\r\n".encode())
    parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: {content_type}\r\n\r\n".encode()
        + file_bytes + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)

    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/media"
    req = urllib.request.Request(
        url, data=body,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return {"ok": True, **json.loads(resp.read().decode("utf-8"))}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"[whatsapp_gateway] Media upload error {e.code}: {error_body}")
        return {"ok": False, "reason": "api_error", "status": e.code, "details": error_body}
    except urllib.error.URLError as e:
        print(f"[whatsapp_gateway] Media upload network error: {e}")
        return {"ok": False, "reason": "network_error", "details": str(e)}


def send_whatsapp_document(db: Session, to_phone: str, file_bytes: bytes, filename: str, caption: str = "") -> dict:
    """Sends a document (e.g. a customer statement or transaction receipt PDF)
    as a WhatsApp attachment. Uploads the file to Meta's Media API first, then
    sends a document-type message referencing it — same not-configured no-op
    behavior as send_whatsapp when credentials aren't set up yet."""
    if get_setting(db, "whatsappProvider", "cloud") == "openwa":
        cfg = _openwa_settings(db)
        if not cfg or not to_phone:
            print(f"[whatsapp_gateway] OpenWA not configured — would have sent document '{filename}' to {to_phone}")
            return {"sent": False, "reason": "not_configured"}
        payload = {
            "chatId": _chat_id(to_phone),
            "base64": base64.b64encode(file_bytes).decode("ascii"),
            "mimetype": mimetypes.guess_type(filename)[0] or "application/pdf",
            "filename": filename,
        }
        if caption:
            payload["caption"] = caption[:1024]
        return _openwa_post(cfg, "send-document", payload)

    enabled = get_setting(db, "whatsappEnabled", False)
    access_token = get_setting(db, "whatsappAccessToken", "")
    phone_number_id = get_setting(db, "whatsappPhoneNumberId", "")

    if not enabled or not access_token or not phone_number_id or not to_phone:
        print(f"[whatsapp_gateway] Not configured — would have sent document '{filename}' to {to_phone}")
        return {"sent": False, "reason": "not_configured"}

    uploaded = _upload_media(access_token, phone_number_id, file_bytes, filename)
    if not uploaded.get("ok") or not uploaded.get("id"):
        return {"sent": False, "reason": uploaded.get("reason", "upload_failed"), "details": uploaded.get("details")}

    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "document",
        "document": {"id": uploaded["id"], "filename": filename, **({"caption": caption} if caption else {})},
    }
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
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
