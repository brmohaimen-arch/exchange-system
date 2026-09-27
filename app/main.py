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
from .migrations import run_startup_migrations, migrate_plaintext_passwords, seed_missing_system_settings, seed_trial_start_date, grant_new_permissions_to_admin, backfill_fleet_vehicle_auto_numbers, rename_fleet_status_active_to_display, rename_fleet_wallets, backfill_manual_bank_balances, seed_fleet_warehouses, fix_fleet_warehouse_split, seed_builtin_fleet_companies
from .request_context import set_request_meta, extract_client_ip
from .routers import currencies, notifications, auth, operations, business, assets, accounting, reports, setup, compliance, whatsapp, telegram, dollar_cards, currency_price_log, fleet, customer_balances, fleet_companies, branding

# Create any brand-new tables, then patch any new columns onto pre-existing tables
Base.metadata.create_all(bind=engine)
run_startup_migrations(engine)

# Plain module-level code, not the lifespan hook below — this must run under
# WSGI deployments too (e.g. cPanel Passenger via a2wsgi), which have no
# mechanism to ever trigger ASGI lifespan startup events.
_startup_db = SessionLocal()
try:
    seed_database(_startup_db)
    migrate_plaintext_passwords(_startup_db)
    seed_missing_system_settings(_startup_db)
    seed_trial_start_date(_startup_db)
    grant_new_permissions_to_admin(_startup_db)
    backfill_fleet_vehicle_auto_numbers(_startup_db)
    rename_fleet_status_active_to_display(_startup_db)
    rename_fleet_wallets(_startup_db)
    backfill_manual_bank_balances(_startup_db)
    seed_fleet_warehouses(_startup_db)
    fix_fleet_warehouse_split(_startup_db)
    seed_builtin_fleet_companies(_startup_db)
finally:
    _startup_db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
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
app.include_router(telegram.router, prefix="/api")
app.include_router(dollar_cards.router, prefix="/api")
app.include_router(currency_price_log.router, prefix="/api")
app.include_router(fleet.router, prefix="/api")
app.include_router(customer_balances.router, prefix="/api")
app.include_router(fleet_companies.router, prefix="/api")
app.include_router(branding.router, prefix="/api")
# Same router, second/third mount: paths under /api/imtiaz/... and /api/itqan/...
# are شركة الامتياز / اتقن المحركات (see fleet.get_company) — the 3 companies
# built into the code.
app.include_router(fleet.router, prefix="/api/imtiaz")
app.include_router(fleet.router, prefix="/api/itqan")

# Companies created from the sidebar ("+ إضافة شركة") instead of a code change —
# one router mount handles ALL of them, present and future: fleet.get_company()
# already reads the id straight out of the URL (request.url.path), so a bare
# path-parameter prefix routes any /api/co/<id>/... request through the same
# fleet.py logic without FastAPI needing that id declared on every endpoint
# function. Confirmed empirically (undeclared path params in a router prefix
# don't error at include_router time, request time, or OpenAPI-schema time).
# A brand-new company therefore works immediately on creation — no restart.
app.include_router(fleet.router, prefix="/api/co/{company_id}")

@app.get("/")
def read_root():
    return {"message": "Welcome to FX Exchange Office System"}
