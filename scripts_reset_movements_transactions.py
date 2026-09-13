"""
Run this ON THE SERVER, in the same directory as the production sql_app.db.

Unlike scripts_wipe_production_data.py (which empties EVERYTHING except
users/roles), this one only clears operational/history records — the ledger
of what happened — while leaving every vault, bank account, customer, branch,
currency, asset, and setting exactly as it is. Current balances (Vault.balances,
BankAccount.balance, Customer.balances) are stored directly on those rows and
are NOT touched by this script — they stay at whatever they are right now.

Tables that will be COMPLETELY EMPTIED:
  Core ledger:       transactions (buy/sell/exchange/deposit/withdraw),
                     movements, journal_entries, transfers, approvals,
                     customer_account_entries
  Debts & advances:  debts, debt_payments, advances, advance_payments
  Shifts & closings: shifts, daily_closings, daily_expenses
  Inventory:         inventory_counts
  Logs:              audit_logs, login_logs, notifications

Everything else (users, roles, branches, currencies, exchange rates, vaults,
customers, banks, bank accounts, bank deposits, fixed assets, vehicles, real
estate, maintenance records, documents, settings, backups, etc.) is left
untouched.

Usage (on the server, via SSH or cPanel terminal):
    cd /path/to/app          # wherever sql_app.db actually lives
    python3 scripts_reset_movements_transactions.py

It will:
  1. Make a timestamped backup copy of sql_app.db next to it.
  2. Print row counts for every table that is about to be emptied.
  3. Require you to type EXACTLY: RESET
  4. Delete all rows from those tables only, then VACUUM.

This is irreversible except by restoring the backup it makes in step 1.
"""
import shutil
import sqlite3
from datetime import datetime

DB_PATH = "sql_app.db"

# Deletion order matters even without FK enforcement turned on: child records
# (payments against a debt/advance) are cleared before their parent record.
WIPE_TABLES = [
    "debt_payments",
    "advance_payments",
    "debts",
    "advances",
    "customer_account_entries",
    "transactions",
    "movements",
    "journal_entries",
    "approvals",
    "transfers",
    "shifts",
    "daily_closings",
    "daily_expenses",
    "inventory_counts",
    "audit_logs",
    "login_logs",
    "notifications",
]

def main():
    backup_path = f"{DB_PATH}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    print(f"Backing up {DB_PATH} -> {backup_path}")
    shutil.copy2(DB_PATH, backup_path)
    print("Backup done.\n")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing_tables = {r[0] for r in cur.fetchall()}
    wipe_tables = [t for t in WIPE_TABLES if t in existing_tables]
    missing = [t for t in WIPE_TABLES if t not in existing_tables]
    if missing:
        print(f"(Note: these expected tables don't exist in this DB, skipping: {missing})\n")

    print("The following tables will be COMPLETELY EMPTIED:")
    total_rows = 0
    for t in wipe_tables:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        count = cur.fetchone()[0]
        total_rows += count
        print(f"  {t}: {count} rows")

    print("\nEverything else (vaults, customers, bank accounts, bank deposits, branches,")
    print("currencies, users, roles, assets, settings, etc.) is left untouched, including")
    print("current vault/bank/customer balances.")

    print(f"\nTotal rows to be permanently deleted: {total_rows}")
    print(f"Backup already saved at: {backup_path}")
    print("\nType RESET (all caps, exactly) to proceed, anything else to abort.")
    confirm = input("> ").strip()
    if confirm != "RESET":
        print("Aborted. Nothing was changed.")
        conn.close()
        return

    for t in wipe_tables:
        cur.execute(f"DELETE FROM {t}")
        print(f"Cleared {t}")

    conn.commit()
    cur.execute("VACUUM")
    conn.commit()
    conn.close()
    print("\nDone. Movement/transaction history is cleared; vaults, accounts, and their")
    print("current balances are untouched.")
    print(f"If anything looks wrong, restore from: {backup_path}")

if __name__ == "__main__":
    main()
