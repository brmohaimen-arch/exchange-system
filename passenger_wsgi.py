"""Entry point cPanel's Passenger (Setup Python App) loads.

FastAPI is an ASGI app; this cPanel host runs Passenger in WSGI mode
(startup file passenger_wsgi.py, entry point `application`). a2wsgi bridges
the two so the same app/main.py code runs unchanged here as it does under
uvicorn elsewhere.
"""
import re
import urllib.parse

from a2wsgi import ASGIMiddleware
from app.main import app as fastapi_app

_asgi_app = ASGIMiddleware(fastapi_app)

# Matches a percent-encoded byte (%XX) case-insensitively — used to detect a
# URL segment Passenger handed off still-encoded, rather than decoded.
_PERCENT_ENCODED_RE = re.compile(r"%[0-9A-Fa-f]{2}")


def application(environ, start_response):
    # Non-ASCII path segments (e.g. an Arabic branch/customer id) reach
    # FastAPI corrupted, via two different mechanisms depending on how the
    # request arrives:
    #
    # 1. A request proxied through the frontend's Node server (fetch()/undici)
    #    re-encodes the path with lowercase hex (%d9%85...), and Passenger
    #    hands that off to a2wsgi still percent-encoded rather than decoding
    #    it — so FastAPI sees the literal text "%d9%85..." as the path
    #    parameter instead of the real Arabic string.
    # 2. A request hitting this app directly has its URL properly decoded by
    #    Passenger first, but per the WSGI spec (PEP 3333), PATH_INFO/
    #    SCRIPT_NAME then arrive as the raw UTF-8 bytes re-interpreted one-to-
    #    one as Latin-1 text (a2wsgi builds the ASGI scope straight from
    #    those without reversing that).
    #
    # Recover the real UTF-8 text before handing off, whichever case applies.
    for key in ("PATH_INFO", "SCRIPT_NAME"):
        value = environ.get(key)
        if not value:
            continue
        if _PERCENT_ENCODED_RE.search(value):
            try:
                environ[key] = urllib.parse.unquote(value, encoding="utf-8", errors="strict")
                continue
            except (UnicodeDecodeError, ValueError):
                pass
        try:
            environ[key] = value.encode("latin-1").decode("utf-8")
        except (UnicodeDecodeError, UnicodeEncodeError):
            pass
    return _asgi_app(environ, start_response)
