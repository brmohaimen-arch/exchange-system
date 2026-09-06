"""Entry point cPanel's Passenger (Setup Python App) loads.

FastAPI is an ASGI app; this cPanel host runs Passenger in WSGI mode
(startup file passenger_wsgi.py, entry point `application`). a2wsgi bridges
the two so the same app/main.py code runs unchanged here as it does under
uvicorn elsewhere.
"""
from a2wsgi import ASGIMiddleware
from app.main import app as fastapi_app

application = ASGIMiddleware(fastapi_app)
