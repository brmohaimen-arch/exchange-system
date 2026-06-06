from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from ..database import get_db
from ..models import Transaction, Debt, Customer, ExchangeRate
from ..core.responses import success_response
from datetime import datetime

router = APIRouter(prefix="/reports", tags=["Reports"])


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

    return success_response(
        data={
            "summary": {
                "totalProfit": round(total_profit, 4),
                "buyCount": buy_count,
                "sellCount": sell_count,
                "exchangeCount": exchange_count,
                "totalTx": len(txs),
                "volumeByCurrency": volume_by_currency,
            },
            "transactions": [_tx_to_dict(t) for t in txs],
        }
    )


@router.get("/debts-summary")
def get_debts_summary(db: Session = Depends(get_db)):
    """Return open/overdue debt aggregates for the dashboard alert system."""
    today = datetime.now().date().isoformat()

    all_debts = db.scalars(
        select(Debt).where(Debt.status != "paid", Debt.status != "cancelled")
    ).all()

    overdue = [d for d in all_debts if d.due_date and d.due_date < today]
    due_soon = [
        d
        for d in all_debts
        if d.due_date and today <= d.due_date <= (datetime.now().date().replace(day=datetime.now().day + 7)).isoformat()
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
