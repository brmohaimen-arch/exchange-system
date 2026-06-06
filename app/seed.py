from datetime import datetime
from sqlalchemy.orm import Session
from .database import SessionLocal
from .models import (
    User, Branch, Currency, ExchangeRate, RateHistory, Vault, Customer, Debt,
    Bank, BankBranch, BankAccount, Shift, Transaction, Movement, JournalEntry,
    AuditLog, LoginLog, InventoryCount, Reconciliation, ApprovalRequest, Transfer,
    FixedAsset, Vehicle, RealEstate, MaintenanceRecord, DepreciationRecord, AssetDocument,
    SystemSetting, Backup, AuditAction, NotificationType, NotificationStatus
)

def seed_database(db: Session):
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
        User(id="u_admin", name="مدير النظام الرئيسي", username="admin", password="123", email="admin@cbs-exchange.ly", phone="091-0000000", role="مدير النظام", branch="الإدارة العامة", allowed_vault_id="v_main", is_active=True)
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
        SystemSetting(key="address", value={"val": "شارع الميزران، طرابلس، ليبيا"}),
        SystemSetting(key="phone", value={"val": "021-3601122"}),
        SystemSetting(key="taxNumber", value={"val": "102-3929-1029"}),
        SystemSetting(key="defaultCurrency", value={"val": "LYD"}),
        SystemSetting(key="allowRateEditDuringTx", value={"val": True}),
        SystemSetting(key="maxDiffWithoutApproval", value={"val": 50.0}),
        SystemSetting(key="enableMFA", value={"val": False}),
        SystemSetting(key="sessionTimeout", value={"val": 30})
    ]
    db.add_all(settings)
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
