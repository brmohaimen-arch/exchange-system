import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from pydantic import BaseModel
from ..database import get_db
from ..models import Transaction, Debt, Customer, ExchangeRate, User, ApprovalRequest, AuditAction
from ..core.responses import success_response
from ..core.errors import APIError
from ..core.export_labels import TX_TYPE_LABELS_AR, DEBT_STATUS_LABELS_AR
from ..auth_deps import require_permission
from ..export_utils import build_excel, build_pdf, ArabicFontUnavailable
from ..whatsapp_gateway import send_whatsapp_document, get_setting as get_whatsapp_setting
from ..tracking import create_audit_log
from datetime import datetime, timedelta

router = APIRouter(prefix="/reports", tags=["Reports"])

EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PDF_MIME = "application/pdf"

def _build_export_bytes(fmt: str, title: str, headers: list[str], rows: list[list]) -> tuple[bytes, str]:
    """Renders a report to raw bytes plus its file extension — the one place both
    the direct-download export endpoints and the send-via-WhatsApp endpoint build
    the actual file from, so the two can never drift apart."""
    if fmt == "xlsx":
        return build_excel(title, headers, rows).read(), "xlsx"
    elif fmt == "pdf":
        try:
            buf = build_pdf(title, headers, rows)
        except ArabicFontUnavailable as e:
            raise APIError(code="FONT_UNAVAILABLE", message_ar="تعذر إنشاء ملف PDF: لم يتم العثور على خط يدعم اللغة العربية على هذا الجهاز", message_en=str(e), status_code=500)
        return buf.read(), "pdf"
    else:
        raise APIError(code="INVALID_FORMAT", message_ar="صيغة التصدير غير مدعومة، استخدم xlsx أو pdf", message_en="Unsupported export format, use xlsx or pdf", status_code=400)

def _export_response(fmt: str, title: str, headers: list[str], rows: list[list], filename: str):
    content, ext = _build_export_bytes(fmt, title, headers, rows)
    media_type = EXCEL_MIME if ext == "xlsx" else PDF_MIME
    # A PDF renders natively in the browser — open it inline instead of forcing a
    # download-then-reopen round trip. An .xlsx has no in-browser viewer, so it still
    # has to be saved to disk.
    disposition = "inline" if ext == "pdf" else "attachment"
    return StreamingResponse(io.BytesIO(content), media_type=media_type, headers={"Content-Disposition": f'{disposition}; filename="{filename}.{ext}"'})


def _tx_to_dict(t: Transaction) -> dict:
    return {
        "id": t.id,
        "type": t.type,
        "timestamp": t.timestamp,
        "vaultId": t.vault_id,
        "vaultName": t.vault_name,
        "customerId": t.customer_id,
        "customerName": t.customer_name,
        "fromCurrency": t.from_currency,
        "toCurrency": t.to_currency,
        "amount": t.amount,
        "rate": t.rate,
        "commission": t.commission,
        "totalAmount": t.total_amount,
        "paymentMethod": t.payment_method,
        "status": t.status,
        "user": t.user,
        "branch": t.branch,
        "expectedProfit": t.expected_profit,
        "notes": t.notes,
    }


@router.get("/profit")
def get_profit_report(
    date_from: str = "",
    date_to: str = "",
    db: Session = Depends(get_db),
):
    """Return all exchange transactions with their expected_profit values for the date range."""
    query = select(Transaction).where(
        Transaction.type.in_(["buy", "sell", "exchange"]),
        Transaction.status == "approved",
    )
    if date_from:
        query = query.where(Transaction.timestamp >= date_from)
    if date_to:
        # Include the whole day
        query = query.where(Transaction.timestamp <= date_to + "T23:59:59")

    txs = db.scalars(query.order_by(Transaction.timestamp.desc())).all()

    total_profit = sum(t.expected_profit or 0.0 for t in txs)
    buy_count = sum(1 for t in txs if t.type == "buy")
    sell_count = sum(1 for t in txs if t.type == "sell")
    exchange_count = sum(1 for t in txs if t.type == "exchange")

    # Volume per currency (only count the from_currency amount for exchange ops)
    volume_by_currency: dict[str, float] = {}
    for t in txs:
        volume_by_currency[t.from_currency] = (
            volume_by_currency.get(t.from_currency, 0.0) + t.amount
        )

    # Doc requirement: profit visibility broken down by branch and by cashier,
    # not just a single office-wide total.
    profit_by_branch: dict[str, dict] = {}
    profit_by_cashier: dict[str, dict] = {}
    for t in txs:
        b = profit_by_branch.setdefault(t.branch or "—", {"profit": 0.0, "count": 0})
        b["profit"] += t.expected_profit or 0.0
        b["count"] += 1
        c = profit_by_cashier.setdefault(t.user or "—", {"profit": 0.0, "count": 0})
        c["profit"] += t.expected_profit or 0.0
        c["count"] += 1
    for d in profit_by_branch.values():
        d["profit"] = round(d["profit"], 4)
    for d in profit_by_cashier.values():
        d["profit"] = round(d["profit"], 4)

    return success_response(
        data={
            "summary": {
                "totalProfit": round(total_profit, 4),
                "buyCount": buy_count,
                "sellCount": sell_count,
                "exchangeCount": exchange_count,
                "totalTx": len(txs),
                "volumeByCurrency": volume_by_currency,
                "profitByBranch": profit_by_branch,
                "profitByCashier": profit_by_cashier,
            },
            "transactions": [_tx_to_dict(t) for t in txs],
        }
    )


def _profit_report_data(db: Session, date_from: str = "", date_to: str = ""):
    query = select(Transaction).where(Transaction.type.in_(["buy", "sell", "exchange"]), Transaction.status == "approved")
    if date_from:
        query = query.where(Transaction.timestamp >= date_from)
    if date_to:
        query = query.where(Transaction.timestamp <= date_to + "T23:59:59")
    txs = db.scalars(query.order_by(Transaction.timestamp.desc())).all()

    headers = ["رقم العملية", "النوع", "التاريخ", "العميل", "من عملة", "إلى عملة", "المبلغ", "السعر", "العمولة", "الربح المتوقع"]
    rows = [[t.id, TX_TYPE_LABELS_AR.get(t.type, t.type), t.timestamp, t.customer_name, t.from_currency, t.to_currency, t.amount, t.rate, t.commission, round(t.expected_profit or 0.0, 3)] for t in txs]
    return "تقرير الأرباح", headers, rows

@router.get("/profit/export")
def export_profit_report(
    format: str = "xlsx",
    date_from: str = "",
    date_to: str = "",
    actor: User = Depends(require_permission("رؤية الأرباح")),
    db: Session = Depends(get_db),
):
    title, headers, rows = _profit_report_data(db, date_from, date_to)
    return _export_response(format, title, headers, rows, "profit_report")

@router.get("/debts-summary")
def get_debts_summary(db: Session = Depends(get_db)):
    """Return open/overdue debt aggregates for the dashboard alert system."""
    today = datetime.now().date().isoformat()

    all_debts = db.scalars(
        select(Debt).where(Debt.status != "paid", Debt.status != "cancelled")
    ).all()

    week_from_now = (datetime.now().date() + timedelta(days=7)).isoformat()
    overdue = [d for d in all_debts if d.due_date and d.due_date < today]
    due_soon = [
        d
        for d in all_debts
        if d.due_date and today <= d.due_date <= week_from_now
    ]
    total_open = sum(d.remaining_amount for d in all_debts)
    total_overdue = sum(d.remaining_amount for d in overdue)

    return success_response(
        data={
            "openCount": len(all_debts),
            "overdueCount": len(overdue),
            "dueSoonCount": len(due_soon),
            "totalOpen": round(total_open, 2),
            "totalOverdue": round(total_overdue, 2),
            "debts": [
                {
                    "id": d.id,
                    "customerName": d.customer_name,
                    "amount": d.amount,
                    "remainingAmount": d.remaining_amount,
                    "dueDate": d.due_date,
                    "status": d.status,
                    "currency": d.currency,
                }
                for d in all_debts
            ],
        }
    )

def _debts_summary_data(db: Session, date_from: str = "", date_to: str = ""):
    all_debts = db.scalars(select(Debt).where(Debt.status != "paid", Debt.status != "cancelled")).all()
    headers = ["رقم الدين", "العميل", "المبلغ", "المتبقي", "العملة", "تاريخ الاستحقاق", "الحالة"]
    rows = [[d.id, d.customer_name, d.amount, d.remaining_amount, d.currency, d.due_date, DEBT_STATUS_LABELS_AR.get(d.status, d.status)] for d in all_debts]
    return "ملخص الديون", headers, rows

@router.get("/debts-summary/export")
def export_debts_summary(format: str = "xlsx", actor: User = Depends(require_permission("رؤية التقارير")), db: Session = Depends(get_db)):
    title, headers, rows = _debts_summary_data(db)
    return _export_response(format, title, headers, rows, "debts_summary")


# ----------------- CANCELLED / REVERSED TRANSACTIONS -----------------
def _cancelled_tx_rows(db: Session) -> list[dict]:
    txs = db.scalars(
        select(Transaction).where(Transaction.status == "reversed").order_by(Transaction.timestamp.desc())
    ).all()
    # The reversal reason and who requested it live on the ApprovalRequest that
    # drove the reversal (Transaction itself only knows it ended up reversed).
    approvals_by_tx = {
        a.reference_id: a
        for a in db.scalars(
            select(ApprovalRequest).where(ApprovalRequest.type == "reversal", ApprovalRequest.reference_id.in_([t.id for t in txs]))
        ).all()
    } if txs else {}

    rows = []
    for t in txs:
        approval = approvals_by_tx.get(t.id)
        rows.append({
            **_tx_to_dict(t),
            "reversalReason": approval.details if approval else None,
            "reversalRequestedBy": approval.requested_by if approval else None,
            "reversalRequestedAt": approval.timestamp if approval else None,
        })
    return rows


@router.get("/cancelled-transactions")
def get_cancelled_transactions(actor: User = Depends(require_permission("رؤية التقارير")), db: Session = Depends(get_db)):
    return success_response(data=_cancelled_tx_rows(db))


def _cancelled_tx_data(db: Session, date_from: str = "", date_to: str = ""):
    rows_data = _cancelled_tx_rows(db)
    headers = ["رقم العملية", "النوع", "العميل", "المبلغ", "الإجمالي", "بواسطة", "الفرع", "التاريخ", "سبب الإلغاء", "طلب الإلغاء بواسطة"]
    rows = [[
        r["id"], TX_TYPE_LABELS_AR.get(r["type"], r["type"]), r["customerName"], r["amount"], r["totalAmount"], r["user"], r["branch"], r["timestamp"],
        r["reversalReason"] or "—", r["reversalRequestedBy"] or "—",
    ] for r in rows_data]
    return "العمليات الملغاة", headers, rows

@router.get("/cancelled-transactions/export")
def export_cancelled_transactions(format: str = "xlsx", actor: User = Depends(require_permission("رؤية التقارير")), db: Session = Depends(get_db)):
    title, headers, rows = _cancelled_tx_data(db)
    return _export_response(format, title, headers, rows, "cancelled_transactions")


# ----------------- SEND REPORT VIA WHATSAPP -----------------
REPORT_DATA_BUILDERS = {
    "profit": _profit_report_data,
    "debts-summary": _debts_summary_data,
    "cancelled-transactions": _cancelled_tx_data,
}

class ReportWhatsappRequest(BaseModel):
    report: str
    format: str = "pdf"
    date_from: str = ""
    date_to: str = ""

@router.post("/send_whatsapp")
def send_report_whatsapp(data: ReportWhatsappRequest, actor: User = Depends(require_permission("رؤية التقارير")), db: Session = Depends(get_db)):
    builder = REPORT_DATA_BUILDERS.get(data.report)
    if not builder:
        raise APIError(code="INVALID_REPORT", message_ar="نوع التقرير غير معروف", message_en="Unknown report type", status_code=400)
    manager_phone = get_whatsapp_setting(db, "whatsappManagerPhone", "")
    if not manager_phone:
        raise APIError(code="NO_PHONE", message_ar="لم يتم تحديد رقم هاتف المدير في الإعدادات لاستقبال التقارير", message_en="No manager phone configured in settings to receive reports", status_code=400)

    title, headers, rows = builder(db, data.date_from, data.date_to)
    content, ext = _build_export_bytes(data.format, title, headers, rows)
    filename = f"{title}.{ext}"
    result = send_whatsapp_document(db, manager_phone, content, filename, caption=title)
    if not result.get("sent"):
        raise APIError(code="WHATSAPP_SEND_FAILED", message_ar="تعذر إرسال التقرير عبر واتساب — تأكد من إعداد بوابة واتساب من الإعدادات", message_en=f"WhatsApp send failed: {result.get('reason')}", status_code=502)
    create_audit_log(db, action=AuditAction.SYSTEM_ALERT, entity_type="Report", entity_id=data.report, description=f"تم إرسال تقرير {title} عبر واتساب إلى {manager_phone}", username=actor.username)
    db.commit()
    return success_response(data={"sent": True}, message_ar="تم إرسال التقرير عبر واتساب بنجاح")
