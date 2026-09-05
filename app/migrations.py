"""
Lightweight startup schema migrations.

SQLAlchemy's Base.metadata.create_all() only creates tables that don't exist yet —
it never alters a table that's already there. Since sql_app.db is a real file that
already has data in it, adding a new column to an existing model (e.g.
ExchangeRate.market_rate) needs an explicit ALTER TABLE or every read/write against
that column will fail against an existing database. This is a deliberately small,
explicit list rather than a fully generic schema-diff engine — safer to reason about
for a handful of columns than to get clever with introspecting every SQLAlchemy type.
"""

from datetime import datetime

from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from .auth_deps import hash_password, is_hashed
from .models import User, SystemSetting

# Mirrors seed.py's defaults. seed_database() only ever runs against a brand-new,
# empty database — a real deployment's existing DB never gets those rows when a
# new setting key is introduced later in development, so any endpoint reading it
# silently falls back to Python's default (or None) instead of the intended value.
# This came up for real: amlThresholdLYD being absent made AML flagging silently
# do nothing on this project's own dev database.
DEFAULT_SETTINGS = {
    "companyName": "منظومة المحلية للصرافة",
    "logoUrl": "",
    "primaryColor": "#1E40AF",
    "address": "شارع الميزران، طرابلس، ليبيا",
    "phone": "021-3601122",
    "taxNumber": "102-3929-1029",
    "defaultCurrency": "LYD",
    "allowRateEditDuringTx": True,
    "maxDiffWithoutApproval": 50.0,
    "enableMFA": False,
    "sessionTimeout": 30,
    "amlThresholdLYD": 20000.0,
    "smsGatewayProvider": "none",
    "smsGatewayApiKey": "",
    "smsRemindersEnabled": False,
    "autoBackupEnabled": False,
    "autoBackupIntervalHours": 24,
    "autoBackupRetentionCount": 14,
    "lastAutoBackupAt": "",
    "whatsappEnabled": False,
    "whatsappAccessToken": "",
    "whatsappPhoneNumberId": "",
    "whatsappManagerPhone": "",
    "whatsappTemplateName": "",
    "whatsappVerifyToken": "",
    "whatsappAppSecret": "",
    "whatsappAlertCompliance": True,
    "whatsappAlertShiftDiscrepancy": True,
    "whatsappDailySummaryEnabled": False,
    "whatsappDailySummaryHour": 20,
    "lastWhatsappDailySummaryAt": "",
    "trialDurationDays": 20,
}

# (table, column, sqlite_column_definition)
NEW_COLUMNS = [
    ("exchange_rates", "market_rate", "REAL"),
    ("shifts", "denomination_breakdown", "TEXT DEFAULT '{}'"),
    ("inventory_counts", "denomination_breakdown", "TEXT DEFAULT '{}'"),
    ("audit_logs", "prev_hash", "VARCHAR(64)"),
    ("audit_logs", "hash", "VARCHAR(64)"),
    ("shifts", "end_time", "VARCHAR(50)"),
    ("shifts", "requested_at", "VARCHAR(50)"),
    ("shifts", "approved_by", "VARCHAR(100)"),
    ("transactions", "shift_id", "VARCHAR(50)"),
    ("users", "mfa_secret", "VARCHAR(64)"),
    ("users", "mfa_enabled", "BOOLEAN DEFAULT 0"),
    ("backups", "file_path", "VARCHAR(500)"),
]


def run_startup_migrations(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table, column, definition in NEW_COLUMNS:
            if table not in existing_tables:
                continue  # brand-new table — create_all() already handles it
            existing_columns = {c["name"] for c in inspector.get_columns(table)}
            if column in existing_columns:
                continue
            conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {definition}'))
            print(f"[migrations] Added column {table}.{column}")


def migrate_plaintext_passwords(db: Session) -> None:
    """One-time upgrade path: any user row still storing a plaintext password
    (from before bcrypt hashing was introduced) gets hashed in place. Safe to run
    on every startup — already-hashed rows are left untouched."""
    users = db.scalars(select(User)).all()
    migrated = 0
    for user in users:
        if user.password and not is_hashed(user.password):
            user.password = hash_password(user.password)
            migrated += 1
    if migrated:
        db.commit()
        print(f"[migrations] Hashed {migrated} plaintext password(s)")


def seed_missing_system_settings(db: Session) -> None:
    """Insert any default setting key that doesn't already exist. Safe on every
    startup — existing values (including ones the user has changed) are never touched."""
    existing_keys = set(db.scalars(select(SystemSetting.key)).all())
    added = 0
    for key, default_value in DEFAULT_SETTINGS.items():
        if key not in existing_keys:
            db.add(SystemSetting(key=key, value={"val": default_value}))
            added += 1
    if added:
        db.commit()
        print(f"[migrations] Seeded {added} missing system setting(s)")


def seed_trial_start_date(db: Session) -> None:
    """Stamps the trial clock the very first time this deployment boots — covers
    both a brand-new /setup/initialize install and an existing database that's
    only now getting this feature. Never touched again after that, by design:
    only the operator pushing this value forward directly in the database can
    extend a trial, not anything reachable through the running app."""
    if db.get(SystemSetting, "trialStartDate") is not None:
        return
    db.add(SystemSetting(key="trialStartDate", value={"val": datetime.utcnow().strftime("%Y-%m-%d %H:%M")}))
    db.commit()
    print("[migrations] Stamped trial start date")
