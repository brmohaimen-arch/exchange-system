"""
Builds a self-contained DEMO database (fake Libyan exchange-office data) for
screen recordings and showcases.

    cd demo
    python seed_demo.py            # (re)builds demo/data/sql_app.db
    python seed_demo.py --days 60  # a longer history

Safety
- The app opens "./sql_app.db" relative to the working directory, so this script
  switches into demo/data BEFORE importing the app: the real database in the
  project root is never opened, read or written.
- Everything goes through the app's own API (in-process, no network), so the
  ledgers, journal entries, statements and balances are exactly what the real
  screens would have produced - only the clock is backdated.
- No WhatsApp/Telegram/SMS settings exist in this database, so nothing is sent.

All names, phone numbers, ID numbers and account numbers below are invented.
"""

import argparse
import contextlib
import datetime as _dt
import io
import os
import random
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(HERE, "data")

parser = argparse.ArgumentParser()
parser.add_argument("--days", type=int, default=40, help="days of history before today")
parser.add_argument("--seed", type=int, default=2026, help="random seed (same seed = same demo)")
args = parser.parse_args()

# ---- 1. fresh, isolated working directory ---------------------------------
assert os.path.basename(DATA) == "data" and os.path.dirname(DATA) == HERE, "refusing to wipe an unexpected path"
if os.path.isdir(DATA):
    shutil.rmtree(DATA)
os.makedirs(DATA)
os.chdir(DATA)
sys.path.insert(0, ROOT)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

rng = random.Random(args.seed)

# ---- 2. app import (creates tables + the base seed: admin, currencies, main vault) ----
from fastapi.testclient import TestClient  # noqa: E402

import app.main as app_main  # noqa: E402
from app.auth_deps import create_access_token  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import FleetAccount, User  # noqa: E402
from sqlalchemy import select  # noqa: E402

assert os.path.abspath("sql_app.db").startswith(DATA), "database is not the demo one!"

# ---- 3. backdated clock ---------------------------------------------------
RealDatetime = _dt.datetime


class Clock:
    on = False
    now = RealDatetime.utcnow()


class FakeDatetime(RealDatetime):
    @classmethod
    def utcnow(cls):
        return Clock.now if Clock.on else RealDatetime.utcnow()

    @classmethod
    def now(cls, tz=None):
        return Clock.now if Clock.on else RealDatetime.now(tz)


for _name, _mod in list(sys.modules.items()):
    if (_name == "app" or _name.startswith("app.")) and getattr(_mod, "datetime", None) is RealDatetime:
        _mod.datetime = FakeDatetime


def set_clock(day: _dt.date, minute_of_day: int):
    Clock.now = RealDatetime(day.year, day.month, day.day) + _dt.timedelta(minutes=minute_of_day)
    Clock.on = True


# ---- 4. API helper --------------------------------------------------------
client = TestClient(app_main.app)
problems: list[str] = []
counts: dict[str, int] = {}
TOKENS: dict[str, str] = {}
_seq = [0]


def next_id(prefix: str) -> str:
    _seq[0] += 1
    return f"{prefix}_demo_{_seq[0]:04d}"


def make_token(username: str) -> str:
    was_on, Clock.on = Clock.on, False  # token expiry is checked against the REAL clock
    try:
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == username).first()
            return create_access_token(db, user)
        finally:
            db.close()
    finally:
        Clock.on = was_on


def call(method: str, path: str, who: str = "admin", ok_codes=(200,), tag: str = "", **kw):
    """Calls the app in-process; returns the parsed response data or None on failure."""
    # the app prints "gateway not configured" notices; keep the build log readable
    with contextlib.redirect_stdout(io.StringIO()):
        r = client.request(method, "/api" + path, headers={"Authorization": f"Bearer {TOKENS[who]}"}, **kw)
    if r.status_code not in ok_codes:
        try:
            msg = r.json().get("detail", {}).get("message_ar") or r.text[:160]
        except Exception:
            msg = r.text[:160]
        problems.append(f"{method} {path} as {who} -> {r.status_code}: {msg}")
        return None
    if method != "GET":
        counts[tag or path.split("/")[1]] = counts.get(tag or path.split("/")[1], 0) + 1
    try:
        return r.json().get("data")
    except Exception:
        return None


def get(path: str, who: str = "admin"):
    return call("GET", path, who=who)


def vault_balance(vault_id: str) -> dict:
    for v in get("/vaults") or []:
        if v["id"] == vault_id:
            return v["balances"]
    return {}


def customer_balances() -> dict:
    return {c["id"]: c["balances"] for c in (get("/customers") or [])}


# ---- 5. cast of characters ------------------------------------------------
USERS = {  # username: (id, name, role, branch, vault)
    "tripoli": ("u_demo_tripoli", "يوسف الورفلي", "صراف", "فرع طرابلس", "v_tripoli"),
    "misrata": ("u_demo_misrata", "عبدالرحمن الككلي", "صراف", "فرع مصراتة", "v_misrata"),
    "benghazi": ("u_demo_benghazi", "سالم العبيدي", "صراف", "فرع بنغازي", "v_benghazi"),
    "treasurer": ("u_demo_treasurer", "فاطمة الزروق", "مدير الخزينة", "الإدارة العامة", None),
    "accountant": ("u_demo_accountant", "نجلاء بن عمران", "محاسب", "الإدارة العامة", None),
}
# the admin also works the main vault like a cashier, so the dashboard has activity of its own
SHIFT_USERS = {**USERS, "admin": ("u_admin", "مدير النظام الرئيسي", "مدير النظام", "الإدارة العامة", "v_main")}
VAULT_NAMES = {"v_main": "الخزنة الرئيسية"}
BRANCHES = [
    ("فرع مصراتة", "مصراتة", "شارع طرابلس، مصراتة", "051-2610044", "عمر الشريف"),
    ("فرع بنغازي", "بنغازي", "شارع جمال عبدالناصر، بنغازي", "061-9090021", "ناجي بوخشيم"),
]
VAULTS = {  # id: (name, branch, manager, balances)
    "v_tripoli": ("خزنة فرع طرابلس", "فرع طرابلس", "أحمد علي", {"LYD": 450000, "USD": 30000, "EUR": 15000, "TRY": 120000, "GBP": 8000}),
    "v_misrata": ("خزنة فرع مصراتة", "فرع مصراتة", "عمر الشريف", {"LYD": 300000, "USD": 20000, "EUR": 9000, "TRY": 60000, "GBP": 4000}),
    "v_benghazi": ("خزنة فرع بنغازي", "فرع بنغازي", "ناجي بوخشيم", {"LYD": 350000, "USD": 22000, "EUR": 10000, "TRY": 50000, "GBP": 5000}),
}
BANKS = [  # id, name, code
    ("bank_rep", "مصرف الجمهورية", "RPB"), ("bank_sah", "مصرف الصحاري", "SAH"),
    ("bank_ncb", "المصرف التجاري الوطني", "NCB"), ("bank_uni", "مصرف الوحدة", "UNB"),
]
BANK_ACCOUNTS = [  # id, bank id, name, number, currency, opening balance
    ("ba_rep_lyd", "bank_rep", "الحساب الجاري الرئيسي", "1010-448821-001", "LYD", 2500000),
    ("ba_ncb_lyd", "bank_ncb", "حساب العمليات", "2204-118830-004", "LYD", 1800000),
    ("ba_sah_usd", "bank_sah", "حساب الدولار", "3301-552019-002", "USD", 120000),
    ("ba_uni_eur", "bank_uni", "حساب اليورو", "4402-771300-006", "EUR", 60000),
]
CUSTOMERS = [  # name, type, bank for own account
    ("محمد سالم الفيتوري", "individual", True), ("عبدالله خليفة الشريف", "individual", False),
    ("إبراهيم مصطفى بن ناصر", "individual", False), ("علي أحمد الورفلي", "individual", True),
    ("خالد محمود الزليتني", "individual", False), ("سالم عمر الدرسي", "individual", False),
    ("حسين فرج التاجوري", "individual", False), ("أسامة نوري الترهوني", "individual", True),
    ("عادل رمضان الككلي", "individual", False), ("يوسف جمعة الزوي", "individual", False),
    ("نادية صالح الأوجلي", "individual", False), ("مريم علي العماري", "individual", False),
    ("شركة النور للتجارة العامة", "company", True), ("مؤسسة الواحة للسيارات", "company", False),
    ("شركة البحر المتوسط للاستيراد", "company", False), ("مكتب الأمل للسفر والسياحة", "company", False),
]
CUSTOMER_IDS = [f"cust_demo_{i + 1:02d}" for i in range(len(CUSTOMERS))]
CUSTOMER_NAME = dict(zip(CUSTOMER_IDS, [c[0] for c in CUSTOMERS]))

# base rates: (id, from, buy, sell). Drift a little every working day.
RATES = {"rate_usd_lyd": ["USD", 7.18, 7.30], "rate_eur_lyd": ["EUR", 7.78, 7.95],
         "rate_try_lyd": ["TRY", 0.215, 0.245], "rate_gbp_lyd": ["GBP", 9.05, 9.30]}
CCY_WEIGHTS = [("USD", 50), ("EUR", 25), ("TRY", 15), ("GBP", 10)]
AMOUNTS = {"USD": (100, 4000, 50), "EUR": (100, 2500, 50), "TRY": (1000, 18000, 500), "GBP": (100, 1200, 50)}
DETAILS_SAMPLES = ["حوالة من الخارج لصالح العميل", "تسوية فاتورة استيراد", "دفعة مقدمة عقد توريد", "سداد رسوم دراسة", "علاج بالخارج"]


def pick_currency() -> str:
    total = sum(w for _, w in CCY_WEIGHTS)
    n = rng.uniform(0, total)
    for c, w in CCY_WEIGHTS:
        n -= w
        if n <= 0:
            return c
    return "USD"


def rand_amount(ccy: str) -> int:
    lo, hi, step = AMOUNTS[ccy]
    # many small trades, a few big ones
    x = rng.random() ** 2.2
    return int(round((lo + x * (hi - lo)) / step) * step)


# ---- 6. one-time setup ----------------------------------------------------
def setup_world(start_day: _dt.date):
    set_clock(start_day, 8 * 60)
    TOKENS["admin"] = make_token("admin")

    for bid, city, addr, phone, mgr in [(b[0], b[1], b[2], b[3], b[4]) for b in BRANCHES]:
        call("POST", "/branches", json={"id": bid, "name": bid, "city": city, "address": addr, "phone": phone, "manager": mgr}, tag="branches")

    for vid, (name, branch, mgr, bal) in VAULTS.items():
        call("POST", "/vaults", json={"id": vid, "name": name, "type": "branch", "branch": branch, "manager": mgr,
                                      "balances": {k: float(v) for k, v in bal.items()}, "opening_balances": {k: float(v) for k, v in bal.items()}}, tag="vaults")

    for uname, (uid, name, role, branch, vault) in USERS.items():
        call("POST", "/auth/users", json={"id": uid, "name": name, "username": uname, "password": "demo123", "email": f"{uname}@demo.ly",
                                          "phone": "091-" + str(rng.randint(1000000, 9999999)), "role": role, "branch": branch, "allowed_vault_id": vault}, tag="users")
        TOKENS[uname] = make_token(uname)

    # banks, one branch each, accounts
    for bid, name, code in BANKS:
        call("POST", "/banks", json={"id": bid, "name": name, "code": code, "country": "ليبيا", "city": "طرابلس", "phone": "021-" + str(rng.randint(3000000, 3999999))}, tag="banks")
        call("POST", "/bank_branches", json={"id": f"{bid}_main", "bank_id": bid, "bank_name": name, "name": "الفرع الرئيسي", "city": "طرابلس",
                                             "address": "شارع الجمهورية، طرابلس", "phone": "021-" + str(rng.randint(3000000, 3999999)), "manager": "مدير الفرع"}, tag="bank_branches")
    bank_names = {b[0]: b[1] for b in BANKS}
    for aid, bid, name, number, ccy, bal in BANK_ACCOUNTS:
        call("POST", "/bank_accounts", json={"id": aid, "bank_id": bid, "bank_name": bank_names[bid], "branch_id": f"{bid}_main", "branch_name": "الفرع الرئيسي",
                                            "account_name": name, "account_number": number, "account_type": "corporate", "currency": ccy, "balance": float(bal)}, tag="bank_accounts")

    # customers (some with their own linked bank account)
    for cid, (name, ctype, own_bank) in zip(CUSTOMER_IDS, CUSTOMERS):
        payload = {"id": cid, "name": name, "type": ctype, "phone": "09" + rng.choice("1234") + "-" + str(rng.randint(1000000, 9999999)),
                   "id_number": str(rng.choice([1, 2])) + str(rng.randint(10**10, 10**11 - 1)),
                   "address": rng.choice(["طرابلس - حي الأندلس", "طرابلس - سوق الجمعة", "مصراتة - المدينة", "بنغازي - الليثي", "طرابلس - جنزور", "الزاوية - المركز"]),
                   "debt_limit": float(rng.choice([5000, 10000, 20000, 30000, 50000])), "balances": {}}
        if own_bank:
            payload.update({"bank_name": rng.choice([b[1] for b in BANKS]), "bank_account_number": str(rng.randint(10**9, 10**10 - 1)), "bank_currency": rng.choice(["LYD", "USD"])})
        call("POST", "/customers", json=payload, tag="customers")


# ---- 7. daily activity ----------------------------------------------------
LYD_BANK = "ba_rep_lyd"
SHIFTS_OPEN: dict[str, str] = {}  # vault id -> shift id
counter = {"reversals": 0, "edits": 0}


def top_up(vault_id: str, ccy: str, amount: float, who: str):
    """Moves cash from the main vault into a branch vault (request by the cashier, approval by the admin).
    For the main vault itself the cash comes from a bank account instead."""
    main = vault_balance("v_main")
    if vault_id == "v_main":
        bank = {"LYD": LYD_BANK, "USD": "ba_sah_usd", "EUR": "ba_uni_eur"}.get(ccy)
        if not bank:
            return False
        return call("POST", f"/bank_accounts/{bank}/withdraw", who="treasurer", tag="bank_ops",
                    json={"vault_id": "v_main", "currency": ccy, "amount": float(round(amount * 1.5)), "notes": "تغذية الخزنة الرئيسية", "details": "سحب نقدي لتغذية الخزنة الرئيسية"}) is not None
    if main.get(ccy, 0) < amount:
        # refill the main vault from a bank account first
        if ccy == "LYD":
            bank = LYD_BANK
        elif ccy == "USD":
            bank = "ba_sah_usd"
        elif ccy == "EUR":
            bank = "ba_uni_eur"
        else:
            bank = None
        if bank:
            call("POST", f"/bank_accounts/{bank}/withdraw", who="treasurer",
                 json={"vault_id": "v_main", "currency": ccy, "amount": float(round(amount * 2)), "notes": "تغذية الخزنة الرئيسية", "details": "سحب نقدي لتغذية الخزنة الرئيسية"}, tag="bank_ops")
        else:
            return False
    tid = next_id("tr")
    name = VAULTS[vault_id][0]
    res = call("POST", "/transfers", who="treasurer" if who == "admin" else who, json={"id": tid, "source_type": "vault", "source_id": "v_main", "source_name": "الخزنة الرئيسية",
                                                   "dest_type": "vault", "dest_id": vault_id, "dest_name": name, "currency": ccy, "amount": float(amount),
                                                   "notes": "تغذية الفرع", "details": f"تغذية سيولة {ccy} لفرع"}, tag="transfers")
    if res is not None:
        call("POST", f"/approvals/apr_tr_{tid}/action", params={"action": "approve"}, tag="approvals")
        return True
    return False


def do_trade(vault_id: str, who: str, bank_ok: bool = True):
    ccy = pick_currency()
    kind = "buy" if rng.random() < 0.52 else "sell"
    amount = rand_amount(ccy)
    rate_id = f"rate_{ccy.lower()}_lyd"
    rate = RATES[rate_id][1] if kind == "buy" else RATES[rate_id][2]
    rate = round(rate + rng.choice([0, 0, 0, 0.005, -0.005]) * (1 if ccy != "TRY" else 0.1), 4)
    bal = vault_balance(vault_id)
    # keep the drawer solvent: sells pay out foreign cash, buys pay out dinars
    if kind == "sell" and bal.get(ccy, 0) < amount * 1.05:
        if not top_up(vault_id, ccy, max(amount * 3, 5000 if ccy != "TRY" else 50000), who):
            kind = "buy"
    if kind == "buy" and bal.get("LYD", 0) < amount * rate * 1.05:
        if not top_up(vault_id, "LYD", max(amount * rate * 3, 100000), who):
            return
    cust = rng.choice(CUSTOMER_IDS)
    method = rng.choices(["cash", "customer_account", "bank_account"], weights=[84, 8, 8] if bank_ok else [92, 8, 0])[0]
    if method == "customer_account" and kind == "sell":
        method = "cash"  # selling against a customer's balance needs that balance; keep it simple
    commission = rng.choice([0, 0, 0, 0, 5, 10, 25]) if amount * rate > 3000 else 0
    payload = {
        "type": kind, "vaultId": vault_id, "customerId": cust,
        "fromCurrency": ccy if kind == "buy" else "LYD", "toCurrency": "LYD" if kind == "buy" else ccy,
        "amount": float(amount), "rate": rate, "commission": float(commission), "paymentMethod": method, "id": next_id("tx"),
    }
    if method == "bank_account":
        payload["bankAccountId"] = LYD_BANK
    if rng.random() < 0.12:
        payload["details"] = rng.choice(["صرف لغرض السفر", "مصاريف دراسة", "تسوية تجارية", "علاج بالخارج", "مصاريف عائلية"])
    return call("POST", "/exchange/pos", who=who, json=payload, tag="trades")


def do_customer_cash(vault_id: str, who: str):
    cust = rng.choice(CUSTOMER_IDS)
    bals = customer_balances().get(cust, {})
    ccy = rng.choice(["LYD", "LYD", "LYD", "USD"])
    have = bals.get(ccy, 0.0)
    vb = vault_balance(vault_id).get(ccy, 0.0)
    if have > 3000 and rng.random() < 0.45 and vb > 2000:
        amount = float(round(min(have * rng.uniform(0.2, 0.7), vb * 0.5) / 50) * 50)
        if amount >= 100:
            return call("POST", f"/customers/{cust}/withdraw", who=who, tag="customer_ops",
                        json={"vault_id": vault_id, "currency": ccy, "amount": amount, "notes": "سحب نقدي", "details": rng.choice(["سحب نقدي من رصيد الحساب", "سحب لمصاريف شخصية"])})
    amount = float(rng.choice([500, 1000, 2000, 3000, 5000, 8000, 12000] if ccy == "LYD" else [200, 500, 1000, 2000]))
    return call("POST", f"/customers/{cust}/deposit", who=who, tag="customer_ops",
                json={"vault_id": vault_id, "currency": ccy, "amount": amount, "notes": "إيداع نقدي", "details": rng.choice(["إيداع نقدي في الحساب", "دفعة من العميل", "إيداع لتغطية عمليات قادمة"])})


def open_shift(vault_id: str, user: str, day: _dt.date):
    uid, name, role, branch, _v = SHIFT_USERS[user]
    sid = f"shift_demo_{vault_id}_{day.isoformat()}"
    bal = vault_balance(vault_id)
    res = call("POST", "/shifts/open", who=user, tag="shifts",
               json={"id": sid, "cashier": name, "branch": branch, "vault_id": vault_id, "vault_name": VAULT_NAMES.get(vault_id) or VAULTS[vault_id][0],
                     "opening_balances": bal, "notes": "فتح وردية اليوم"})
    if res is not None:
        call("POST", f"/approvals/apr_shiftopen_{sid}/action", params={"action": "approve"}, tag="approvals")
        SHIFTS_OPEN[vault_id] = sid


def close_shift(vault_id: str, user: str, leave_pending: bool = False):
    sid = SHIFTS_OPEN.pop(vault_id, None)
    if not sid:
        return
    bal = dict(vault_balance(vault_id))
    diff = rng.random() < 0.12
    if diff:
        bal["LYD"] = bal.get("LYD", 0) - rng.choice([20, 50, 100])  # a small counting difference
    call("POST", f"/shifts/{sid}/close", who=user, json={"actual_balances": bal, "notes": "إقفال الوردية"}, tag="shifts")
    if diff and not leave_pending:
        call("POST", f"/shifts/{sid}/approve", tag="shifts")


def treasury_day(day: _dt.date, day_index: int):
    """Back-office activity at the main vault / bank accounts."""
    # an external wire into a bank account (no vault): typed details showcase
    if rng.random() < 0.55:
        acct = rng.choice(BANK_ACCOUNTS)
        amount = float(rng.choice([15000, 25000, 40000, 60000]) if acct[4] == "LYD" else rng.choice([2000, 5000, 9000]))
        call("POST", f"/bank_accounts/{acct[0]}/deposit", who="treasurer", tag="bank_ops",
             json={"currency": acct[4], "amount": amount, "other_source": rng.choice(["حوالة مصرفية", "شيك مقاصة", "تحصيل من عميل"]),
                   "notes": "إيداع خارجي", "details": rng.choice(DETAILS_SAMPLES)})
    # cash between the main vault and the bank
    if rng.random() < 0.3:
        main = vault_balance("v_main")
        if main.get("LYD", 0) > 900000:
            call("POST", f"/bank_accounts/{LYD_BANK}/deposit", who="treasurer", tag="bank_ops",
                 json={"vault_id": "v_main", "currency": "LYD", "amount": 150000.0, "notes": "إيداع فائض الخزنة", "details": "إيداع فائض السيولة في الحساب الجاري"})
    # bank-to-bank move of dinars
    if rng.random() < 0.12:
        tid = next_id("tr")
        res = call("POST", "/transfers", who="treasurer", tag="transfers",
                   json={"id": tid, "source_type": "bank_account", "source_id": "ba_rep_lyd", "source_name": "مصرف الجمهورية - الحساب الجاري الرئيسي (حساب بنكي)",
                         "dest_type": "bank_account", "dest_id": "ba_ncb_lyd", "dest_name": "المصرف التجاري الوطني - حساب العمليات (حساب بنكي)",
                         "currency": "LYD", "amount": float(rng.choice([50000, 80000, 120000])), "notes": "إعادة توزيع السيولة بين المصارف", "details": "تحويل بين مصرفين لتغطية المقاصة"})
        if res is not None:
            call("POST", f"/approvals/apr_tr_{tid}/action", params={"action": "approve"}, tag="approvals")
    # Monday: routine cash allocation from the main vault to the branches
    if day.weekday() == 0 and day_index > 0:
        for vault, (user, _t, _c) in BRANCH_PLAN.items():
            if vault == "v_main" or vault_balance("v_main").get("LYD", 0) < 700000:
                continue
            tid = next_id("tr")
            res = call("POST", "/transfers", who=user, tag="transfers",
                       json={"id": tid, "source_type": "vault", "source_id": "v_main", "source_name": "الخزنة الرئيسية", "dest_type": "vault", "dest_id": vault,
                             "dest_name": VAULTS[vault][0], "currency": "LYD", "amount": float(rng.choice([80000, 100000, 120000])),
                             "notes": "تخصيص سيولة أسبوعي", "details": "تغذية الفرع بالسيولة الأسبوعية"})
            if res is not None:
                call("POST", f"/approvals/apr_tr_{tid}/action", params={"action": "approve"}, tag="approvals")
    # customers moving money between themselves
    if rng.random() < 0.15:
        a, b = rng.sample(CUSTOMER_IDS, 2)
        have = customer_balances().get(a, {}).get("LYD", 0)
        if have > 4000:
            call("POST", f"/customers/{a}/transfer", who="admin", tag="customer_ops",
                 json={"to_customer_id": b, "currency": "LYD", "amount": float(round(have * 0.3 / 100) * 100), "notes": "تحويل بين عميلين", "details": "تسوية مستحقات بين العميلين"})
    # expenses (records only)
    if day.day == 1:
        call("POST", "/daily-expenses", who="admin", tag="expenses", json={"id": next_id("exp"), "date": day.isoformat(), "category": "rent", "amount": 9000.0, "currency": "LYD", "description": "إيجار المقر الرئيسي"})
    if day.day == 25:
        call("POST", "/daily-expenses", who="admin", tag="expenses", json={"id": next_id("exp"), "date": day.isoformat(), "category": "salaries", "amount": 24000.0, "currency": "LYD", "description": "رواتب الموظفين"})
    if day.day == 15:
        call("POST", "/daily-expenses", who="admin", tag="expenses", json={"id": next_id("exp"), "date": day.isoformat(), "category": "electricity", "amount": 1350.0, "currency": "LYD", "description": "فاتورة الكهرباء"})
    if rng.random() < 0.08:
        call("POST", "/daily-expenses", who="admin", tag="expenses", json={"id": next_id("exp"), "date": day.isoformat(), "category": "maintenance", "amount": float(rng.choice([250, 400, 700])), "currency": "LYD", "description": "صيانة أجهزة وتكييف"})


DEBTS: list[dict] = []
ADVANCES: list[dict] = []


def credit_activity(day: _dt.date):
    if rng.random() < 0.12:
        cust = rng.choice(CUSTOMER_IDS)
        did = next_id("debt")
        amount = float(rng.choice([2000, 3500, 5000, 8000]))
        due = (day + _dt.timedelta(days=30)).isoformat()
        if call("POST", "/debts", who="admin", tag="debts",
                json={"id": did, "customer_id": cust, "customer_name": CUSTOMER_NAME[cust], "currency": "LYD", "amount": amount,
                      "start_date": day.isoformat(), "due_date": due, "payment_period": "monthly", "payment_amount": round(amount / 4),
                      "notes": "دين على شراء عملة"}) is not None:
            DEBTS.append({"id": did, "left": amount})
    if DEBTS and rng.random() < 0.18:
        d = rng.choice(DEBTS)
        pay = float(min(d["left"], rng.choice([500, 1000, 1500])))
        if pay > 0 and call("POST", f"/debts/{d['id']}/pay", who="admin", json={"amount": pay, "notes": "دفعة سداد"}, tag="debts") is not None:
            d["left"] -= pay
    if rng.random() < 0.08:
        cust = rng.choice(CUSTOMER_IDS)
        aid = next_id("adv")
        amount = float(rng.choice([1000, 2000, 3000]))
        if call("POST", "/advances", who="admin", tag="advances",
                json={"id": aid, "customer_id": cust, "customer_name": CUSTOMER_NAME[cust], "currency": "LYD", "amount": amount, "vault_id": "v_main", "notes": "سلفة على الراتب"}) is not None:
            ADVANCES.append({"id": aid, "left": amount})
    if ADVANCES and rng.random() < 0.15:
        a = rng.choice(ADVANCES)
        pay = float(min(a["left"], 1000))
        if pay > 0 and call("POST", f"/advances/{a['id']}/pay", who="admin", json={"amount": pay, "vault_id": "v_main", "notes": "سداد دفعة من السلفة"}, tag="advances") is not None:
            a["left"] -= pay


FLEET = {"vehicles": [], "accounts": {}}
FLEET_COMPANIES = [("/fleet", "بيان الدولية"), ("/imtiaz/fleet", "الامتياز"), ("/itqan/fleet", "اتقن المحركات")]
FLEET_STOCK = {
    "/fleet": [("هيونداي أكسنت 2019", "سيارة"), ("تويوتا هايلكس 2021", "سيارة"), ("كيا سبورتاج 2020", "سيارة"), ("نيسان صني 2018", "سيارة")],
    "/imtiaz/fleet": [("حفارة كاتربيلر 320", "معدة"), ("رافعة شوكية تويوتا 3 طن", "معدة"), ("شاحنة مرسيدس أكتروس", "شاحنة")],
    "/itqan/fleet": [("هيونداي إلنترا 2022", "سيارة"), ("فورد إكسبلورر 2017", "سيارة"), ("ميتسوبيشي L200 2020", "سيارة")],
}


def fleet_setup(day: _dt.date):
    for prefix, company in FLEET_COMPANIES:
        # a cash wallet already exists per company; give each company a bank account too
        acct = call("POST", f"{prefix}/accounts", who="admin", tag="fleet",
                    json={"name": f"حساب {company} - مصرف الجمهورية", "currency": "LYD", "account_type": "company", "account_number": str(rng.randint(10**9, 10**10 - 1)), "bank_name": "مصرف الجمهورية"})
        FLEET["accounts"][prefix] = acct["id"] if isinstance(acct, dict) and "id" in acct else None
        # Opening cash in the company's wallet. The app has no screen for an opening balance (a wallet
        # is only ever charged by ledger entries, which would count as income), so it is set directly here.
        key = {"/fleet": "bayan", "/imtiaz/fleet": "imtiaz", "/itqan/fleet": "itqan"}[prefix]
        was_on, Clock.on = Clock.on, False
        db = SessionLocal()
        try:
            from app.routers.fleet import _get_cash_wallet  # the wallet is created on first use
            wallet = _get_cash_wallet(db, "LYD", key)
            wallet.balance = 650000.0
            db.commit()
        finally:
            db.close()
            Clock.on = was_on
        # one vehicle the company already owned (no purchase entry)
        call("POST", f"{prefix}/vehicles", who="admin", tag="fleet",
             json={"name": rng.choice(["ميتسوبيشي باجيرو 2015", "تويوتا كورولا 2016", "هيونداي سوناتا 2016"]) + " (ملك الشركة)", "type": "سيارة",
                   "serial_number": f"SN{rng.randint(100000, 999999)}", "chassis_number": f"CH{rng.randint(10**9, 10**10 - 1)}", "color": "أبيض",
                   "manufacture_date": "2016", "status": "عرض", "purchase_price": 0.0, "currency": "LYD", "notes": "من أصول الشركة"})
        for i, (name, vtype) in enumerate(FLEET_STOCK[prefix]):
            price = float(rng.choice([28000, 36000, 45000, 58000, 72000, 95000]))
            vehicle = call("POST", f"{prefix}/vehicles", who="admin", tag="fleet",
                           json={"name": name, "type": vtype, "serial_number": f"SN{rng.randint(100000, 999999)}", "chassis_number": f"CH{rng.randint(10**9, 10**10 - 1)}",
                                 "color": rng.choice(["أبيض", "أسود", "فضي", "رمادي", "أزرق"]), "manufacture_date": str(rng.randint(2017, 2022)), "status": "عرض",
                                 "purchase_date": day.isoformat(), "purchase_price": price, "purchase_payment_method": "cash", "seller_name": rng.choice(["معرض الفاتح للسيارات", "شركة النخبة", "مزاد طرابلس"]),
                                 "currency": "LYD", "notes": "دخلت المخزن حديثاً"})
            if isinstance(vehicle, dict) and vehicle.get("id"):
                FLEET["vehicles"].append((prefix, vehicle["id"], price))


def fleet_activity(day: _dt.date):
    if not FLEET["vehicles"]:
        return
    for _ in range(rng.choice([0, 1, 2, 2, 3])):
        prefix, vid, price = rng.choice(FLEET["vehicles"])
        income = rng.random() < 0.68
        category = rng.choice(["إيجار", "إيجار", "عمولة وساطة"]) if income else rng.choice(["وقود", "صيانة", "تأمين", "غسيل وتنظيف", "إطارات"])
        amount = float(rng.choice([1500, 2200, 3000, 4500, 7000, 9500])) if income else float(rng.choice([150, 300, 450, 900, 1800]))
        call("POST", f"{prefix}/vehicles/{vid}/transactions", who="admin", tag="fleet",
             json={"type": "income" if income else "expense", "category": category, "amount": amount, "currency": "LYD", "date": day.isoformat(),
                   "counterparty": rng.choice(["العميل أحمد", "شركة الأفق", "ورشة النصر", "محطة الوقود", "مكتب التأمين"]), "notes": ""})


def fleet_showcase(day: _dt.date):
    """One sale per company (shows profit) and one damage report."""
    for prefix, _company in FLEET_COMPANIES:
        mine = [v for v in FLEET["vehicles"] if v[0] == prefix]
        if len(mine) < 3:
            continue
        _p, vid, price = mine[0]
        if call("POST", f"{prefix}/vehicles/{vid}/sell", who="admin", tag="fleet",
                json={"buyer_name": rng.choice(["مؤسسة الأفق للنقل", "شركة المدار", "السيد رضا الهوني"]), "sale_price": round(price * rng.uniform(1.12, 1.25), -2),
                      "sale_date": day.isoformat(), "sale_payment_method": "cash", "notes": "بيع نقدي"}) is not None:
            FLEET["vehicles"] = [v for v in FLEET["vehicles"] if v[1] != vid]
        _p, vid2, _price2 = mine[1]
        call("POST", f"{prefix}/vehicles/{vid2}/damage", who="admin", tag="fleet",
             json={"date": day.isoformat(), "description": rng.choice(["خدش بالمصد الأمامي", "كسر في المرآة الجانبية", "تلف في الإطار الخلفي"]),
                   "cost": float(rng.choice([350, 600, 900])), "currency": "LYD", "reported_by": "مشرف الأسطول", "status": "مُبلغ عنه"})


# ---- 8. features worth showing in a walkthrough ------------------------------
def last_trade_of(vault_id: str, want_type: str | None = None, method: str | None = None):
    """The vault's most recent trade, but only if no other movement came after it."""
    moves = get(f"/movements?entity_type=vault&entity_id={vault_id}") or []
    if not moves:
        return None
    last_ts = max(m["timestamp"] for m in moves)
    for t in sorted(get("/transactions") or [], key=lambda t: t["timestamp"], reverse=True):
        if t["vaultId"] != vault_id or t["status"] != "approved" or t["type"] not in ("buy", "sell"):
            continue
        if (want_type and t["type"] != want_type) or (method and t["paymentMethod"] != method):
            continue
        if t["timestamp"] >= last_ts and not any(m["timestamp"] > t["timestamp"] and m.get("referenceId") != t["id"] for m in moves):
            return t
        return None
    return None


def showcase_edits(day: _dt.date, step: int) -> bool:
    """A few corrections, so the edit / undo history is visible in the demo."""
    if step == 1:  # a customer deposit entered as deposit but should be a withdrawal
        cust = CUSTOMER_IDS[1]
        res = call("POST", f"/customers/{cust}/deposit", who="tripoli", tag="customer_ops",
                   json={"vault_id": "v_tripoli", "currency": "LYD", "amount": 4000.0, "notes": "إيداع بالخطأ", "details": "إيداع نقدي"})
        if res and res.get("id"):
            call("PUT", f"/customers/{cust}/entries/{res['id']}", who="admin", tag="edits",
                 json={"amount": 4000.0, "reason": "اختار الموظف إيداعاً بدل السحب", "type": "withdraw", "details": "سحب نقدي بدل الإيداع"})
    elif step == 2:  # a bank deposit with the wrong amount
        res = call("POST", f"/bank_accounts/{LYD_BANK}/deposit", who="treasurer", tag="bank_ops",
                   json={"currency": "LYD", "amount": 35000.0, "other_source": "شيك مقاصة", "notes": "", "details": "إيداع شيك مقاصة"})
        accts = get(f"/bank_accounts/{LYD_BANK}/statement") or {}
        ids = [i for sec in (accts.get("entryIds") or {}).values() for i in sec if i and i.startswith("bae_deposit")]
        if ids:
            call("PUT", f"/bank_accounts/{LYD_BANK}/movements/{ids[-1]}", who="admin", tag="edits",
                 json={"amount": 53000.0, "reason": "خطأ في كتابة المبلغ (35 بدل 53)", "notes": "بعد التصحيح"})
    elif step == 3:  # a trade reversed after the customer cancelled
        t = last_trade_of("v_tripoli")
        if not t:
            return False
        if t:
            res = call("POST", f"/transactions/{t['id']}/request-reversal", who="accountant", json={"reason": "العميل ألغى العملية قبل التسليم"}, tag="edits")
            aps = [a for a in (get("/approvals") or []) if a.get("referenceId") == t["id"] and a["status"] == "pending"]
            if aps:
                call("POST", f"/approvals/{aps[0]['id']}/action", params={"action": "approve"}, tag="approvals")
    elif step == 4:  # a trade where the rate was typed wrong
        t = last_trade_of("v_misrata", want_type="buy", method="cash")
        if not t:
            return False
        if t:
            call("PUT", f"/transactions/{t['id']}", who="admin", tag="edits",
                 json={"amount": t["amount"], "rate": round(t["rate"] + 0.01, 4), "commission": t["commission"], "details": "تصحيح سعر الصرف"})
    elif step == 5:  # a transfer sent to the wrong account, then re-aimed
        tid = next_id("tr")
        res = call("POST", "/transfers", who="treasurer", tag="transfers",
                   json={"id": tid, "source_type": "bank_account", "source_id": "ba_rep_lyd", "source_name": "مصرف الجمهورية - الحساب الجاري الرئيسي (حساب بنكي)",
                         "dest_type": "bank_account", "dest_id": "ba_ncb_lyd", "dest_name": "المصرف التجاري الوطني - حساب العمليات (حساب بنكي)",
                         "currency": "LYD", "amount": 70000.0, "notes": "تحويل بين مصرفين"})
        if res is not None:
            call("POST", f"/approvals/apr_tr_{tid}/action", params={"action": "approve"}, tag="approvals")
            call("PUT", f"/transfers/{tid}", who="admin", tag="edits",
                 json={"amount": 70000.0, "reason": "المبلغ يخص المصرف الآخر - عكس الاتجاه",
                       "source_type": "bank_account", "source_id": "ba_ncb_lyd", "source_name": "المصرف التجاري الوطني - حساب العمليات (حساب بنكي)",
                       "dest_type": "bank_account", "dest_id": "ba_rep_lyd", "dest_name": "مصرف الجمهورية - الحساب الجاري الرئيسي (حساب بنكي)"})
    return True


def interest_showcase():
    dep = call("POST", f"/bank_accounts/ba_sah_usd/deposits", who="treasurer", tag="bank_ops",
               json={"amount": 30000.0, "interest_rate": 3.5, "notes": "وديعة لمدة 6 أشهر"})
    if isinstance(dep, dict) and dep.get("id"):
        call("POST", f"/bank_deposits/{dep['id']}/calculate_interest", who="treasurer", tag="bank_ops")
        call("POST", f"/bank_deposits/{dep['id']}/credit_interest", who="treasurer", tag="bank_ops")


# ---- 9. the timeline -----------------------------------------------------------
BRANCH_PLAN = {  # vault: (user, trades per day (lo, hi), cash ops per day (lo, hi))
    "v_main": ("admin", (4, 7), (1, 2)),
    "v_tripoli": ("tripoli", (10, 16), (3, 5)),
    "v_misrata": ("misrata", (5, 9), (2, 3)),
    "v_benghazi": ("benghazi", (4, 8), (1, 3)),
}
SHOWCASE_AT = {0.30: 1, 0.45: 2, 0.58: 3, 0.70: 4, 0.82: 5}  # fraction of the timeline -> showcase step


def drift_rates(day: _dt.date):
    for rid, row in RATES.items():
        ccy, buy, sell = row
        step = 0.012 if ccy not in ("TRY",) else 0.002
        move = rng.uniform(-step, step)
        row[1] = round(max(buy + move, 0.05), 4)
        row[2] = round(row[1] + (sell - buy), 4)
    for rid, (ccy, buy, sell) in RATES.items():
        call("PUT", f"/currencies/rates/{rid}", who="treasurer", tag="rates",
             json={"id": rid, "fromCurrency": ccy, "toCurrency": "LYD", "buyRate": buy, "sellRate": sell, "minRate": round(buy - 0.35 * (1 if ccy != "TRY" else 0.1), 4),
                   "maxRate": round(sell + 0.35 * (1 if ccy != "TRY" else 0.1), 4), "marketRate": round((buy + sell) / 2, 4),
                   "validFrom": f"{day.isoformat()} 08:00", "validTo": f"{day.isoformat()} 23:59", "isActive": True,
                   "lastUpdated": f"{day.isoformat()} 08:15", "updatedBy": USERS["treasurer"][1], "notes": "تحديث الأسعار الصباحي"})


def run_day(day: _dt.date, idx: int, total: int, is_today: bool = False):
    set_clock(day, 8 * 60 + 10)
    drift_rates(day)
    events: list[tuple[int, int, callable]] = []
    order = 0

    def add(minute, fn):
        nonlocal order
        order += 1
        events.append((minute, order, fn))

    for vault, (user, (t_lo, t_hi), (c_lo, c_hi)) in BRANCH_PLAN.items():
        if vault not in ("v_tripoli", "v_main") and rng.random() < 0.18:
            continue  # a smaller branch is closed some days
        add(9 * 60 + rng.randint(0, 25), lambda v=vault, u=user: open_shift(v, u, day))
        n_trades = rng.randint(t_lo, t_hi)
        n_cash = rng.randint(c_lo, c_hi)
        if is_today:
            n_trades, n_cash = max(2, n_trades // 3), 1
        now_min = RealDatetime.utcnow().hour * 60 + RealDatetime.utcnow().minute
        horizon = max(9 * 60 + 50, min(11 * 60 + 40, now_min)) if is_today else (19 * 60)
        for _ in range(n_trades):
            add(rng.randint(9 * 60 + 30, horizon), lambda v=vault, u=user: do_trade(v, u))
        for _ in range(n_cash):
            add(rng.randint(9 * 60 + 40, horizon), lambda v=vault, u=user: do_customer_cash(v, u))
        if not is_today:
            add(19 * 60 + 20 + rng.randint(0, 40), lambda v=vault, u=user: close_shift(v, u, leave_pending=(idx == total - 1 and v == "v_misrata")))
    add(10 * 60 + 30, lambda: treasury_day(day, idx))
    add(12 * 60, lambda: credit_activity(day))
    add(13 * 60, lambda: fleet_activity(day))
    events.sort(key=lambda e: (e[0], e[1]))
    last = 8 * 60 + 15
    for minute, _o, fn in events:
        minute = max(minute, last)
        last = minute
        set_clock(day, minute)
        fn()


def main():
    today = RealDatetime.utcnow().date()  # the app stamps UTC, so "today" is the UTC date
    start = today - _dt.timedelta(days=args.days)
    t0 = time.time()
    print(f"building demo data: {start} -> {today} (seed {args.seed})")
    setup_world(start)
    set_clock(start, 8 * 60 + 30)
    fleet_setup(start)
    days = [start + _dt.timedelta(days=i) for i in range(args.days + 1)]
    work_days = [d for d in days if d.weekday() != 4]  # Friday off
    done_steps = set()
    for i, d in enumerate(work_days):
        is_today = d == today
        run_day(d, i, len(work_days), is_today=is_today)
        frac = i / max(len(work_days) - 1, 1)
        for at, step in SHOWCASE_AT.items():
            if frac >= at and step not in done_steps:
                set_clock(d, 21 * 60 + 30)  # after the day's last event, so the ledger stays in time order
                if showcase_edits(d, step):
                    done_steps.add(step)  # otherwise it is retried on the next day
        if i == int(len(work_days) * 0.6):
            set_clock(d, 21 * 60 + 50)
            fleet_showcase(d)
        if i == int(len(work_days) * 0.4):
            set_clock(d, 21 * 60 + 45)
            interest_showcase()
        if i % 10 == 0:
            print(f"  day {i + 1}/{len(work_days)} ({d})  problems so far: {len(problems)}")
    # leave a pending transfer + pending reversal request for the "approvals" screen
    set_clock(today, 11 * 60 + 50)
    tid = next_id("tr")
    call("POST", "/transfers", who="misrata", tag="transfers",
         json={"id": tid, "source_type": "vault", "source_id": "v_main", "source_name": "الخزنة الرئيسية", "dest_type": "vault", "dest_id": "v_misrata",
               "dest_name": VAULTS["v_misrata"][0], "currency": "USD", "amount": 8000.0, "notes": "تغذية دولار لفرع مصراتة", "details": "تغذية سيولة دولار"})
    Clock.on = False
    print(f"\ndone in {time.time() - t0:.0f}s")
    print("created:", ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    print(f"problems: {len(problems)}")
    for p in problems[:25]:
        print("  -", p)


main()
