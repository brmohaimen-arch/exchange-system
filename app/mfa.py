"""
TOTP (RFC 6238) two-factor authentication — implemented against the stdlib only
(hmac/hashlib/base64) rather than adding a pyotp dependency, since the whole
algorithm is ~30 lines and this avoids an extra pip install for a security path.

Compatible with any standard authenticator app (Google Authenticator, Authy,
Microsoft Authenticator, ...): 6-digit codes, 30-second step, SHA1, base32 secret.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
import urllib.parse

STEP_SECONDS = 30
DIGITS = 6


def generate_secret() -> str:
    """160-bit random secret, base32-encoded (the format authenticator apps expect)."""
    return base64.b32encode(secrets.token_bytes(20)).decode("utf-8").rstrip("=")


def _hotp(secret: str, counter: int) -> str:
    # base32 needs its padding restored before decoding
    padded = secret + "=" * (-len(secret) % 8)
    key = base64.b32decode(padded.upper())
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** DIGITS)
    return str(code).zfill(DIGITS)


def current_code(secret: str) -> str:
    return _hotp(secret, int(time.time()) // STEP_SECONDS)


def verify_code(secret: str, code: str, window: int = 1) -> bool:
    """Accepts the current step and `window` steps before/after it, to tolerate
    minor clock drift between the server and the user's phone."""
    if not code or not code.isdigit():
        return False
    counter = int(time.time()) // STEP_SECONDS
    for offset in range(-window, window + 1):
        if hmac.compare_digest(_hotp(secret, counter + offset), code):
            return True
    return False


def provisioning_uri(secret: str, account_name: str, issuer: str = "FX Exchange Office") -> str:
    """otpauth:// URI an authenticator app can consume (via QR or manual entry)."""
    label = urllib.parse.quote(f"{issuer}:{account_name}")
    params = urllib.parse.urlencode({"secret": secret, "issuer": issuer, "digits": DIGITS, "period": STEP_SECONDS})
    return f"otpauth://totp/{label}?{params}"
