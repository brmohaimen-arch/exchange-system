import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Local SQLite file by default — unchanged behavior for local dev. Set the
# DATABASE_URL env var to point at a hosted database instead, needed for any
# deployment with no persistent local disk between requests (e.g. Vercel's
# serverless functions). Postgres (e.g. a free Neon or Supabase database) is
# the recommended option: postgresql+psycopg2://user:pass@host/dbname
#
# Turso/libSQL was tried first as a lower-friction SQLite-compatible option,
# but its Python driver (libsql-experimental) needs to compile a Rust/cmake
# native extension that fails to build both locally and on Vercel's build
# servers (missing bundled SQLite3MultipleCiphers sources) — a dead end, not
# just a local environment gap. Postgres via psycopg2-binary avoids this
# entirely since it ships prebuilt wheels for every common platform.
SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./sql_app.db")

# check_same_thread only applies to sqlite-family dialects (including libsql);
# other databases (Postgres, MySQL) don't accept it and would error on connect.
connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
