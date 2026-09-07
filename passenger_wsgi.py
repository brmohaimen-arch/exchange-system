"""Entry point cPanel's Passenger (Setup Python App) loads.

FastAPI is an ASGI app; this cPanel host runs Passenger in WSGI mode
(startup file passenger_wsgi.py, entry point `application`). a2wsgi bridges
the two so the same app/main.py code runs unchanged here as it does under
uvicorn elsewhere.
"""
from a2wsgi import ASGIMiddleware
from app.main import app as fastapi_app

_asgi_app = ASGIMiddleware(fastapi_app)


def application(environ, start_response):
    # Per the WSGI spec (PEP 3333), PATH_INFO/SCRIPT_NAME arrive as raw
    # request bytes re-interpreted one-to-one as Latin-1 text. a2wsgi builds
    # the ASGI scope straight from those without reversing that, so any
    # non-ASCII path segment (e.g. an Arabic branch/customer id) reaches
    # FastAPI corrupted. Recover the real UTF-8 text before handing off.
    for key in ("PATH_INFO", "SCRIPT_NAME"):
        value = environ.get(key)
        if value:
            try:
                environ[key] = value.encode("latin-1").decode("utf-8")
            except (UnicodeDecodeError, UnicodeEncodeError):
                pass
    return _asgi_app(environ, start_response)
