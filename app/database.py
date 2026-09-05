import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Local SQLite file by default — unchanged behavior for local dev. Set the
# DATABASE_URL env var to point at a hosted database instead, needed for any
# deployment with no persistent local disk between requests (e.g. Vercel's
# serverless functions). A Turso database (SQLite-compatible) is the
# lowest-friction option: sqlite+libsql://<db>-<org>.turso.io/?authToken=<token>
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
