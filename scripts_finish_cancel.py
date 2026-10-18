"""
Finishes the cancellation of HALF-CANCELLED operations (the "D" findings of scripts_check_statements.py):
an operation whose journal entry was reversed from the accounting page, but whose operation record
(Transaction / Transfer) is still live, so it keeps showing in statements and lists.

NOTHING IS DELETED. The operation is marked "reversed" and its movements are marked "reversed" - exactly
the end state the application itself produces when you cancel an operation properly - so it disappears from
every statement and stays in the database for auditing.

It is a DRY RUN unless you pass --apply:

    python scripts_finish_cancel.py                       # shows what would change, writes nothing
    python scripts_finish_cancel.py --only REF [REF ...]  # restrict to some operation ids
    python scripts_finish_cancel.py --apply               # asks for confirmation, backs the database up, then does it
    python scripts_finish_cancel.py --apply --yes         # same, without the typed confirmation
    python scripts_finish_cancel.py --db /path/to/sql_app.db

Run it from the application folder (the one that holds sql_app.db). Afterwards run
scripts_check_statements.py again: it should report clean.

Balances. The accounting page's old "reverse entry" only flipped the journal entry in the early versions and
put the money back in later ones. For every movement of the operation this script checks whether its
counter-movement ("m_rev_...") exists:
  - it exists  -> the money was already put back; only the flags change, balances are NOT touched again.
  - it is missing -> the vault / bank account / customer balance still contains the operation; the script puts
    it back (the inverse of the recorded movement - the same thing the application's own reversal does) and
    the dry run prints every balance change so you can see it before agreeing.
Operations paid from a customer account or on debt are only reported ("MANUAL"), never touched: their effect is
not recorded as movements, so they must be cancelled from the operations page.
"""
import argparse
import shutil
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

parser = argparse.ArgumentParser(description="Finish cancelling half-cancelled operations (dry run unless --apply)")
parser.add_argument("--db", default=str(HERE / "sql_app.db"), help="path to sql_app.db (default: next to this script)")
parser.add_argument("--apply", action="store_true", help="really write the changes (default: dry run)")
parser.add_argument("--yes", action="store_true", help="with --apply: skip the typed confirmation")
parser.add_argument("--only", nargs="+", metavar="REF", help="only these operation ids")
args = parser.parse_args()

db_path = Path(args.db).resolve()
if not db_path.is_file():
    print(f"database not found: {db_path}\nRun this from the application folder, or pass --db /path/to/sql_app.db")
    sys.exit(2)

try:
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker

    from app.models import (AuditAction, BankAccount, Customer, JournalEntry, Movement, Shift, Transaction, Transfer, Vault)
    from app.tracking import create_audit_log
except Exception as exc:  # pragma: no cover
    print("could not load the application code:", repr(exc))
    sys.exit(2)

if args.apply:
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
else:  # the dry run cannot write even by mistake
    engine = create_engine(f"sqlite:///file:{db_path.as_posix()}?mode=ro&uri=true", connect_args={"check_same_thread": False})
db = sessionmaker(bind=engine, autoflush=False)()

REASON = "إكمال إلغاء عملية عُكس قيدها المحاسبي فقط (سكربت الصيانة)"
customers = {c.id: c.name for c in db.scalars(select(Customer)).all()}


def entity_label(m: Movement) -> str:
    if m.entity_type == "vault":
        v = db.get(Vault, m.entity_id)
        return f"vault «{v.name if v else m.entity_id}»"
    if m.entity_type == "bank_account":
        b = db.get(BankAccount, m.entity_id)
        return f"bank account «{(b.bank_name + ' - ' + b.account_name) if b else m.entity_id}»"
    return f"customer «{customers.get(m.entity_id, m.entity_id)}»"


# ---- find the half-cancelled operations (same rule as check D of scripts_check_statements.py) ----------
all_jvs = db.scalars(select(JournalEntry)).all()
approved_refs = {j.reference for j in all_jvs if j.status == "approved" and not j.id.startswith("REV-")}
reversed_jv_refs = {j.reference for j in all_jvs if j.status == "reversed"}
live_tx = {t.id: t for t in db.scalars(select(Transaction).where(Transaction.status != "reversed")).all()}
live_tr = {t.id: t for t in db.scalars(select(Transfer).where(Transfer.status == "approved")).all()}

targets = []
for ref in sorted(reversed_jv_refs):
    if ref in approved_refs:
        continue  # an edit: the corrected entry replaced the reversed one
    if ref in live_tx or ref in live_tr:
        if args.only and ref not in args.only:
            continue
        targets.append(ref)
if args.only:
    missing = [r for r in args.only if r not in targets]
    if missing:
        print("not half-cancelled (or unknown), ignored:", ", ".join(missing))

print(f"database: {db_path}")
print(f"mode: {'APPLY' if args.apply else 'DRY RUN (nothing is written)'}")
print(f"half-cancelled operations found: {len(targets)}\n")
if not targets:
    print("Nothing to do.")
    sys.exit(0)

# ---- plan -------------------------------------------------------------------------------------------------
plans = []   # each: dict(ref, kind, label, undo=[(movement, delta)], flag=[movements], shift=(shift, new_expected)|None, manual=str|None)
for ref in targets:
    tx, tr = live_tx.get(ref), live_tr.get(ref)
    plan = {"ref": ref, "kind": "transaction" if tx else "transfer", "undo": [], "flag": [], "shift": None, "manual": None}
    if tx:
        plan["label"] = f"{tx.timestamp}  {tx.type} {tx.amount:,.2f} {tx.from_currency}  customer {customers.get(tx.customer_id, tx.customer_id)}  [{ref}]"
        if tx.payment_method in ("customer_account", "debt"):
            plan["manual"] = f"paid by {tx.payment_method}: its effect is not stored as movements - cancel it from the operations page"
    else:
        plan["label"] = f"{tr.timestamp}  transfer {tr.source_name} -> {tr.dest_name}  {tr.amount:,.2f} {tr.currency}  [{ref}]"

    moves = db.scalars(select(Movement).where(Movement.reference_id == ref).order_by(Movement.timestamp)).all()
    counters = {m.id for m in moves if m.id.startswith("m_rev_")}
    for m in moves:
        if m.status == "reversed":
            continue
        plan["flag"].append(m)
        is_counter = m.id.startswith("m_rev_")
        has_counter = any(c.startswith(f"m_rev_{m.id}_") for c in counters)
        if not is_counter and not has_counter and m.entity_type in ("vault", "bank_account", "customer"):
            plan["undo"].append((m, m.amount_out - m.amount_in))

    # an open shift only counts operations made since it started
    if tx and tx.vault_id and not plan["manual"]:
        shift = db.scalar(select(Shift).where(Shift.vault_id == tx.vault_id, Shift.status == "open"))
        if shift and shift.start_time and tx.timestamp[:16] >= shift.start_time[:16]:
            exp = dict(shift.expected_balances or {})
            if tx.type in ("deposit", "withdraw"):
                exp[tx.from_currency] = exp.get(tx.from_currency, 0.0) - (tx.amount if tx.type == "deposit" else -tx.amount)
            else:
                is_sell = tx.type == "sell"
                if is_sell:
                    recv_ccy, recv_amt, pay_ccy, pay_amt = tx.from_currency, tx.amount * tx.rate + tx.commission, tx.to_currency, tx.amount
                elif tx.type == "buy":
                    recv_ccy, recv_amt, pay_ccy, pay_amt = tx.from_currency, tx.amount, tx.to_currency, tx.amount * tx.rate - tx.commission
                else:
                    recv_ccy, recv_amt, pay_ccy, pay_amt = tx.from_currency, tx.amount, tx.to_currency, tx.amount * tx.rate
                if is_sell:
                    exp[pay_ccy] = exp.get(pay_ccy, 0.0) + pay_amt
                    if tx.payment_method == "cash":
                        exp[recv_ccy] = exp.get(recv_ccy, 0.0) - recv_amt
                else:
                    exp[recv_ccy] = exp.get(recv_ccy, 0.0) - recv_amt
                    if tx.payment_method == "cash":
                        exp[pay_ccy] = exp.get(pay_ccy, 0.0) + pay_amt
            plan["shift"] = (shift, exp)
    plans.append(plan)

for p in plans:
    print(f"* {p['kind']}: {p['label']}")
    if p["manual"]:
        print(f"    MANUAL - skipped: {p['manual']}")
        continue
    print(f"    mark {p['kind']} as reversed; hide {len(p['flag'])} movement row(s)")
    if p["undo"]:
        for m, delta in p["undo"]:
            print(f"    BALANCE CHANGE: {entity_label(m)}  {m.currency}  {delta:+,.2f}   (puts back «{m.type}»)")
    else:
        print("    balances: already put back by the earlier journal reversal - not touched")
    if p["shift"]:
        shift, exp = p["shift"]
        print(f"    open shift on this vault: expected balances {dict(shift.expected_balances or {})} -> {exp}")

doable = [p for p in plans if not p["manual"]]
print(f"\nwould finish: {len(doable)}   manual (skipped): {len(plans) - len(doable)}")
if not args.apply:
    print("\nDRY RUN - nothing was changed. Review the list, then run again with --apply.")
    sys.exit(0)
if not doable:
    print("\nnothing the script can do by itself.")
    sys.exit(0)

# ---- apply ----------------------------------------------------------------------------------------------
if not args.yes:
    word = input(f"\nType the number {len(doable)} to confirm finishing these {len(doable)} operation(s): ").strip()
    if word != str(len(doable)):
        print("not confirmed - nothing changed.")
        sys.exit(0)

backup = db_path.with_name(f"{db_path.stem}.before-finish-cancel-{datetime.now():%Y%m%d-%H%M%S}.db")
try:  # a consistent copy even while the application is running
    src, dst = sqlite3.connect(str(db_path)), sqlite3.connect(str(backup))
    src.backup(dst)
    dst.close()
    src.close()
except Exception as exc:
    print("backup failed, NOTHING was changed:", repr(exc))
    sys.exit(2)
print(f"backup written: {backup}")

stamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
try:
    for p in doable:
        for m, _delta in p["undo"]:
            if m.entity_type == "vault":
                ent = db.get(Vault, m.entity_id)
                if ent is not None:
                    bals = dict(ent.balances)
                    bals[m.currency] = bals.get(m.currency, 0.0) - m.amount_in + m.amount_out
                    ent.balances = bals
                    ent.last_movement = stamp
            elif m.entity_type == "bank_account":
                ent = db.get(BankAccount, m.entity_id)
                if ent is not None:
                    ent.balance = ent.balance - m.amount_in + m.amount_out
                    ent.last_movement = stamp
            elif m.entity_type == "customer":
                ent = db.get(Customer, m.entity_id)
                if ent is not None:
                    bals = dict(ent.balances)
                    bals[m.currency] = bals.get(m.currency, 0.0) - m.amount_in + m.amount_out
                    ent.balances = bals
        for m in p["flag"]:
            m.status = "reversed"
        if p["kind"] == "transaction":
            live_tx[p["ref"]].status = "reversed"
        else:
            live_tr[p["ref"]].status = "reversed"
        if p["shift"]:
            p["shift"][0].expected_balances = p["shift"][1]
        create_audit_log(
            db, action=AuditAction.REVERSE, entity_type="Transaction" if p["kind"] == "transaction" else "Transfer", entity_id=p["ref"],
            description=f"إكمال إلغاء العملية {p['ref']} (قيدها كان معكوساً فقط) — {REASON}"
                        + (f" — أُعيدت أرصدة {len(p['undo'])} حركة" if p["undo"] else " — الأرصدة كانت قد أُعيدت سابقاً"),
            username="maintenance-script",
        )
    db.commit()
except Exception as exc:
    db.rollback()
    print("FAILED, everything was rolled back (the backup is untouched):", repr(exc))
    sys.exit(2)

print(f"\nDONE: {len(doable)} operation(s) finished. Now run:  python scripts_check_statements.py")
