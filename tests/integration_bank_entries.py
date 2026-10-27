"""End-to-end: cancelling and editing bank-account entries keeps the recorded balances joined up and the daily ledger free of false adjustments.

Runs against a COPY of the demo database (demo/data/sql_app.db, built by demo/seed_demo.py) in a temporary
folder, through the real API; nothing in the project or the real database is touched.

    python tests/integration_bank_entries.py
"""
import os
import shutil
import sys
import tempfile
import time

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DEMO_DB = os.path.join(ROOT, "demo", "data", "sql_app.db")
if not os.path.isfile(DEMO_DB):
    sys.exit("demo database not found: run demo/seed_demo.py first")
sys.path.insert(0, ROOT)
sys.stdout.reconfigure(encoding="utf-8")
_work = tempfile.mkdtemp(prefix="ledger_it_")
shutil.copy(DEMO_DB, os.path.join(_work, "sql_app.db"))
os.chdir(_work)
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import Movement
from app.routers import business as b

c = TestClient(app, raise_server_exceptions=False)
H = {"Authorization": "Bearer " + c.post("/api/auth/login", json={"username": "admin", "password": "123"}).json()["data"]["token"]}
bad = 0


def check(label, cond, extra=""):
    global bad
    bad += 0 if cond else 1
    print(("OK   " if cond else "FAIL ") + label + (f"  [{extra}]" if extra else ""))


acct = next(a for a in c.get("/api/bank_accounts", headers=H).json()["data"] if a["currency"] == "LYD" and not a.get("customerId"))
aid = acct["id"]
bal = lambda: next(a for a in c.get("/api/bank_accounts", headers=H).json()["data"] if a["id"] == aid)["balance"]
start = bal()


def op(kind, amount, **kw):
    r = c.post(f"/api/bank_accounts/{aid}/{kind}", headers=H, json={"amount": amount, "currency": "LYD", "notes": "t", **kw})
    assert r.status_code == 200, r.text[:200]
    time.sleep(0.02)
    return r


def last_entry():
    db = SessionLocal()
    m = db.query(Movement).filter(Movement.entity_id == aid, Movement.status == "active", Movement.reference_id.like("bae_%")).order_by(Movement.timestamp.desc()).all()
    db.close()
    return m


T0 = int(time.time() * 1000) - 5
op("deposit", 1000); op("withdraw", 300); op("deposit", 50)
ids = []
db = SessionLocal()
rows = db.query(Movement).filter(Movement.entity_id == aid, Movement.reference_id.like("bae_%")).all()
db.close()
ids = [r.reference_id for r in sorted(rows, key=lambda r: r.timestamp + r.id)]
d1 = next(r.reference_id for r in rows if r.amount_in == 1000)
w1 = next(r.reference_id for r in rows if r.amount_out == 300)

# cancel the first deposit AFTER later rows exist, edit the withdrawal, add more
r = c.post(f"/api/bank_accounts/{aid}/movements/{d1}/reverse", headers=H, json={"reason": "t"}); check("reverse the first deposit", r.status_code == 200, str(r.status_code))
r = c.put(f"/api/bank_accounts/{aid}/movements/{w1}", headers=H, json={"amount": 120, "reason": "t"}); check("edit the withdrawal", r.status_code == 200, str(r.status_code))
op("deposit", 75)
check("balance = start + 50 - 120 + 75", abs(bal() - (start + 50 - 120 + 75)) < 0.01, f"{bal() - start}")

db = SessionLocal()
mv = db.query(Movement).filter(Movement.entity_id == aid).all()
mine = [m for m in mv if b._creation_key(m) and b._creation_key(m) >= T0]
counters = [m for m in mine if m.id.startswith("m_rev_")]
check("each cancelled entry left a hidden counter-movement", len(counters) == 2 and all(m.status == "reversed" for m in counters), str([(m.amount_in, m.amount_out, m.status) for m in counters]))
chain = sorted(mine, key=lambda m: b._creation_key(m))
joined = all(abs(chain[i].balance_before - chain[i - 1].balance_after) < 0.01 for i in range(1, len(chain)))
check("the recorded balances of this test's movements join up end to end (hidden ones included)", joined, str([(round(m.balance_before), round(m.balance_after), m.status) for m in chain]))
# daily ledger: no adjustment lines, closes at the live balance
headers, rows_ = b._entity_daily_ledger_rows(db, "bank_account", aid, "", "", "LYD")
adj = [r for r in rows_ if "تعديل رصيد يدوي" in str(r[3])]
last = float(str(rows_[-1][6]).replace(",", ""))
check("daily ledger has no manual-adjustment line", not adj, str(len(adj)))
check("daily ledger ends at the account balance", abs(last - bal()) < 0.01, f"{last} vs {bal()}")
db.close()
# statements and the movements list hide the cancelled rows and their counters
r = c.get(f"/api/bank_accounts/{aid}/statement", headers=H).json()["data"]
ids_shown = [x for ids_ in (r.get("entryIds") or {}).values() for x in ids_]
check("statement does not list the cancelled entries", d1 not in ids_shown and w1 not in ids_shown)
r = c.get(f"/api/movements?entity_type=bank_account&entity_id={aid}", headers=H).json()["data"]
check("movements list hides the cancelled rows and their counters", not any(m.get("referenceId") in (d1, w1) for m in r))
print("RESULT:", "all good" if bad == 0 else f"{bad} problem(s)")
