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
    "telegramEnabled": False,
    "telegramBotToken": "",
    "telegramManagerChatId": "",
    "telegramWebhookSecret": "",
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
    ("users", "mfa_enabled", "BOOLEAN DEFAULT FALSE"),
    ("backups", "file_path", "VARCHAR(500)"),
    ("customers", "bank_name", "VARCHAR(150)"),
    ("customers", "bank_account_number", "VARCHAR(100)"),
    ("customer_documents", "stored_path", "VARCHAR(300)"),
    ("asset_documents", "stored_path", "VARCHAR(300)"),
    ("vehicles", "warehouse_id", "VARCHAR(50)"),
    ("vehicles", "barcode", "VARCHAR(100)"),
    ("customers", "passport_number", "VARCHAR(100)"),
    ("customer_account_entries", "other_source", "VARCHAR(200)"),
    ("fixed_assets", "color", "VARCHAR(50)"),
    ("fixed_assets", "car_model", "VARCHAR(50)"),
    ("fixed_assets", "vin", "VARCHAR(100)"),
    ("fixed_assets", "make_year", "INTEGER"),
]


def migrate_customer_account_entries_nullable_vault(engine: Engine) -> None:
    """customer_account_entries.vault_id/vault_name were NOT NULL from day one, but a
    customer deposit/withdrawal can now be funded from a bank account instead of a vault
    drawer. SQLite can't relax a NOT NULL constraint with ALTER TABLE, so the table is
    rebuilt (SQLite's own documented pattern for this) the first time the old schema is
    seen, then left alone on every later boot."""
    inspector = inspect(engine)
    if "customer_account_entries" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("customer_account_entries")}
    if "bank_account_id" in columns:
        return  # already migrated

    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS customer_account_entries_new"))
        conn.execute(text("""
            CREATE TABLE customer_account_entries_new (
                id VARCHAR(50) PRIMARY KEY,
                type VARCHAR(20) NOT NULL,
                customer_id VARCHAR(50) NOT NULL REFERENCES customers(id),
                customer_name VARCHAR(150) NOT NULL,
                vault_id VARCHAR(50) REFERENCES vaults(id),
                vault_name VARCHAR(100),
                bank_account_id VARCHAR(50) REFERENCES bank_accounts(id),
                bank_account_name VARCHAR(150),
                currency VARCHAR(10) REFERENCES currencies(code),
                amount FLOAT NOT NULL,
                balance_before FLOAT NOT NULL,
                balance_after FLOAT NOT NULL,
                notes TEXT,
                user VARCHAR(100) NOT NULL,
                shift_id VARCHAR(50) REFERENCES shifts(id),
                timestamp VARCHAR(50) NOT NULL
            )
        """))
        conn.execute(text("""
            INSERT INTO customer_account_entries_new
                (id, type, customer_id, customer_name, vault_id, vault_name, currency, amount, balance_before, balance_after, notes, user, shift_id, timestamp)
            SELECT id, type, customer_id, customer_name, vault_id, vault_name, currency, amount, balance_before, balance_after, notes, user, shift_id, timestamp
            FROM customer_account_entries
        """))
        conn.execute(text("DROP TABLE customer_account_entries"))
        conn.execute(text("ALTER TABLE customer_account_entries_new RENAME TO customer_account_entries"))
    print("[migrations] Rebuilt customer_account_entries with nullable vault + new bank_account columns")


def migrate_customer_documents_nullable_customer(engine: Engine) -> None:
    """customer_documents.customer_id/customer_name were NOT NULL from day one, but a
    document can now be uploaded before it's linked to an actual customer record (and
    connected later). Same SQLite table-rebuild pattern as the function above."""
    inspector = inspect(engine)
    if "customer_documents" not in inspector.get_table_names():
        return
    columns = {c["name"]: c for c in inspector.get_columns("customer_documents")}
    if columns.get("customer_id", {}).get("nullable", True):
        return  # already migrated (or a fresh table create_all() already made nullable)

    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS customer_documents_new"))
        conn.execute(text("""
            CREATE TABLE customer_documents_new (
                id VARCHAR(50) PRIMARY KEY,
                customer_id VARCHAR(50) REFERENCES customers(id),
                customer_name VARCHAR(150),
                document_type VARCHAR(100) NOT NULL,
                file_name VARCHAR(200) NOT NULL,
                expiry_date VARCHAR(50),
                status VARCHAR(50),
                notes TEXT,
                stored_path VARCHAR(300)
            )
        """))
        conn.execute(text("""
            INSERT INTO customer_documents_new
                (id, customer_id, customer_name, document_type, file_name, expiry_date, status, notes, stored_path)
            SELECT id, customer_id, customer_name, document_type, file_name, expiry_date, status, notes, stored_path
            FROM customer_documents
        """))
        conn.execute(text("DROP TABLE customer_documents"))
        conn.execute(text("ALTER TABLE customer_documents_new RENAME TO customer_documents"))
    print("[migrations] Rebuilt customer_documents with nullable customer_id/customer_name")


def run_startup_migrations(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    # Simple ADD COLUMN migrations must run before the table-rebuild migrations below:
    # a rebuild copies every column (including ones only introduced via NEW_COLUMNS,
    # e.g. customer_documents.stored_path) from the old table into the new one, so on
    # a database that never got that column yet, the copy fails with "no such column"
    # unless it's added first.
    with engine.begin() as conn:
        for table, column, definition in NEW_COLUMNS:
            if table not in existing_tables:
                continue  # brand-new table — create_all() already handles it
            existing_columns = {c["name"] for c in inspector.get_columns(table)}
            if column in existing_columns:
                continue
            conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {definition}'))
            print(f"[migrations] Added column {table}.{column}")

    migrate_customer_account_entries_nullable_vault(engine)
    migrate_customer_documents_nullable_customer(engine)


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
