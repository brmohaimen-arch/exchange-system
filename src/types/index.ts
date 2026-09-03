export interface Currency {
  code: string; // e.g. USD, LYD
  nameAr: string;
  nameEn: string;
  symbol: string;
  country: string;
  flag: string;
  decimalPlaces: number;
  isActive: boolean;
  notes?: string;
  lastUpdated: string;
}

export interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  buyRate: number;
  sellRate: number;
  minRate: number;
  maxRate: number;
  marketRate?: number | null;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  notes?: string;
  lastUpdated: string;
  updatedBy: string;
}

export interface RateHistory {
  id: string;
  pair: string;
  oldBuy: number;
  newBuy: number;
  oldSell: number;
  newSell: number;
  user: string;
  timestamp: string;
  notes?: string;
}

export interface Vault {
  id: string;
  name: string;
  type: 'main' | 'branch' | 'cashier';
  branch: string;
  manager: string;
  isActive: boolean;
  balances: Record<string, number>; // currencyCode -> balance
  openingBalances: Record<string, number>;
  lastMovement: string;
}

export interface Bank {
  id: string;
  name: string;
  code: string;
  country: string;
  city: string;
  phone: string;
  isActive: boolean;
  notes?: string;
}

export interface BankBranch {
  id: string;
  bankId: string;
  bankName: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  manager: string;
  isActive: boolean;
}

export interface BankAccount {
  id: string;
  bankId: string;
  bankName: string;
  branchId: string;
  branchName: string;
  accountName: string;
  accountNumber: string;
  currency: string;
  balance: number;
  isActive: boolean;
  notes?: string;
  lastMovement: string;
}

export interface Customer {
  id: string;
  name: string;
  type: 'individual' | 'company';
  phone: string;
  idNumber: string;
  address: string;
  debtLimit: number;
  isActive: boolean;
  notes?: string;
  balances: Record<string, number>; // currency -> balance
  profitPct?: number; // % service fee added on top of transaction total
}

export interface Debt {
  id: string;
  customerId: string;
  customerName: string;
  currency: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  startDate: string;
  dueDate: string;
  transactionId?: string;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  paymentPeriod?: 'monthly' | 'daily' | 'none'; // installment schedule
  paymentAmount?: number; // scheduled installment amount
  notes?: string;
}

export interface Shift {
  id: string;
  cashier: string;
  branch: string;
  vaultId: string;
  vaultName: string;
  startTime: string;
  endTime?: string;
  openingBalances: Record<string, number>;
  expectedBalances: Record<string, number>;
  actualBalances: Record<string, number>;
  differences: Record<string, number>;
  status: 'open' | 'closed' | 'pending_approval' | 'approved' | 'difference_found';
  notes?: string;
}

export interface Transaction {
  id: string;
  type: 'buy' | 'sell' | 'exchange' | 'deposit' | 'withdraw' | 'transfer' | 'reversal';
  subType?: string;
  vaultId?: string;
  vaultName?: string;
  customerId?: string;
  customerName?: string;
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  rate: number;
  commission: number;
  totalAmount: number; // calculated total
  paymentMethod: 'cash' | 'customer_account' | 'bank_account' | 'debt';
  bankAccountId?: string;
  bankAccountName?: string;
  status: 'approved' | 'pending' | 'rejected' | 'reversed' | 'cancelled';
  notes?: string;
  user: string;
  branch: string;
  timestamp: string;
  originalTxId?: string; // in case of reversal
  reversalReason?: string;
  expectedProfit?: number;
}

export interface Movement {
  id: string;
  timestamp: string;
  entityType: 'vault' | 'bank_account' | 'customer';
  entityId: string;
  entityName: string;
  currency: string;
  type: string; // e.g. بيع عملة، إيداع عميل
  amountIn: number;
  amountOut: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId: string;
  user: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  txType: string;
  reference: string;
  description: string;
  user: string;
  status: 'approved' | 'reversed';
  lines: JournalLine[];
}

export interface JournalLine {
  accountName: string;
  currency: string;
  debit: number;
  credit: number;
  originalAmount: number;
  exchangeRate: number;
  equivalentLYD: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  branch: string;
  action: string;
  entity: string;
  details: string;
  oldValue?: string;
  newValue?: string;
  ip: string;
  device: string;
}

export interface LoginLog {
  id: string;
  user: string;
  role: string;
  branch: string;
  loginTime: string;
  logoutTime?: string;
  duration?: string;
  ip: string;
  device: string;
  status: 'successful' | 'failed';
}

export interface InventoryCount {
  id: string;
  timestamp: string;
  vaultId: string;
  vaultName: string;
  currency: string;
  systemBalance: number;
  actualBalance: number;
  difference: number;
  reason: 'shortage' | 'overage' | 'counting_error' | 'damaged_cash' | 'admin_settlement';
  status: 'pending_review' | 'approved' | 'rejected';
  notes?: string;
  reportedBy: string;
  approvedBy?: string;
}

export interface Reconciliation {
  id: string;
  type: 'vault' | 'bank' | 'customer' | 'inventory';
  targetId: string;
  targetName: string;
  currency: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  approvedBy?: string;
  timestamp: string;
  notes?: string;
}

export interface ApprovalRequest {
  id: string;
  type: 'transfer' | 'reversal' | 'reconciliation' | 'inventory' | 'rate_change' | 'shift_close';
  title: string;
  amount?: number;
  currency?: string;
  requestedBy: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected';
  referenceId: string;
  details: string;
}

export interface FixedAsset {
  id: string; // رقم الأصل
  name: string; // اسم الأصل
  type: string; // نوع الأصل
  category: string; // التصنيف
  branch: string; // الفرع
  location: string; // الموقع
  purchaseDate: string; // تاريخ الشراء
  purchasePrice: number; // قيمة الشراء
  currency: string; // العملة
  currentValue: number; // القيمة الحالية
  status: 'نشط' | 'قيد الصيانة' | 'متوقف' | 'مباع' | 'مؤجر' | 'مفقود' | 'مستهلك بالكامل'; // الحالة
  responsible: string; // المسؤول
  notes?: string; // ملاحظات
}

export interface Vehicle {
  id: string; // معرف
  assetId: string; // رقم الأصل
  carName: string; // اسم السيارة
  plateNumber: string; // رقم اللوحة
  type: string; // النوع
  model: string; // الموديل
  makeYear: number; // سنة الصنع
  vin: string; // رقم الهيكل VIN
  engineNumber: string; // رقم المحرك
  color: string; // اللون
  mileage: number; // عداد الكيلومترات
  insuranceDate: string; // تاريخ التأمين
  insuranceExpiry: string; // تاريخ انتهاء التأمين
  licenseDate: string; // تاريخ الترخيص
  licenseExpiry: string; // تاريخ انتهاء الترخيص
  driver: string; // السائق / المسؤول
  branch: string; // الفرع
  status: 'نشط' | 'قيد الصيانة' | 'متوقف' | 'مباع' | 'مفقود'; // الحالة
}

export interface RealEstate {
  id: string; // معرف
  assetId: string; // رقم الأصل
  propertyName: string; // اسم العقار
  propertyType: 'مبنى' | 'مكتب' | 'أرض' | 'مخزن'; // نوع العقار
  city: string; // المدينة
  address: string; // العنوان
  area: number; // المساحة
  deedNumber: string; // رقم الصك / الملكية
  ownershipType: 'مملوك' | 'مؤجر'; // نوع الملكية
  acquisitionDate: string; // تاريخ التملك
  purchasePrice: number; // قيمة الشراء
  currentEstimatedValue: number; // القيمة التقديرية الحالية
  leaseStart?: string; // تاريخ بداية الإيجار
  leaseEnd?: string; // تاريخ نهاية الإيجار
  monthlyRent?: number; // الإيجار الشهري
  status: 'نشط' | 'قيد الصيانة' | 'مباع' | 'مؤجر' | 'متوقف'; // الحالة
}

export interface MaintenanceRecord {
  id: string;
  assetId: string; // الأصل
  assetName: string; // اسم الأصل
  maintenanceType: string; // نوع الصيانة
  date: string; // التاريخ
  cost: number; // التكلفة
  currency: string; // العملة
  provider: string; // المورد / الورشة
  description: string; // الوصف
  status: 'مجدولة' | 'قيد التنفيذ' | 'مكتملة' | 'ملغية'; // الحالة
  responsibleEmployee: string; // الموظف المسؤول
}

export interface DepreciationRecord {
  assetId: string; // الأصل
  assetName: string; // اسم الأصل
  depreciationMethod: 'بدون إهلاك' | 'القسط الثابت' | 'يدوي'; // طريقة الإهلاك
  purchasePrice: number; // قيمة الشراء
  residualValue: number; // القيمة المتبقية
  usefulLife: number; // العمر الإنتاجي بالسنوات
  annualDepreciationRate: number; // نسبة الإهلاك السنوية
  annualDepreciation: number; // الإهلاك السنوي
  accumulatedDepreciation: number; // الإهلاك المتراكم
  currentBookValue: number; // القيمة الدفترية الحالية
  lastCalculatedDate: string; // آخر تاريخ احتساب
}

export interface AssetDocument {
  id: string;
  assetId: string; // الأصل
  assetName: string; // اسم الأصل
  documentType: 'صورة الأصل' | 'فاتورة الشراء' | 'عقد الملكية' | 'عقد الإيجار' | 'التأمين' | 'الرخصة' | 'مستند الصيانة' | 'صور إضافية'; // نوع المستند
  fileName: string; // اسم الملف
  expiryDate?: string; // تاريخ الانتهاء
  status: 'ساري' | 'منتهي' | 'قارب على الانتهاء'; // الحالة
  notes?: string; // ملاحظات
}

