from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .scheduler import start_scheduler, stop_scheduler
from .database import engine, Base, SessionLocal
from .seed import seed_database
from .routers import currencies, notifications, auth, operations, business, assets, accounting, reports

# Create database tables
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-seed database if empty
    db = SessionLocal()
    try:
        seed_database(db)
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

# Include routers under /api prefix
app.include_router(auth.router, prefix="/api")
app.include_router(currencies.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(operations.router, prefix="/api")
app.include_router(business.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(accounting.router, prefix="/api")
app.include_router(reports.router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to FX Exchange Office System"}
