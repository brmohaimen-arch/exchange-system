"""
READ-ONLY check: does any cancelled (reversed / deleted) operation still show in a statement?

Run it on the server from the application folder (the one that holds sql_app.db):

    python scripts_check_statements.py              # summary + the first findings of each kind
    python scripts_check_statements.py --all        # every finding
    python scripts_check_statements.py --db /path/to/sql_app.db

It never writes: the database is opened read-only (SQLite mode=ro), and it uses the application's OWN
statement filters, so it checks what the statements really do rather than a copy of the rules.
Exit code 0 = clean, 1 = something is still showing, 2 = could not run.

What it looks for
  A. Customer deposits/withdrawals/transfers that are cancelled (their Transaction is reversed, their
     journal entry was reversed, or their movement was reversed) but are still visible in the customer
     statement.
  B. Vault / bank-account / customer-account movements that belong to a cancelled operation but pass the
     statement filter, i.e. would print on the statement.
  C. Approved transfers that were actually cancelled (reversed journal entry / reversed movements), which the
     statements still list as approved.
  D. Operations left half-cancelled: the journal entry was reversed from the accounting page but the
     operation itself (Transaction / Transfer) is still live, with no replacement entry. Their money was
     undone while they keep showing everywhere.
  E. Debts / advances marked cancelled that a customer statement would still list.
  F. The daily ledger (PDF / Excel "كشف الحركة اليومية") prints an "unrecorded manual adjustment" line: a balance
     that changed with no movement behind it. A cancellation or an edit must never cause one; what remains is a
     balance edited by hand on the banks page, or history from before counter-movements were recorded. Review each.
  G. The ledger's last balance differs from the account's own balance.
(Deleted debts, advances, fleet entries and vehicles are removed from the database, so they cannot show.)
"""
import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

parser = argparse.ArgumentParser(description="Read-only check for cancelled operations that still show in statements")
parser.add_argument("--db", default=str(HERE / "sql_app.db"), help="path to sql_app.db (default: next to this script)")
parser.add_argument("--all", action="store_true", help="print every finding, not just the first 15 of each kind")
args = parser.parse_args()

db_path = Path(args.db).resolve()
if not db_path.is_file():
    print(f"database not found: {db_path}\nRun this from the application folder, or pass --db /path/to/sql_app.db")
    sys.exit(2)

try:
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker

    from app.models import (Advance, BankAccount, Customer, CustomerAccountEntry, Debt, JournalEntry, Movement, Transaction, Transfer, Vault)
    from app.routers.business import (_entity_daily_ledger_rows, _not_reversed_movement, _reversed_customer_entry_ids, _reversed_journal_refs)
except Exception as exc:  # pragma: no cover
    print("could not load the application code:", repr(exc))
    sys.exit(2)

# read-only connection: even a bug here cannot change a single row
engine = create_engine(f"sqlite:///file:{db_path.as_posix()}?mode=ro&uri=true", connect_args={"check_same_thread": False})
db = sessionmaker(bind=engine, autoflush=False)()

LIMIT = None if args.all else 15
findings: dict[str, list[str]] = defaultdict(list)


def add(kind: str, line: str):
    findings[kind].append(line)


customers = {c.id: c.name for c in db.scalars(select(Customer)).all()}
vault_names = {v.id: v.name for v in db.scalars(select(Vault)).all()}
bank_names = {b.id: f"{b.bank_name} - {b.account_name}" for b in db.scalars(select(BankAccount)).all()}

# ---- what counts as cancelled -------------------------------------------------------------
reversed_tx = set(db.scalars(select(Transaction.id).where(Transaction.status == "reversed")).all())
reversed_transfers = set(db.scalars(select(Transfer.id).where(Transfer.status == "reversed")).all())
reversed_move_refs = set(db.scalars(select(Movement.reference_id).where(Movement.status == "reversed")).all())
reversed_journal_refs = set(db.scalars(_reversed_journal_refs()).all())   # already excludes live transactions/transfers
# An EDITED transfer / transaction keeps its id and its old movements stay flagged "reversed" next to the new live
# ones: that id is live, not cancelled.
live_refs = set(db.scalars(select(Transaction.id).where(Transaction.status != "reversed")).all()) | set(db.scalars(select(Transfer.id).where(Transfer.status == "approved")).all())
cancelled_refs = reversed_tx | reversed_transfers | (reversed_move_refs - live_refs) | reversed_journal_refs
print(f"database: {db_path}")
print(f"cancelled operations found: {len(reversed_tx)} reversed transactions, {len(reversed_transfers)} reversed transfers, "
      f"{len(reversed_move_refs)} reversed movement groups, {len(reversed_journal_refs)} reversed journal references\n")

# ---- A. customer statement entries ------------------------------------------------------
entries = db.scalars(select(CustomerAccountEntry)).all()
hidden_entries = _reversed_customer_entry_ids(db, entries)   # what the customer statement hides (includes the cancelled-transaction/journal rules)
for e in entries:
    if e.id in hidden_entries:
        continue
    base = e.id[:-4] if e.id.endswith("_out") else e.id[:-3] if e.id.endswith("_in") else e.id
    if base in cancelled_refs:
        why = "transaction reversed" if base in reversed_tx else "journal entry reversed" if base in reversed_journal_refs else "movement reversed"
        add("A", f"{e.timestamp}  {customers.get(e.customer_id, e.customer_id)}  {e.type} {e.amount:,.2f} {e.currency}  [{e.id}]  ({why})")

# ---- B. movements that would print on a vault / bank / customer statement ------------------
visible = db.scalars(select(Movement).where(_not_reversed_movement(), Movement.reference_id.in_(cancelled_refs))).all() if cancelled_refs else []
for m in visible:
    where = vault_names.get(m.entity_id) or bank_names.get(m.entity_id) or customers.get(m.entity_id) or m.entity_id
    kind = {"vault": "vault", "bank_account": "bank account", "customer": "customer"}.get(m.entity_type, m.entity_type)
    add("B", f"{m.timestamp}  {kind} «{where}»  {m.type}  in {m.amount_in:,.2f} / out {m.amount_out:,.2f} {m.currency}  [{m.reference_id}]")

# ---- C. approved transfers that were in fact cancelled -----------------------------------
movement_flags = defaultdict(list)
for ref, status in db.execute(select(Movement.reference_id, Movement.status)).all():
    movement_flags[ref].append(status)
for t in db.scalars(select(Transfer).where(Transfer.status == "approved")).all():
    flags = movement_flags.get(t.id, [])
    if t.id in reversed_journal_refs or (flags and all(f == "reversed" for f in flags)):
        add("C", f"{t.timestamp}  {t.source_name} -> {t.dest_name}  {t.amount:,.2f} {t.currency}  [{t.id}]  (listed as approved)")

# ---- D. half-cancelled operations ----------------------------------------------------------
all_jvs = db.scalars(select(JournalEntry)).all()
approved_refs = {j.reference for j in all_jvs if j.status == "approved" and not j.id.startswith("REV-")}
reversed_jv_refs_any = {j.reference for j in all_jvs if j.status == "reversed"}
live_tx = {t.id: t for t in db.scalars(select(Transaction).where(Transaction.status != "reversed")).all()}
live_tr = {t.id: t for t in db.scalars(select(Transfer).where(Transfer.status == "approved")).all()}
for ref in sorted(reversed_jv_refs_any):
    if ref in approved_refs:
        continue  # an edit: the corrected entry replaced it
    if ref in live_tx:
        t = live_tx[ref]
        add("D", f"{t.timestamp}  transaction {t.type} {t.amount:,.2f} {t.from_currency}  customer {customers.get(t.customer_id, t.customer_id)}  [{t.id}]  (journal reversed, operation still live)")
    elif ref in live_tr:
        t = live_tr[ref]
        add("D", f"{t.timestamp}  transfer {t.source_name} -> {t.dest_name}  {t.amount:,.2f} {t.currency}  [{t.id}]  (journal reversed, transfer still approved)")

# ---- E. cancelled debts / advances still listed -------------------------------------------
for d in db.scalars(select(Debt).where(Debt.status == "cancelled")).all():
    if d.id not in reversed_journal_refs:
        add("E", f"{d.start_date}  debt {d.amount:,.2f} {d.currency}  customer {customers.get(d.customer_id, d.customer_id)}  [{d.id}]")
for a in db.scalars(select(Advance)).all():
    if getattr(a, "status", None) == "cancelled" and a.id not in reversed_journal_refs:
        add("E", f"{a.timestamp}  advance {a.amount:,.2f} {a.currency}  customer {customers.get(a.customer_id, a.customer_id)}  [{a.id}]")

# ---- F / G. the daily ledgers (the PDF / Excel "كشف الحركة اليومية") ---------------------------------------
# Built with the application's own ledger code. F: a printed "unrecorded manual adjustment" line - a balance that
# changed with no movement behind it. A cancellation or an edit must never cause one (it records a counter-movement);
# what is left is either a balance edited by hand (banks page) or data from before counter-movements existed - review.
# G: the ledger's last balance is not the account's balance.
ledger_targets = []
for v in db.scalars(select(Vault)).all():
    for ccy in (v.balances or {}):
        ledger_targets.append(("vault", v.id, v.name, ccy, (v.balances or {}).get(ccy, 0.0)))
for a in db.scalars(select(BankAccount)).all():
    ledger_targets.append(("bank_account", a.id, f"{a.bank_name} - {a.account_name}", a.currency, a.balance))
for kind, eid, name, ccy, live_balance in ledger_targets:
    if not db.scalar(select(Movement.id).where(Movement.entity_type == kind, Movement.entity_id == eid, Movement.currency == ccy).limit(1)):
        continue
    headers, rows = _entity_daily_ledger_rows(db, kind, eid, "", "", ccy)
    bal_col = headers.index("الرصيد بالأرقام")
    for r in rows:
        if "تعديل رصيد يدوي" in str(r[3]):
            amount = f"+{r[4]}" if r[4] else f"-{r[5]}"
            add("F", f"{r[1]}  {name} [{eid}]  {ccy}  {amount}")
    if len(rows) > 1:
        try:
            last = float(str(rows[-1][bal_col]).replace(",", "").split()[0])
        except ValueError:
            continue
        if abs(last - live_balance) > 0.01:
            add("G", f"{name} [{eid}]  {ccy}  ledger ends at {last:,.2f} but the account holds {live_balance:,.2f}")

# ---- report ------------------------------------------------------------------------------------
TITLES = {
    "A": "A. cancelled customer deposits / withdrawals / transfers still in the customer statement",
    "B": "B. movements of cancelled operations that still print on a vault / bank / customer-account statement",
    "C": "C. cancelled transfers still listed as approved in statements",
    "D": "D. operations whose journal entry was reversed but that are still live (half-cancelled)",
    "E": "E. cancelled debts / advances still listed",
    "F": "F. daily ledger prints an 'unrecorded manual adjustment' line (a balance changed with no movement - review each)",
    "G": "G. daily ledger's last balance differs from the account's balance",
}
total = 0
for key in "ABCDEFG":
    rows = findings.get(key, [])
    total += len(rows)
    status = "OK" if not rows else f"{len(rows)} FOUND"
    print(f"[{status}] {TITLES[key]}")
    for line in (rows if LIMIT is None else rows[:LIMIT]):
        print("      -", line)
    if LIMIT is not None and len(rows) > LIMIT:
        print(f"      ... and {len(rows) - LIMIT} more (run with --all)")

print()
if total == 0:
    print("RESULT: no findings in the covered statement checks. Nothing was changed.")
    sys.exit(0)
cancelled_findings = sum(len(findings.get(key, [])) for key in "ABCDE")
balance_findings = sum(len(findings.get(key, [])) for key in "FG")
print(f"RESULT: {total} finding(s): {cancelled_findings} cancellation/state issue(s), {balance_findings} ledger-balance review item(s). Nothing was changed.")
sys.exit(1)
