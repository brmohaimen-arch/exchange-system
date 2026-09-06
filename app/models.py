import enum
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Boolean, Text, JSON, Enum, Float
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base

# Enums
class AuditAction(str, enum.Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DISABLE = "DISABLE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    CANCEL = "CANCEL"
    REVERSE = "REVERSE"
    SYSTEM_ALERT = "SYSTEM_ALERT"

class NotificationType(str, enum.Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    DANGER = "DANGER"
    SUCCESS = "SUCCESS"

class NotificationStatus(str, enum.Enum):
    UNREAD = "UNREAD"
    READ = "READ"
    DISMISSED = "DISMISSED"

# Models

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False)  # مدير النظام, صراف
    branch: Mapped[str] = mapped_column(String(100), nullable=False)
    allowed_vault_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    mfa_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)  # base32 TOTP secret, set on enrollment
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)  # only enforced at login once the user confirms a code

class Branch(Base):
    __tablename__ = "branches"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)  # Name is used as ID
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    address: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    manager: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class Currency(Base):
    __tablename__ = "currencies"
    code: Mapped[str] = mapped_column(String(10), primary_key=True)  # LYD, USD, etc.
    name_ar: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(100), nullable=False)
    symbol: Mapped[str] = mapped_column(String(10), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    flag: Mapped[str] = mapped_column(String(10), nullable=False)
    decimal_places: Mapped[int] = mapped_column(Integer, default=2)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_updated: Mapped[str | None] = mapped_column(String(50), nullable=True)

class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)  # rate_usd_lyd
    from_currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    to_currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    buy_rate: Mapped[float] = mapped_column(Float, nullable=False)
    sell_rate: Mapped[float] = mapped_column(Float, nullable=False)
    min_rate: Mapped[float] = mapped_column(Float, nullable=False)
    max_rate: Mapped[float] = mapped_column(Float, nullable=False)
    valid_from: Mapped[str] = mapped_column(String(50), nullable=False)
    valid_to: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_updated: Mapped[str] = mapped_column(String(50), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(100), nullable=False)
    market_rate: Mapped[float | None] = mapped_column(Float, nullable=True)  # manually-updated street/reference rate for comparison

class RateHistory(Base):
    __tablename__ = "rate_histories"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    pair: Mapped[str] = mapped_column(String(50), nullable=False)  # USD / LYD
    old_buy: Mapped[float] = mapped_column(Float, nullable=False)
    new_buy: Mapped[float] = mapped_column(Float, nullable=False)
    old_sell: Mapped[float] = mapped_column(Float, nullable=False)
    new_sell: Mapped[float] = mapped_column(Float, nullable=False)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class Vault(Base):
    __tablename__ = "vaults"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)  # v_main
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # main, branch, cashier
    branch: Mapped[str] = mapped_column(String(100), ForeignKey("branches.id"))
    manager: Mapped[str] = mapped_column(String(100), nullable=False)
    balances: Mapped[dict] = mapped_column(JSON, default=dict)  # {"LYD": 150000.0, "USD": 250.0}
    opening_balances: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_movement: Mapped[str | None] = mapped_column(String(50), nullable=True)

class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # company, individual
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    id_number: Mapped[str] = mapped_column(String(100), nullable=False)
    address: Mapped[str] = mapped_column(String(200), nullable=False)
    debt_limit: Mapped[float] = mapped_column(Float, default=0.0)
    balances: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    profit_pct: Mapped[float] = mapped_column(Float, default=0.0)  # % fee added on each transaction
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class Debt(Base):
    __tablename__ = "debts"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(50), ForeignKey("customers.id"))
    customer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0)
    remaining_amount: Mapped[float] = mapped_column(Float, nullable=False)
    start_date: Mapped[str] = mapped_column(String(50), nullable=False)
    due_date: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="unpaid")  # unpaid, partially_paid, paid
    payment_period: Mapped[str] = mapped_column(String(20), default="monthly")  # monthly, daily, none
    payment_amount: Mapped[float] = mapped_column(Float, default=0.0)  # scheduled installment amount
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    transaction_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

class Bank(Base):
    __tablename__ = "banks"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class BankBranch(Base):
    __tablename__ = "bank_branches"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    bank_id: Mapped[str] = mapped_column(String(50), ForeignKey("banks.id"))
    bank_name: Mapped[str] = mapped_column(String(150), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    address: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    manager: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

class BankAccount(Base):
    __tablename__ = "bank_accounts"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    bank_id: Mapped[str] = mapped_column(String(50), ForeignKey("banks.id"))
    bank_name: Mapped[str] = mapped_column(String(150), nullable=False)
    branch_id: Mapped[str] = mapped_column(String(50), ForeignKey("bank_branches.id"))
    branch_name: Mapped[str] = mapped_column(String(150), nullable=False)
    account_name: Mapped[str] = mapped_column(String(150), nullable=False)
    account_number: Mapped[str] = mapped_column(String(100), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    balance: Mapped[float] = mapped_column(Float, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_movement: Mapped[str | None] = mapped_column(String(50), nullable=True)

class Shift(Base):
    __tablename__ = "shifts"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    cashier: Mapped[str] = mapped_column(String(100), nullable=False)
    branch: Mapped[str] = mapped_column(String(100), ForeignKey("branches.id"))
    vault_id: Mapped[str] = mapped_column(String(50), ForeignKey("vaults.id"))
    vault_name: Mapped[str] = mapped_column(String(100), nullable=False)
    start_time: Mapped[str | None] = mapped_column(String(50), nullable=True)  # set once the open request is approved
    end_time: Mapped[str | None] = mapped_column(String(50), nullable=True)  # set when the shift is closed
    opening_balances: Mapped[dict] = mapped_column(JSON, default=dict)
    expected_balances: Mapped[dict] = mapped_column(JSON, default=dict)
    actual_balances: Mapped[dict] = mapped_column(JSON, default=dict)
    differences: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(50), default="pending_open")  # pending_open, open, rejected, closed, approved
    requested_at: Mapped[str | None] = mapped_column(String(50), nullable=True)  # when the cashier asked to open it
    approved_by: Mapped[str | None] = mapped_column(String(100), nullable=True)  # who approved/rejected the open request
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    denomination_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)  # {"USD": {"100": 12, "50": 4}, ...}

class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # buy, sell, exchange, deposit, withdraw
    vault_id: Mapped[str] = mapped_column(String(50), ForeignKey("vaults.id"))
    vault_name: Mapped[str] = mapped_column(String(100), nullable=False)
    shift_id: Mapped[str | None] = mapped_column(String(50), ForeignKey("shifts.id"), nullable=True)  # the open shift this transaction happened under, if any
    customer_id: Mapped[str | None] = mapped_column(String(50), ForeignKey("customers.id"), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    from_currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    to_currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    rate: Mapped[float] = mapped_column(Float, nullable=False)
    commission: Mapped[float] = mapped_column(Float, default=0.0)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)  # cash, bank_account, customer_account, debt
    status: Mapped[str] = mapped_column(String(50), default="approved")  # approved, pending, reversed
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    user: Mapped[str] = mapped_column(String(100), nullable=False)
    branch: Mapped[str] = mapped_column(String(100), ForeignKey("branches.id"))
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
    expected_profit: Mapped[float] = mapped_column(Float, default=0.0)

class Movement(Base):
    __tablename__ = "movements"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # vault, customer, bank_account
    entity_id: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_name: Mapped[str] = mapped_column(String(150), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    type: Mapped[str] = mapped_column(String(100), nullable=False)  # شراء عملة, إيداع حساب, إلخ
    amount_in: Mapped[float] = mapped_column(Float, default=0.0)
    amount_out: Mapped[float] = mapped_column(Float, default=0.0)
    balance_before: Mapped[float] = mapped_column(Float, nullable=False)
    balance_after: Mapped[float] = mapped_column(Float, nullable=False)
    reference_id: Mapped[str] = mapped_column(String(50), nullable=False)
    user: Mapped[str] = mapped_column(String(100), nullable=False)

class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    date: Mapped[str] = mapped_column(String(50), nullable=False)
    tx_type: Mapped[str] = mapped_column(String(100), nullable=False)
    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    user: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="approved")  # approved, reversed
    lines: Mapped[list] = mapped_column(JSON, nullable=False)  # Rows with details

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    role_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    branch_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[AuditAction] = mapped_column(Enum(AuditAction))
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    old_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    device: Mapped[str | None] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    prev_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # sha256 of the previous log entry, forms a tamper-evident chain
    hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # sha256(prev_hash + this entry's own fields)

class LoginLog(Base):
    __tablename__ = "login_logs"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    user: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    branch: Mapped[str] = mapped_column(String(100), nullable=False)
    login_time: Mapped[str] = mapped_column(String(50), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(50), nullable=True)
    device: Mapped[str | None] = mapped_column(String(150), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)  # successful, failed

class InventoryCount(Base):
    __tablename__ = "inventory_counts"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
    vault_id: Mapped[str] = mapped_column(String(50), ForeignKey("vaults.id"))
    vault_name: Mapped[str] = mapped_column(String(100), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    system_balance: Mapped[float] = mapped_column(Float, nullable=False)
    actual_balance: Mapped[float] = mapped_column(Float, nullable=False)
    difference: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, approved, rejected
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reported_by: Mapped[str] = mapped_column(String(100), nullable=False)
    approved_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    denomination_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)

class DailyExpense(Base):
    __tablename__ = "daily_expenses"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    date: Mapped[str] = mapped_column(String(20), nullable=False)  # YYYY-MM-DD
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # rent, salaries, electricity, maintenance, other
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_by: Mapped[str] = mapped_column(String(100), nullable=False)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)

class ApprovalRequest(Base):
    __tablename__ = "approvals"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # transfer, reversal, inventory, shift
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    requested_by: Mapped[str] = mapped_column(String(100), nullable=False)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, approved, rejected
    reference_id: Mapped[str] = mapped_column(String(50), nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)

class Transfer(Base):
    __tablename__ = "transfers"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)  # vault, bank_account
    source_id: Mapped[str] = mapped_column(String(50), nullable=False)
    source_name: Mapped[str] = mapped_column(String(150), nullable=False)
    dest_type: Mapped[str] = mapped_column(String(50), nullable=False)
    dest_id: Mapped[str] = mapped_column(String(50), nullable=False)
    dest_name: Mapped[str] = mapped_column(String(150), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    requested_by: Mapped[str] = mapped_column(String(100), nullable=False)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType), default=NotificationType.INFO)
    status: Mapped[NotificationStatus] = mapped_column(Enum(NotificationStatus), default=NotificationStatus.UNREAD)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    role_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    branch_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class FixedAsset(Base):
    __tablename__ = "fixed_assets"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)  # سيارة, مبنى, إلخ
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    branch: Mapped[str] = mapped_column(String(100), ForeignKey("branches.id"))
    location: Mapped[str] = mapped_column(String(150), nullable=False)
    purchase_date: Mapped[str] = mapped_column(String(50), nullable=False)
    purchase_price: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    current_value: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="نشط")  # نشط, مستبعد, تم البيع
    responsible: Mapped[str] = mapped_column(String(100), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class Vehicle(Base):
    __tablename__ = "vehicles"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(50), ForeignKey("fixed_assets.id"))
    car_name: Mapped[str] = mapped_column(String(150), nullable=False)
    plate_number: Mapped[str] = mapped_column(String(50), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    model: Mapped[str] = mapped_column(String(50), nullable=False)
    make_year: Mapped[int] = mapped_column(Integer, nullable=False)
    vin: Mapped[str] = mapped_column(String(100), nullable=False)
    engine_number: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(50), nullable=False)
    mileage: Mapped[int] = mapped_column(Integer, default=0)
    insurance_date: Mapped[str] = mapped_column(String(50), nullable=False)
    insurance_expiry: Mapped[str] = mapped_column(String(50), nullable=False)
    license_date: Mapped[str] = mapped_column(String(50), nullable=False)
    license_expiry: Mapped[str] = mapped_column(String(50), nullable=False)
    driver: Mapped[str] = mapped_column(String(100), nullable=False)
    branch: Mapped[str] = mapped_column(String(100), ForeignKey("branches.id"))
    status: Mapped[str] = mapped_column(String(50), default="نشط")

class RealEstate(Base):
    __tablename__ = "real_estates"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(50), ForeignKey("fixed_assets.id"))
    property_name: Mapped[str] = mapped_column(String(150), nullable=False)
    property_type: Mapped[str] = mapped_column(String(50), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    address: Mapped[str] = mapped_column(String(200), nullable=False)
    area: Mapped[float] = mapped_column(Float, nullable=False)
    deed_number: Mapped[str] = mapped_column(String(100), nullable=False)
    ownership_type: Mapped[str] = mapped_column(String(50), nullable=False)  # مملوك, مؤجر
    acquisition_date: Mapped[str] = mapped_column(String(50), nullable=False)
    purchase_price: Mapped[float] = mapped_column(Float, default=0.0)
    current_estimated_value: Mapped[float] = mapped_column(Float, default=0.0)
    lease_start: Mapped[str | None] = mapped_column(String(50), nullable=True)
    lease_end: Mapped[str | None] = mapped_column(String(50), nullable=True)
    monthly_rent: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(50), default="نشط")

class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(50), ForeignKey("fixed_assets.id"))
    asset_name: Mapped[str] = mapped_column(String(150), nullable=False)
    maintenance_type: Mapped[str] = mapped_column(String(150), nullable=False)
    date: Mapped[str] = mapped_column(String(50), nullable=False)
    cost: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    provider: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="قيد التنفيذ")  # مكتملة, قيد التنفيذ, مجدولة
    responsible_employee: Mapped[str] = mapped_column(String(100), nullable=False)

class DepreciationRecord(Base):
    __tablename__ = "depreciation_records"
    asset_id: Mapped[str] = mapped_column(String(50), ForeignKey("fixed_assets.id"), primary_key=True)
    asset_name: Mapped[str] = mapped_column(String(150), nullable=False)
    depreciation_method: Mapped[str] = mapped_column(String(100), nullable=False)
    purchase_price: Mapped[float] = mapped_column(Float, nullable=False)
    residual_value: Mapped[float] = mapped_column(Float, default=0.0)
    useful_life: Mapped[int] = mapped_column(Integer, default=0)
    annual_depreciation_rate: Mapped[float] = mapped_column(Float, default=0.0)
    annual_depreciation: Mapped[float] = mapped_column(Float, default=0.0)
    accumulated_depreciation: Mapped[float] = mapped_column(Float, default=0.0)
    current_book_value: Mapped[float] = mapped_column(Float, nullable=False)
    last_calculated_date: Mapped[str] = mapped_column(String(50), nullable=False)

class AssetDocument(Base):
    __tablename__ = "asset_documents"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(50), ForeignKey("fixed_assets.id"))
    asset_name: Mapped[str] = mapped_column(String(150), nullable=False)
    document_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_name: Mapped[str] = mapped_column(String(200), nullable=False)
    expiry_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="ساري")  # ساري, قارب على الانتهاء, منتهي
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class SystemSetting(Base):
    __tablename__ = "system_settings"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)

class Backup(Base):
    __tablename__ = "backups"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="ناجحة")
    user: Mapped[str] = mapped_column(String(100), nullable=False)
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)  # absolute path of the .db copy, for retention cleanup

class Role(Base):
    __tablename__ = "roles"
    name: Mapped[str] = mapped_column(String(100), primary_key=True)
    permissions: Mapped[list] = mapped_column(JSON, default=list)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)  # the 6 doc-defined roles; protected from deletion

class CustomerDocument(Base):
    __tablename__ = "customer_documents"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(50), ForeignKey("customers.id"))
    customer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    document_type: Mapped[str] = mapped_column(String(100), nullable=False)  # بطاقة شخصية, جواز سفر, سجل تجاري
    file_name: Mapped[str] = mapped_column(String(200), nullable=False)
    expiry_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="ساري")  # ساري, قارب على الانتهاء, منتهي
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class ComplianceFlag(Base):
    __tablename__ = "compliance_flags"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    transaction_id: Mapped[str] = mapped_column(String(50), ForeignKey("transactions.id"))
    customer_id: Mapped[str | None] = mapped_column(String(50), ForeignKey("customers.id"), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    amount_lyd_equivalent: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, reviewed, reported
    reviewed_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class CommissionRule(Base):
    __tablename__ = "commission_rules"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)  # null = applies to all currencies
    customer_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # null = applies to all customer types
    min_amount: Mapped[float] = mapped_column(Float, default=0.0)
    max_amount: Mapped[float | None] = mapped_column(Float, nullable=True)  # null = no upper bound
    rate_type: Mapped[str] = mapped_column(String(20), default="percentage")  # percentage, fixed
    rate_value: Mapped[float] = mapped_column(Float, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0)  # higher priority wins when multiple rules match
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

class CurrencyDenomination(Base):
    __tablename__ = "currency_denominations"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    value: Mapped[float] = mapped_column(Float, nullable=False)  # e.g. 100, 50, 20, 10, 5, 1

class DailyClosing(Base):
    """A branch-day or company-day close: a point-in-time snapshot of every vault's
    balances at that level, taken once every cashier shift under it is settled.
    Doc requirement: closing must happen at the branch and main-treasury level too,
    not just per cashier drawer (Shift already covers the cashier level)."""
    __tablename__ = "daily_closings"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    level: Mapped[str] = mapped_column(String(20), nullable=False)  # branch, company
    target_id: Mapped[str] = mapped_column(String(100), nullable=False)  # branch id, or "COMPANY" for company-level
    target_name: Mapped[str] = mapped_column(String(150), nullable=False)
    date: Mapped[str] = mapped_column(String(20), nullable=False)  # YYYY-MM-DD
    status: Mapped[str] = mapped_column(String(20), default="closed")  # closed, approved
    balances_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)  # {vault_id: {"name":..., "balances": {...}}}
    totals: Mapped[dict] = mapped_column(JSON, default=dict)  # {currency: total} summed across the snapshot
    closed_by: Mapped[str] = mapped_column(String(100), nullable=False)
    closed_at: Mapped[str] = mapped_column(String(50), nullable=False)
    approved_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    approved_at: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class CustomerAccountEntry(Base):
    """Standalone customer deposit/withdrawal — money moving between a customer's
    account and cash, independent of any currency trade. Doc requirement: distinct
    'Customer Deposit' / 'Customer Withdrawal' operations, separate from buy/sell."""
    __tablename__ = "customer_account_entries"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # deposit, withdraw
    customer_id: Mapped[str] = mapped_column(String(50), ForeignKey("customers.id"))
    customer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    vault_id: Mapped[str] = mapped_column(String(50), ForeignKey("vaults.id"))
    vault_name: Mapped[str] = mapped_column(String(100), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), ForeignKey("currencies.code"))
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    balance_before: Mapped[float] = mapped_column(Float, nullable=False)
    balance_after: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    user: Mapped[str] = mapped_column(String(100), nullable=False)
    shift_id: Mapped[str | None] = mapped_column(String(50), ForeignKey("shifts.id"), nullable=True)
    timestamp: Mapped[str] = mapped_column(String(50), nullable=False)
