"""
Pluggable SMS/WhatsApp notification channel.

No real gateway integration ships here — sending a real SMS or WhatsApp message
needs an account with a provider (Twilio, a Libyan SMS aggregator, the WhatsApp
Business API, etc.) that only the client can set up and pay for; there is no
way to fabricate working credentials on their behalf. What this DOES provide is
the interface and a safe no-op/log adapter, so the rest of the app can call
send_sms() today. Wiring up a real provider later means implementing one branch
in _dispatch() for whichever gateway the client picks — nothing else in the
codebase needs to change.
"""

from sqlalchemy.orm import Session

from .models import SystemSetting


def _get_setting(db: Session, key: str, default=None):
    row = db.get(SystemSetting, key)
    return row.value.get("val") if row else default


def send_sms(db: Session, phone: str, message: str) -> dict:
    provider = _get_setting(db, "smsGatewayProvider", "none")
    api_key = _get_setting(db, "smsGatewayApiKey", "")

    if provider == "none" or not api_key:
        print(f"[sms_gateway] No gateway configured — would have sent to {phone}: {message}")
        return {"sent": False, "reason": "no_gateway_configured"}

    return _dispatch(provider, api_key, phone, message)


def _dispatch(provider: str, api_key: str, phone: str, message: str) -> dict:
    # Real provider integrations plug in here, e.g.:
    #   if provider == "twilio":
    #       return _send_via_twilio(api_key, phone, message)
    # None are implemented because each needs a real, paid, client-supplied account.
    print(f"[sms_gateway] Provider '{provider}' is configured but has no adapter implemented yet")
    return {"sent": False, "reason": "unimplemented_provider"}
