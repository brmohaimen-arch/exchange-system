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
# URL segment Passenger handed off still percent-encoded, rather than decoded.
_PERCENT_ENCODED_RE = re.compile(r"%[0-9A-Fa-f]{2}")


def application(environ, start_response):
    # a2wsgi's own build_scope() unconditionally does
    # `environ["PATH_INFO"].encode("latin1").decode("utf8")` (and the same for
    # SCRIPT_NAME) before handing off to the ASGI app — per the WSGI spec
    # (PEP 3333), PATH_INFO/SCRIPT_NAME carry non-ASCII request bytes
    # re-interpreted one-to-one as Latin-1 text, and that's a2wsgi's way of
    # recovering the real UTF-8. That's correct when Passenger has already
    # percent-decoded the URL before building environ.
    #
    # But a request relayed through the frontend's Node proxy (fetch()/
    # undici re-encodes the path with lowercase hex, e.g. %d9%85 instead of a
    # browser's %D9%85) reaches here NOT decoded at all — Passenger hands off
    # the literal percent-encoded text as PATH_INFO. Handing that straight to
    # a2wsgi is a no-op (it's plain ASCII, its latin1/utf8 round-trip changes
    # nothing), so FastAPI would see "%d9%85..." as the literal path
    # parameter instead of the real Arabic string.
    #
    # Fix: percent-decode this case ourselves to recover the real text, then
    # re-disguise it back into the one-latin1-codepoint-per-UTF-8-byte form
    # a2wsgi expects as input — so its own round-trip still runs (uniformly,
    # for both cases) and correctly reconstructs the real text. Handing
    # a2wsgi the already-decoded real text directly crashes it instead
    # (UnicodeEncodeError: Arabic codepoints are all above 255, so encoding
    # them as latin-1 fails).
    for key in ("PATH_INFO", "SCRIPT_NAME"):
        value = environ.get(key)
        if value and _PERCENT_ENCODED_RE.search(value):
            try:
                real_text = urllib.parse.unquote(value, encoding="utf-8", errors="strict")
                environ[key] = real_text.encode("utf-8").decode("latin-1")
            except (UnicodeDecodeError, UnicodeEncodeError, ValueError):
                pass
    return _asgi_app(environ, start_response)
