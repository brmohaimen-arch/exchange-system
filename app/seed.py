from datetime import datetime
from sqlalchemy.orm import Session
from .database import SessionLocal
from .auth_deps import hash_password
from .models import (
    User, Branch, Currency, ExchangeRate, RateHistory, Vault, Customer, Debt,
    Bank, BankBranch, BankAccount, Shift, Transaction, Movement, JournalEntry,
    AuditLog, LoginLog, InventoryCount, Reconciliation, ApprovalRequest, Transfer,
    FixedAsset, Vehicle, RealEstate, MaintenanceRecord, DepreciationRecord, AssetDocument,
    SystemSetting, Backup, AuditAction, NotificationType, NotificationStatus, Role,
    CurrencyDenomination
)

# The 6 roles from the requirements doc, expressed with the same permission
# vocabulary the frontend uses (src/config/permissions.ts ALL_PERMISSIONS).
# Companies can still add custom roles or edit these via the admin panel —
# these are just sane, working defaults for a fresh deployment.
ALL_PERMISSIONS = [
    'تنفيذ بيع عملة', 'تنفيذ شراء عملة', 'تحويل بين الخزنات', 'الموافقة على التحويلات',
    'إلغاء عملية', 'إنشاء عملية عكسية', 'إدارة العملاء', 'إدارة الديون', 'إدارة الخزنات',
    'فتح وردية', 'إغلاق وردية', 'اعتماد الإقفالات', 'إدارة العملات', 'تعديل أسعار الصرف',
    'إدارة البنوك', 'رؤية التقارير', 'رؤية سجل العمليات', 'رؤية الأرباح', 'إدارة الأصول',
    'إدارة المستخدمين', 'إدارة الفروع', 'إدارة الإعدادات'
]

DEFAULT_ROLES = {
    'مدير النظام': ALL_PERMISSIONS,
    'مدير الخزينة': ['إدارة الخزنات', 'تحويل بين الخزنات', 'الموافقة على التحويلات', 'اعتماد الإقفالات', 'إدارة البنوك', 'تعديل أسعار الصرف', 'رؤية التقارير', 'رؤية سجل العمليات', 'رؤية الأرباح'],
    'مدير فرع': ['فتح وردية', 'إغلاق وردية', 'اعتماد الإقفالات', 'إدارة العملاء', 'إدارة الديون', 'تحويل بين الخزنات', 'رؤية التقارير'],
    'صراف': ['تنفيذ بيع عملة', 'تنفيذ شراء عملة', 'تحويل بين الخزنات', 'إدارة العملاء', 'فتح وردية', 'إغلاق وردية', 'رؤية التقارير', 'إدارة الديون'],
    'محاسب': ['رؤية سجل العمليات', 'رؤية التقارير', 'رؤية الأرباح', 'إنشاء عملية عكسية', 'إدارة الديون'],
    'مراجع': ['رؤية التقارير', 'رؤية سجل العمليات', 'رؤية الأرباح'],
}

def seed_roles(db: Session):
    """Runs independently of the main seed guard so an existing deployment that
    predates the Role table (i.e. already has users) still gets the 6 default
    roles instead of being stuck with zero server-side permissions."""
    if db.query(Role).count() > 0:
        return
    for name, permissions in DEFAULT_ROLES.items():
        db.add(Role(name=name, permissions=permissions, is_system=True))
    db.commit()
    print(f"Seeded {len(DEFAULT_ROLES)} default roles.")


def seed_database(db: Session):
    seed_roles(db)

    # Check if already seeded
    if db.query(User).count() > 0:
        print("Database already contains data. Seeding skipped.")
        return

    print("Seeding database with clean, non-mock essential setup data...")

    # 1. Essential Branches
    branches = [
        Branch(id="الإدارة العامة", name="الإدارة العامة", city="طرابلس", address="برج طرابلس، الدور العاشر، طرابلس", phone="021-3600000", manager="سالم نوري", is_active=True, notes="مقر الإدارة والمراقبة والنسخ الاحتياطي الرئيسي"),
        Branch(id="فرع طرابلس", name="فرع طرابلس", city="طرابلس", address="شارع عمر المختار، طرابلس", phone="021-3330044", manager="أحمد علي", is_active=True, notes="فرع المبيعات المركزي في طرابلس")
    ]
    db.add_all(branches)
    db.flush()

    # 2. Main Users (No testing cashiers, only administrator)
    users = [
        User(id="u_admin", name="مدير النظام الرئيسي", username="admin", password=hash_password("123"), email="admin@cbs-exchange.ly", phone="091-0000000", role="مدير النظام", branch="الإدارة العامة", allowed_vault_id="v_main", is_active=True)
    ]
    db.add_all(users)
    db.flush()

    # 3. Essential Currencies
    currencies = [
        Currency(code="LYD", name_ar="دينار ليبي", name_en="Libyan Dinar", symbol="د.ل", country="ليبيا", flag="🇱🇾", decimal_places=3, is_active=True, last_updated="2026-05-28 10:00"),
        Currency(code="USD", name_ar="دولار أمريكي", name_en="US Dollar", symbol="$", country="الولايات المتحدة", flag="🇺🇸", decimal_places=2, is_active=True, last_updated="2026-05-28 10:00"),
        Currency(code="EUR", name_ar="يورو", name_en="Euro", symbol="€", country="الاتحاد الأوروبي", flag="🇪🇺", decimal_places=2, is_active=True, last_updated="2026-05-28 10:00"),
        Currency(code="TRY", name_ar="ليرة تركية", name_en="Turkish Lira", symbol="₺", country="تركيا", flag="🇹🇷", decimal_places=2, is_active=True, last_updated="2026-05-28 10:00"),
        Currency(code="GBP", name_ar="جنيه إسترليني", name_en="British Pound", symbol="£", country="المملكة المتحدة", flag="🇬🇧", decimal_places=2, is_active=True, last_updated="2026-05-28 10:00")
    ]
    db.add_all(currencies)
    db.flush()

    # 4. Standard Exchange Rates for basic operations
    rates = [
        ExchangeRate(id="rate_usd_lyd", from_currency="USD", to_currency="LYD", buy_rate=7.20, sell_rate=7.35, min_rate=7.00, max_rate=7.60, valid_from="2026-05-28 08:00", valid_to="2026-05-28 23:59", is_active=True, last_updated="2026-05-28 10:00", updated_by="سالم نوري"),
        ExchangeRate(id="rate_eur_lyd", from_currency="EUR", to_currency="LYD", buy_rate=7.80, sell_rate=8.00, min_rate=7.50, max_rate=8.30, valid_from="2026-05-28 08:00", valid_to="2026-05-28 23:59", is_active=True, last_updated="2026-05-28 10:00", updated_by="سالم نوري"),
        ExchangeRate(id="rate_try_lyd", from_currency="TRY", to_currency="LYD", buy_rate=0.22, sell_rate=0.25, min_rate=0.20, max_rate=0.30, valid_from="2026-05-28 08:00", valid_to="2026-05-28 23:59", is_active=True, last_updated="2026-05-28 10:00", updated_by="سالم نوري"),
        ExchangeRate(id="rate_gbp_lyd", from_currency="GBP", to_currency="LYD", buy_rate=9.10, sell_rate=9.35, min_rate=8.80, max_rate=9.70, valid_from="2026-05-28 08:00", valid_to="2026-05-28 23:59", is_active=True, last_updated="2026-05-28 10:00", updated_by="سالم نوري")
    ]
    db.add_all(rates)
    db.flush()

    # 5. Essential Main Vault
    vaults = [
        Vault(id="v_main", name="الخزنة الرئيسية", type="main", branch="الإدارة العامة", manager="سالم نوري", balances={"LYD": 1000000.0, "USD": 50000.0, "EUR": 30000.0, "TRY": 100000.0, "GBP": 15000.0}, opening_balances={"LYD": 1000000.0, "USD": 50000.0, "EUR": 30000.0, "TRY": 100000.0, "GBP": 15000.0}, is_active=True, last_movement="2026-05-28 11:20")
    ]
    db.add_all(vaults)
    db.flush()

    # 6. Essential Settings
    settings = [
        SystemSetting(key="companyName", value={"val": "نظام الواحة الدولي للصرافة والخدمات المالية"}),
        SystemSetting(key="logoUrl", value={"val": ""}),
        SystemSetting(key="primaryColor", value={"val": "#1E40AF"}),
        SystemSetting(key="address", value={"val": "شارع الميزران، طرابلس، ليبيا"}),
        SystemSetting(key="phone", value={"val": "021-3601122"}),
        SystemSetting(key="taxNumber", value={"val": "102-3929-1029"}),
        SystemSetting(key="defaultCurrency", value={"val": "LYD"}),
        SystemSetting(key="allowRateEditDuringTx", value={"val": True}),
        SystemSetting(key="maxDiffWithoutApproval", value={"val": 50.0}),
        SystemSetting(key="enableMFA", value={"val": False}),
        SystemSetting(key="sessionTimeout", value={"val": 30}),
        SystemSetting(key="amlThresholdLYD", value={"val": 20000.0}),
        SystemSetting(key="smsGatewayProvider", value={"val": "none"}),
        SystemSetting(key="smsGatewayApiKey", value={"val": ""}),
        SystemSetting(key="smsRemindersEnabled", value={"val": False}),
    ]
    db.add_all(settings)
    db.flush()

    # 7. Default denomination breakdowns (editable per company later)
    denominations = []
    for code, values in {
        "LYD": [100, 50, 20, 10, 5, 1],
        "USD": [100, 50, 20, 10, 5, 1],
        "EUR": [500, 200, 100, 50, 20, 10, 5],
        "TRY": [200, 100, 50, 20, 10, 5],
        "GBP": [50, 20, 10, 5],
    }.items():
        for v in values:
            denominations.append(CurrencyDenomination(id=f"den_{code.lower()}_{v}", currency=code, value=v))
    db.add_all(denominations)
    db.flush()

    db.commit()
    print("Database seeding completed successfully! Clean data seeded.")

if __name__ == "__main__":
    from .database import engine, Base
    Base.metadata.create_all(bind=engine)
    db_session = SessionLocal()
    try:
        seed_database(db_session)
    finally:
        db_session.close()
