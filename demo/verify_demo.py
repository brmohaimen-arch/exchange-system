"""
Sanity-checks the demo database built by seed_demo.py (read-only).

    cd demo
    python verify_demo.py
"""
import collections
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
if not os.path.exists(os.path.join(DATA, "sql_app.db")):
    sys.exit("demo/data/sql_app.db not found - run seed_demo.py first")
os.chdir(DATA)
sys.path.insert(0, os.path.dirname(HERE))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402

import app.main  # noqa: E402,F401
from app.database import SessionLocal  # noqa: E402
from app.models import (ApprovalRequest, BankAccount, Customer, FleetAccount, Movement, Shift, Transaction, Vault)  # noqa: E402

assert os.path.abspath("sql_app.db").startswith(DATA)
db = SessionLocal()
bad = 0


def check(label, ok, extra=""):
    global bad
    print(("OK   " if ok else "FAIL ") + label + (f"  {extra}" if extra else ""))
    bad += 0 if ok else 1


vaults = db.scalars(select(Vault)).all()
for v in vaults:
    neg = {c: b for c, b in v.balances.items() if b < -0.005}
    check(f"vault {v.name}: no negative balance", not neg, str(neg) if neg else "")
accounts = db.scalars(select(BankAccount).where(BankAccount.customer_id.is_(None))).all()
print("   company bank balances:", {a.account_name: round(a.balance) for a in accounts})
custs = db.scalars(select(Customer)).all()
neg_c = {c.name: c.balances for c in custs if any(b < -0.005 for b in c.balances.values())}
check("no customer with a negative balance", not neg_c, str(neg_c) if neg_c else "")

# Movement chains: every row must start from where the previous row of the same entity+currency ended.
from app.models import Transaction as _Tx
REVERSED_TX = {t.id for t in db.scalars(select(_Tx).where(_Tx.status == 'reversed')).all()}
rows = db.scalars(select(Movement).order_by(Movement.timestamp, Movement.id)).all()
chains = collections.defaultdict(list)
for m in rows:
    if m.entity_type == "customer":
        continue  # a customer's balance also moves through trades paid from their account, which carry no customer movement
    if m.status == "reversed" or m.reference_id in REVERSED_TX:
        continue  # hidden from every statement: a corrected or undone operation and its counter-legs
    chains[(m.entity_type, m.entity_id, m.currency)].append(m)
broken = 0
for key, ms in chains.items():
    # several rows share a minute: follow the balance chain inside the group, as the statements do
    ms_sorted = sorted(ms, key=lambda m: m.timestamp)
    i = 0
    prev = None
    while i < len(ms_sorted):
        j = i
        while j < len(ms_sorted) and ms_sorted[j].timestamp == ms_sorted[i].timestamp:
            j += 1
        group = ms_sorted[i:j]
        while group:
            pick = next((m for m in group if prev is None or abs(m.balance_before - prev) < 0.01), None)
            if pick is None:
                broken += 1
                pick = group[0]
            group.remove(pick)
            prev = pick.balance_after
        i = j
check("movement chains continuous (no unexplained balance jumps)", broken == 0, f"{broken} breaks across {len(chains)} chains")

txs = db.scalars(select(Transaction)).all()
by_status = collections.Counter(t.status for t in txs)
days = sorted({t.timestamp[:10] for t in txs})
print(f"   transactions: {dict(by_status)}  over {len(days)} days ({days[0]} .. {days[-1]})")
by_vault = collections.Counter(t.vault_id for t in txs)
print("   per vault:", dict(by_vault))
shifts = collections.Counter(s.status for s in db.scalars(select(Shift)).all())
print("   shifts:", dict(shifts))
pend = collections.Counter(a.type for a in db.scalars(select(ApprovalRequest).where(ApprovalRequest.status == "pending")).all())
print("   pending approvals:", dict(pend))
print("   fleet accounts:", [(a.name, round(a.balance or 0)) for a in db.scalars(select(FleetAccount)).all()][:8])
print("\nRESULT:", "all good" if bad == 0 else f"{bad} problem(s)")
db.close()
