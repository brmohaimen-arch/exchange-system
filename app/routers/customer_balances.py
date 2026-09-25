"""Customer balances report — who owes us and who we owe.

A customer's position in one currency is their NET: account balance, minus the
open debts (ديون) and the outstanding سلف they still owe. Positive = له (we owe
the customer), negative = عليه (the customer owes us) — the same rule the
statements use. The report can be split by side and by currency, or combined
across currencies with an approximate LYD equivalent (the currencies can't
honestly be added together otherwise).
"""

import re

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..arabic_numbers import amount_in_words, balance_side
from ..auth_deps import require_permission
from ..core.errors import APIError
from ..core.responses import success_response
from ..database import get_db
from ..export_utils import ArabicFontUnavailable, build_sectioned_excel, build_sectioned_pdf
from ..models import Advance, AuditAction, Customer, Debt, ExchangeRate, User
from ..tracking import create_audit_log
from ..whatsapp_gateway import get_setting as get_whatsapp_setting, send_whatsapp_document

router = APIRouter(tags=["Customer balances report"])

PERM = "رؤية سجل العمليات"
_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def _norm(text) -> str:
    """Folds Arabic spelling variants so 'احمد' finds 'أحمد'."""
    if text is None:
        return ""
    s = str(text).lower().translate(_DIGITS)
    s = re.sub(r"[ً-ٰٟـ]", "", s)
    s = re.sub(r"[أإآٱ]", "ا", s).replace("ى", "ي").replace("ة", "ه")
    return re.sub(r"\s+", " ", s).strip()


def _phone_core(text) -> str:
    d = re.sub(r"\D", "", _norm(text))
    if d.startswith("00"):
        d = d[2:]
    if d.startswith("218"):
        d = d[3:]
    return d.lstrip("0")


def _matches(query: str, customer: Customer) -> bool:
    q = _norm(query)
    if not q:
        return True
    hay = " | ".join(_norm(x) for x in (customer.name, customer.id, customer.id_number))
    if all(word in hay for word in q.split(" ")):
        return True
    digits = _phone_core(q)
    return len(digits) >= 3 and digits in _phone_core(customer.phone)


def _signed(v: float) -> str:
    return f"-{abs(v):,.2f}" if v < -0.004 else f"{abs(v):,.2f}"


def _lyd_rates(db: Session) -> dict[str, float]:
    rates = {"LYD": 1.0}
    for r in db.scalars(select(ExchangeRate).where(ExchangeRate.to_currency == "LYD")).all():
        rates[r.from_currency] = r.buy_rate
    return rates


def _positions(db: Session, currency: str, search: str) -> list[dict]:
    debts: dict[tuple[str, str], float] = {}
    for d in db.scalars(select(Debt).where(Debt.status != "paid")).all():
        debts[(d.customer_id, d.currency)] = debts.get((d.customer_id, d.currency), 0.0) + (d.remaining_amount or 0.0)
    advances: dict[tuple[str, str], float] = {}
    for a in db.scalars(select(Advance).where(Advance.status != "paid")).all():
        advances[(a.customer_id, a.currency)] = advances.get((a.customer_id, a.currency), 0.0) + (a.remaining_amount or 0.0)

    rows = []
    for c in db.scalars(select(Customer)).all():
        if not _matches(search, c):
            continue
        ccys = set(c.balances.keys()) | {k[1] for k in debts if k[0] == c.id} | {k[1] for k in advances if k[0] == c.id}
        for ccy in sorted(ccys):
            if currency and ccy != currency:
                continue
            bal = c.balances.get(ccy, 0.0)
            debt = debts.get((c.id, ccy), 0.0)
            adv = advances.get((c.id, ccy), 0.0)
            net = bal - debt - adv
            if abs(bal) < 0.005 and abs(debt) < 0.005 and abs(adv) < 0.005:
                continue
            rows.append({"id": c.id, "name": c.name, "phone": c.phone or "", "currency": ccy, "balance": bal, "debts": debt, "advances": adv, "net": net})
    return rows


def build_report(db: Session, side: str = "both", currency: str = "", search: str = "", min_amount: float = 0.0, view: str = "split", with_lyd: bool = True):
    """Returns (sections, closing_line, summary). side: both | owe_us | we_owe."""
    rates = _lyd_rates(db)
    positions = [p for p in _positions(db, currency, search) if abs(p["net"]) >= max(min_amount, 0.005)]
    show_lyd = with_lyd and view == "combined"
    headers = ["المرجع", "رقم العميل", "العميل", "الهاتف", "العملة", "الرصيد", "الديون", "السلف", "الصافي", "له / عليه"] + (["≈ د.ل"] if show_lyd else []) + ["الصافي بالحروف"]

    def lyd(p):
        return p["net"] * rates.get(p["currency"], 0.0)

    def make_rows(items: list[dict]) -> list[list]:
        rows = []
        for i, p in enumerate(items, start=1):
            row = [str(i), p["id"], p["name"], p["phone"] or "—", p["currency"], _signed(p["balance"]),
                   _signed(-p["debts"]) if p["debts"] else "0.00", _signed(-p["advances"]) if p["advances"] else "0.00",
                   _signed(p["net"]), balance_side(p["net"]) or "—"]
            if show_lyd:
                row.append(_signed(lyd(p)))
            row.append(amount_in_words(p["net"], p["currency"]))
            rows.append(row)
        # totals — one row per currency, then (combined view) the LYD estimate
        by_ccy: dict[str, list[float]] = {}
        for p in items:
            t = by_ccy.setdefault(p["currency"], [0.0, 0.0, 0.0, 0.0, 0.0])
            t[0] += p["balance"]; t[1] += p["debts"]; t[2] += p["advances"]; t[3] += p["net"]; t[4] += lyd(p)
        for ccy, t in by_ccy.items():
            row = ["", "", "الإجمالي", "", ccy, _signed(t[0]), _signed(-t[1]) if t[1] else "0.00", _signed(-t[2]) if t[2] else "0.00", _signed(t[3]), balance_side(t[3]) or "—"]
            if show_lyd:
                row.append(_signed(t[4]))
            row.append(amount_in_words(t[3], ccy))
            rows.append(row)
        if show_lyd and len(by_ccy) > 1:
            total_lyd = sum(t[4] for t in by_ccy.values())
            row = ["", "", "الإجمالي التقديري بالدينار", "", "LYD", "", "", "", "", balance_side(total_lyd) or "—", _signed(total_lyd), amount_in_words(total_lyd, "LYD")]
            rows.append(row)
        return rows

    sides = []
    if side in ("both", "owe_us"):
        sides.append(("عملاء عليهم — مطلوب منهم", [p for p in positions if p["net"] < 0], True))
    if side in ("both", "we_owe"):
        sides.append(("عملاء لهم — مطلوب لهم", [p for p in positions if p["net"] > 0], False))

    sections = []
    for title, items, owes in sides:
        items = sorted(items, key=lambda p: -abs(lyd(p)) if view == "combined" else -abs(p["net"]))
        if view == "combined":
            sections.append((f"{title} — كل العملات", headers, make_rows(items)))
        else:
            for ccy in sorted({p["currency"] for p in items}):
                sections.append((f"{title} — {ccy}", headers, make_rows([p for p in items if p["currency"] == ccy])))
    if not sections:
        sections.append(("لا توجد أرصدة مطابقة", headers, []))

    summary: dict[str, dict[str, float]] = {}
    for p in positions:
        s = summary.setdefault(p["currency"], {"oweUs": 0.0, "weOwe": 0.0, "oweUsCount": 0, "weOweCount": 0})
        if p["net"] < 0:
            s["oweUs"] += -p["net"]; s["oweUsCount"] += 1
        else:
            s["weOwe"] += p["net"]; s["weOweCount"] += 1
    closing = "الأرصدة مصنّفة حسب الصافي = الرصيد − الديون − السلف. عليه = العميل مدين لنا، له = نحن مدينون للعميل."
    return sections, closing, summary


def _params(side: str, view: str):
    if side not in ("both", "owe_us", "we_owe"):
        raise APIError(code="INVALID_SIDE", message_ar="الجانب يجب أن يكون: الكل أو عليهم أو لهم", message_en="side must be both, owe_us or we_owe", status_code=400)
    if view not in ("split", "combined"):
        raise APIError(code="INVALID_VIEW", message_ar="طريقة العرض غير صالحة", message_en="view must be split or combined", status_code=400)


@router.get("/customer_balances")
def get_customer_balances(side: str = "both", currency: str = "", search: str = "", min_amount: float = 0.0, view: str = "split", with_lyd: bool = True,
                          actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    _params(side, view)
    sections, closing, summary = build_report(db, side, currency, search, min_amount, view, with_lyd)
    return success_response(data={
        "sections": [{"name": n, "headers": h, "rows": r} for n, h, r in sections],
        "closingLine": closing, "summary": summary,
    })


def _file(sections, closing, title: str, fmt: str):
    if fmt == "xlsx":
        return build_sectioned_excel(sections), "xlsx"
    try:
        return build_sectioned_pdf(title, sections, closing), "pdf"
    except ArabicFontUnavailable as e:
        raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء الكشف: لم يتم العثور على خط يدعم اللغة العربية", message_en=str(e), status_code=500)


@router.get("/customer_balances/export")
def export_customer_balances(format: str = "pdf", side: str = "both", currency: str = "", search: str = "", min_amount: float = 0.0, view: str = "split", with_lyd: bool = True,
                             actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    _params(side, view)
    sections, closing, _ = build_report(db, side, currency, search, min_amount, view, with_lyd)
    buf, ext = _file(sections, closing, "كشف أرصدة العملاء", format)
    media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if ext == "xlsx" else "application/pdf"
    return StreamingResponse(buf, media_type=media, headers={"Content-Disposition": f'{"attachment" if ext == "xlsx" else "inline"}; filename="customer_balances.{ext}"'})


@router.post("/customer_balances/send_whatsapp")
def send_customer_balances_whatsapp(side: str = "both", currency: str = "", search: str = "", min_amount: float = 0.0, view: str = "split", with_lyd: bool = True,
                                    actor: User = Depends(require_permission(PERM)), db: Session = Depends(get_db)):
    _params(side, view)
    manager_phone = get_whatsapp_setting(db, "whatsappManagerPhone", "")
    if not manager_phone:
        raise APIError(code="NO_PHONE", message_ar="لم يتم تحديد رقم هاتف المدير في الإعدادات لاستقبال التقارير", message_en="No manager phone configured", status_code=400)
    sections, closing, _ = build_report(db, side, currency, search, min_amount, view, with_lyd)
    buf, _ext = _file(sections, closing, "كشف أرصدة العملاء", "pdf")
    result = send_whatsapp_document(db, manager_phone, buf.read(), "customer_balances.pdf", caption="كشف أرصدة العملاء")
    if not result.get("sent"):
        raise APIError(code="WHATSAPP_SEND_FAILED", message_ar="تعذر إرسال الكشف عبر واتساب — تأكد من إعداد بوابة واتساب من الإعدادات", message_en=f"WhatsApp send failed: {result.get('reason')}", status_code=502)
    create_audit_log(db, action=AuditAction.SYSTEM_ALERT, entity_type="Customer", entity_id="balances", description=f"تم إرسال كشف أرصدة العملاء عبر واتساب إلى {manager_phone}", username=actor.username)
    db.commit()
    return success_response(data={"sent": True}, message_ar="تم إرسال الكشف عبر واتساب بنجاح")
