"""Arabic display labels for the enum-like status/type fields stored in
English in the database (SQLAlchemy columns, JSON fields). Excel/PDF/WhatsApp
exports should read in Arabic end-to-end aside from numbers — raw values like
"partially_paid" or "approved" must never leak into a report row — so every
export builder across the app translates through this single shared table
instead of keeping its own copy that can drift out of sync with the UI."""

TX_TYPE_LABELS_AR = {
    "buy": "شراء عملة",
    "sell": "بيع عملة",
    "exchange": "تبديل عملة",
    "deposit": "إيداع في حساب عميل",
    "withdraw": "سحب من حساب عميل",
    "transfer_in": "تحويل وارد من عميل",
    "transfer_out": "تحويل صادر لعميل",
}

PAYMENT_METHOD_LABELS_AR = {
    "cash": "نقداً",
    "customer_account": "حساب العميل",
    "bank_account": "حساب بنكي",
    "debt": "دين (آجل)",
}

TX_STATUS_LABELS_AR = {
    "approved": "مكتمل",
    "pending": "قيد المعالجة",
    "reversed": "ملغي",
}

DEBT_STATUS_LABELS_AR = {
    "unpaid": "غير مسدد",
    "partially_paid": "مسدد جزئياً",
    "paid": "مسدد بالكامل",
}

JOURNAL_STATUS_LABELS_AR = {
    "approved": "معتمد",
    "reversed": "معكوس",
}
