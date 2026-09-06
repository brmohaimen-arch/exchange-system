"""
Shared "ask it a question" reply logic for the chat-based assistants
(WhatsApp today, Telegram alongside it). Both routers/whatsapp.py and
routers/telegram.py forward an authorized sender's message text here and
relay whatever comes back — the keyword matching and the underlying data
queries only need to exist once.
"""

from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .models import Transaction, ApprovalRequest, ComplianceFlag, Notification, NotificationStatus, Vault


def build_reply(db: Session, text: str) -> str:
    t = text.strip().lower()
    today = datetime.utcnow().strftime("%Y-%m-%d")

    if any(k in t for k in ["ملخص", "اليوم", "today", "summary"]):
        txs = db.scalars(select(Transaction).where(Transaction.timestamp.like(f"{today}%"))).all()
        profit = sum(tx.expected_profit or 0.0 for tx in txs)
        pending_approvals = db.scalar(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.status == "pending")) or 0
        open_flags = db.scalar(select(func.count()).select_from(ComplianceFlag).where(ComplianceFlag.status == "pending")) or 0
        return (
            f"📊 ملخص اليوم ({today})\n"
            f"عدد العمليات: {len(txs)}\n"
            f"الأرباح المتوقعة: {profit:.2f} د.ل\n"
            f"موافقات معلقة: {pending_approvals}\n"
            f"عمليات تستوجب المراجعة: {open_flags}"
        )

    if any(k in t for k in ["تنبيه", "alert"]):
        unread = db.scalars(
            select(Notification).where(Notification.status == NotificationStatus.UNREAD).order_by(Notification.created_at.desc()).limit(5)
        ).all()
        if not unread:
            return "لا توجد تنبيهات غير مقروءة حالياً ✅"
        lines = [f"🔔 آخر {len(unread)} تنبيهات:"]
        lines += [f"- {n.title}: {n.message}" for n in unread]
        return "\n".join(lines)

    if any(k in t for k in ["موافق", "approval"]):
        pending = db.scalars(
            select(ApprovalRequest).where(ApprovalRequest.status == "pending").order_by(ApprovalRequest.timestamp.desc()).limit(5)
        ).all()
        if not pending:
            return "لا توجد طلبات موافقة معلقة حالياً ✅"
        lines = [f"📝 طلبات الموافقة المعلقة ({len(pending)}):"]
        lines += [f"- {a.title} ({a.amount} {a.currency or ''})" for a in pending]
        return "\n".join(lines)

    if any(k in t for k in ["رصيد", "خزن", "balance", "vault"]):
        vaults = db.scalars(select(Vault).where(Vault.is_active == True)).all()
        lines = ["💰 أرصدة الخزنات:"]
        for v in vaults:
            bal_str = " / ".join(f"{amt:,.0f} {ccy}" for ccy, amt in v.balances.items()) or "—"
            lines.append(f"- {v.name}: {bal_str}")
        return "\n".join(lines)

    return (
        "مرحباً 👋 يمكنك سؤالي عن:\n"
        "- \"ملخص اليوم\"\n"
        "- \"التنبيهات\"\n"
        "- \"الموافقات\"\n"
        "- \"الأرصدة\""
    )
