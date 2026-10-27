"""End-to-end: undoing a vault manual entry, a customer deposit and an edited transfer keeps balances, recorded chains and the daily ledger consistent.

Runs against a COPY of the demo database (demo/data/sql_app.db, built by demo/seed_demo.py) in a temporary
folder, through the real API; nothing in the project or the real database is touched.

    python tests/integration_vault_customer_transfer.py
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


vaults = c.get("/api/vaults", headers=H).json()["data"]
v = next(x for x in vaults if x["balances"].get("LYD", 0) > 100000)
v2 = next(x for x in vaults if x["id"] != v["id"] and x["balances"].get("LYD", 0) > 1000)
cust = c.get("/api/customers", headers=H).json()["data"][0]["id"]
vb = lambda vid: next(x for x in c.get("/api/vaults", headers=H).json()["data"] if x["id"] == vid)["balances"]["LYD"]
cb = lambda: next(x for x in c.get("/api/customers", headers=H).json()["data"] if x["id"] == cust)["balances"].get("LYD", 0)
T0 = int(time.time() * 1000) - 5


def ledger_clean(kind, eid, label):
    db = SessionLocal()
    headers, rows = b._entity_daily_ledger_rows(db, kind, eid, "", "", "LYD")
    adj = [r for r in rows if "تعديل رصيد يدوي" in str(r[3])]
    live = vb(eid) if kind == "vault" else None
    last = float(str(rows[-1][6]).replace(",", ""))
    db.close()
    check(f"{label}: ledger has no manual-adjustment line", not adj, str(len(adj)))
    if live is not None:
        check(f"{label}: ledger ends at the live balance", abs(last - live) < 0.01, f"{last} vs {live}")


# 1. a vault manual entry, then undone
b0 = vb(v["id"])
r = c.post(f"/api/vaults/{v['id']}/manual_entry", headers=H, json={"direction": "in", "currency": "LYD", "amount": 500, "description": "اختبار"})
check("vault manual entry", r.status_code == 200, str(r.status_code))
time.sleep(0.05)
db = SessionLocal(); ref = db.query(Movement).filter(Movement.entity_id == v["id"], Movement.reference_id.like("me_%")).order_by(Movement.timestamp.desc()).all()
ref = [m for m in ref if (b._creation_key(m) or 0) >= T0][0].reference_id; db.close()
r = c.post(f"/api/vaults/{v['id']}/movements/{ref}/reverse", headers=H, json={"reason": "t"})
check("reverse it", r.status_code == 200 and abs(vb(v["id"]) - b0) < 0.01, f"{r.status_code} {vb(v['id']) - b0}")

# 2. a customer deposit funded from the vault, then undone from the customer's statement
b1, c1 = vb(v["id"]), cb()
r = c.post(f"/api/customers/{cust}/deposit", headers=H, json={"vault_id": v["id"], "currency": "LYD", "amount": 700})
check("customer deposit from a vault", r.status_code == 200, str(r.status_code))
entry = r.json()["data"]["id"]
r = c.post(f"/api/customers/{cust}/entries/{entry}/reverse", headers=H, json={"reason": "t"})
check("reverse the customer deposit", r.status_code == 200 and abs(vb(v["id"]) - b1) < 0.01 and abs(cb() - c1) < 0.01, f"{r.status_code} vault {vb(v['id']) - b1} customer {cb() - c1}")

# 3. a transfer between two vaults, edited, then undone
t0a, t0b = vb(v["id"]), vb(v2["id"])
tid = "tr_integ_%d" % int(time.time())
r = c.post("/api/transfers", headers=H, json={"id": tid, "source_type": "vault", "source_id": v["id"], "source_name": v["name"], "dest_type": "vault", "dest_id": v2["id"], "dest_name": v2["name"], "currency": "LYD", "amount": 300})
st = r.status_code
if st == 200:
    apr = [a for a in c.get("/api/approvals", headers=H).json()["data"] if a.get("referenceId") == tid]
    if apr:
        c.post(f"/api/approvals/{apr[0]['id']}/action?action=approve", headers=H)
check("transfer between vaults created and approved", abs(vb(v["id"]) - (t0a - 300)) < 0.01 and abs(vb(v2["id"]) - (t0b + 300)) < 0.01, f"{st}")
r = c.put(f"/api/transfers/{tid}", headers=H, json={"amount": 200, "reason": "t"})
check("edit the transfer", r.status_code == 200 and abs(vb(v["id"]) - (t0a - 200)) < 0.01, f"{r.status_code}")
r = c.post(f"/api/transfers/{tid}/reverse", headers=H, json={"reason": "t"})
check("reverse the transfer", r.status_code == 200 and abs(vb(v["id"]) - t0a) < 0.01 and abs(vb(v2["id"]) - t0b) < 0.01, f"{r.status_code}")

db = SessionLocal()
mine = [m for m in db.query(Movement).filter(Movement.entity_id.in_([v["id"], v2["id"]]), Movement.currency == "LYD").all() if (b._creation_key(m) or 0) >= T0]
for eid in (v["id"], v2["id"]):
    chain = sorted([m for m in mine if m.entity_id == eid], key=lambda m: b._creation_key(m))
    ok = all(abs(chain[i].balance_before - chain[i - 1].balance_after) < 0.01 for i in range(1, len(chain)))
    check(f"vault {eid[-6:]}: this test's recorded balances join up (hidden included)", ok, str(len(chain)))
db.close()
ledger_clean("vault", v["id"], "main vault")
ledger_clean("vault", v2["id"], "second vault")
print("RESULT:", "all good" if bad == 0 else f"{bad} problem(s)")
