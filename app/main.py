import io
import sys

# On Windows, the console's default encoding (cp1252) can't represent Arabic
# text or emoji — any print() containing either (audit descriptions, WhatsApp
# alert bodies, ...) would crash the request with UnicodeEncodeError. This has
# to happen before anything else prints, so it's the first thing in the entry
# module uvicorn imports.
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from .scheduler import start_scheduler, stop_scheduler
from .database import engine, Base, SessionLocal
from .seed import seed_database
from .migrations import run_startup_migrations, migrate_plaintext_passwords, seed_missing_system_settings, seed_trial_start_date
from .request_context import set_request_meta, extract_client_ip
from .routers import currencies, notifications, auth, operations, business, assets, accounting, reports, setup, compliance, whatsapp

# Create any brand-new tables, then patch any new columns onto pre-existing tables
Base.metadata.create_all(bind=engine)
run_startup_migrations(engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-seed database if empty
    db = SessionLocal()
    try:
        seed_database(db)
        migrate_plaintext_passwords(db)
        seed_missing_system_settings(db)
        seed_trial_start_date(db)
    finally:
        db.close()
    
    start_scheduler()
    yield
    stop_scheduler()

app = FastAPI(
    title="FX Exchange Office System",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def capture_request_meta(request: Request, call_next):
    ip = extract_client_ip(request.headers, request.client.host if request.client else None)
    device = request.headers.get("user-agent")
    set_request_meta(ip, device)
    return await call_next(request)

# Include routers under /api prefix
app.include_router(auth.router, prefix="/api")
app.include_router(currencies.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(operations.router, prefix="/api")
app.include_router(business.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(accounting.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(setup.router, prefix="/api")
app.include_router(compliance.router, prefix="/api")
app.include_router(whatsapp.router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to FX Exchange Office System"}
