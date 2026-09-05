// Thin client for the FX Exchange Office FastAPI backend.
// Every endpoint returns { success, message_ar, message_en, code, data, details }.

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

export class ApiError extends Error {
  code: string
  status: number
  constructor(messageAr: string, code: string, status: number) {
    super(messageAr)
    this.code = code
    this.status = status
  }
}

export class MfaRequiredError extends Error {
  userId: string
  constructor(userId: string) {
    super('يتطلب هذا الحساب رمز التحقق بخطوتين')
    this.userId = userId
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

export function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 204) return undefined as T

  let body: any = null
  try {
    body = await res.json()
  } catch {
    // no body
  }

  if (!res.ok || (body && body.success === false)) {
    const detail = body?.detail ?? body
    const messageAr = detail?.message_ar || 'حدث خطأ غير متوقع'
    const code = detail?.code || 'UNKNOWN_ERROR'
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
    }
    throw new ApiError(messageAr, code, res.status)
  }

  return body?.data as T
}

async function requestBlob(path: string): Promise<Blob> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, { headers })
  if (!res.ok) throw new ApiError('تعذر تحميل الملف', 'DOWNLOAD_FAILED', res.status)
  return res.blob()
}

export const api = {
  get: <T,>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T,>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
  put: <T,>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T,>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
  blob: requestBlob,
}

export async function downloadFile(path: string, filename: string) {
  const blob = await requestBlob(path)
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

// ----------------- Types -----------------
export interface CurrentUser {
  id: string
  name: string
  username: string
  email: string | null
  phone: string | null
  role: string
  branch: string
  allowedVaultId: string | null
  isActive: boolean
  mfaEnabled?: boolean
  token?: string
  permissions?: string[]
}

export interface Currency {
  code: string
  nameAr: string
  nameEn: string
  symbol: string
  country: string
  flag: string
  decimalPlaces: number
  isActive: boolean
  lastUpdated: string | null
}

export interface ExchangeRate {
  id: string
  fromCurrency: string
  toCurrency: string
  buyRate: number
  sellRate: number
  minRate: number
  maxRate: number
  marketRate: number | null
  validFrom: string
  validTo: string
  isActive: boolean
  lastUpdated: string
  updatedBy: string
}

export interface RateHistory {
  id: string
  pair: string
  oldBuy: number
  newBuy: number
  oldSell: number
  newSell: number
  user: string
  timestamp: string
  notes: string | null
}

export interface Customer {
  id: string
  name: string
  type: string
  phone: string
  idNumber: string
  address: string
  debtLimit: number
  balances: Record<string, number>
  isActive: boolean
  profitPct: number
  notes: string | null
}

export interface Vault {
  id: string
  name: string
  type: string
  branch: string
  manager: string
  balances: Record<string, number>
  openingBalances: Record<string, number>
  isActive: boolean
  lastMovement: string | null
}

export interface Transaction {
  id: string
  type: string
  vaultId: string
  vaultName: string
  shiftId: string | null
  customerId: string | null
  customerName: string | null
  fromCurrency: string
  toCurrency: string
  amount: number
  rate: number
  commission: number
  totalAmount: number
  paymentMethod: string
  status: string
  notes: string | null
  user: string
  branch: string
  timestamp: string
  expectedProfit: number
}

export interface CancelledTransaction extends Transaction {
  reversalReason: string | null
  reversalRequestedBy: string | null
  reversalRequestedAt: string | null
}

export interface RoleDTO {
  name: string
  permissions: string[]
  isSystem: boolean
}

export interface UserDTO {
  id: string
  name: string
  username: string
  email: string | null
  phone: string | null
  role: string
  branch: string
  allowedVaultId: string | null
  isActive: boolean
}

// The permission vocabulary shared with the backend's require_permission() checks
// (kept in sync with app/seed.py ALL_PERMISSIONS on the backend).
export const ALL_PERMISSIONS = [
  'تنفيذ بيع عملة', 'تنفيذ شراء عملة', 'تحويل بين الخزنات', 'الموافقة على التحويلات',
  'إلغاء عملية', 'إنشاء عملية عكسية', 'إدارة العملاء', 'إدارة الديون', 'إدارة الخزنات',
  'فتح وردية', 'إغلاق وردية', 'اعتماد الإقفالات', 'إدارة العملات', 'تعديل أسعار الصرف',
  'إدارة البنوك', 'رؤية التقارير', 'رؤية سجل العمليات', 'رؤية الأرباح', 'إدارة الأصول',
  'إدارة المستخدمين', 'إدارة الفروع', 'إدارة الإعدادات'
] as const

export interface Branch {
  id: string
  name: string
  city: string
  address: string
  phone: string
  manager: string
  isActive: boolean
  notes: string | null
}

export interface BankBranch {
  id: string
  bankId: string
  bankName: string
  name: string
  city: string
  address: string
  phone: string
  manager: string
  isActive: boolean
}

export interface Bank {
  id: string
  name: string
  code: string
  country: string
  city: string
  phone: string
  isActive: boolean
  notes: string | null
}

export interface BankAccount {
  id: string
  bankId: string
  bankName: string
  branchId: string
  branchName: string
  accountName: string
  accountNumber: string
  currency: string
  balance: number
  isActive: boolean
  notes: string | null
  lastMovement: string | null
}

export interface Debt {
  id: string
  customerId: string
  customerName: string
  currency: string
  amount: number
  paidAmount: number
  remainingAmount: number
  startDate: string
  dueDate: string
  status: string
  paymentPeriod: string
  paymentAmount: number
  notes: string | null
  transactionId: string | null
}

export interface FixedAsset {
  id: string
  name: string
  type: string
  category: string
  branch: string
  location: string
  purchaseDate: string
  purchasePrice: number
  currency: string
  currentValue: number
  status: string
  responsible: string
  notes: string | null
}

export interface Vehicle {
  id: string
  assetId: string
  carName: string
  plateNumber: string
  type: string
  model: string
  makeYear: number
  vin: string
  engineNumber: string
  color: string
  mileage: number
  insuranceDate: string
  insuranceExpiry: string
  licenseDate: string
  licenseExpiry: string
  driver: string
  branch: string
  status: string
}

export interface RealEstate {
  id: string
  assetId: string
  propertyName: string
  propertyType: string
  city: string
  address: string
  area: number
  deedNumber: string
  ownershipType: string
  acquisitionDate: string
  purchasePrice: number
  currentEstimatedValue: number
  leaseStart: string | null
  leaseEnd: string | null
  monthlyRent: number
  status: string
}

export interface MaintenanceRecord {
  id: string
  assetId: string
  assetName: string
  maintenanceType: string
  date: string
  cost: number
  currency: string
  provider: string
  description: string
  status: string
  responsibleEmployee: string
}

export interface Shift {
  id: string
  cashier: string
  branch: string
  vaultId: string
  vaultName: string
  startTime: string | null
  endTime: string | null
  requestedAt: string | null
  approvedBy: string | null
  openingBalances: Record<string, number>
  expectedBalances: Record<string, number>
  actualBalances: Record<string, number>
  differences: Record<string, number>
  status: string
  notes: string | null
}

export interface ApprovalRequestDTO {
  id: string
  type: string
  title: string
  amount: number
  currency: string | null
  requestedBy: string
  timestamp: string
  status: string
  referenceId: string
  details: string | null
}

export interface AuditLogEntry {
  id: string
  timestamp: string
  user: string
  role: string
  branch: string
  action: string
  entity: string
  details: string
  ip: string
  device: string
}

export interface LoginLogEntry {
  id: string
  user: string
  role: string
  branch: string
  loginTime: string
  ip: string
  device: string
  status: string
}

export interface ComplianceFlag {
  id: string
  transactionId: string
  customerId: string | null
  customerName: string | null
  reason: string
  amountLydEquivalent: number
  currency: string
  timestamp: string
  status: string
  reviewedBy: string | null
  notes: string | null
}

export interface CommissionRule {
  id: string
  name: string
  currency: string | null
  customerType: string | null
  minAmount: number
  maxAmount: number | null
  rateType: string
  rateValue: number
  priority: number
  isActive: boolean
}

export interface BackupEntry {
  id: string
  timestamp: string
  type: string
  size: string
  status: string
  user: string
}

export interface NotificationItem {
  id: string
  title: string
  message: string
  timestamp: string
  isRead: boolean
  role: string | null
  user: string | null
  type: 'info' | 'warning' | 'error' | 'success'
}

export interface InventoryCountDTO {
  id: string
  timestamp: string
  vaultId: string
  vaultName: string
  currency: string
  systemBalance: number
  actualBalance: number
  difference: number
  reason: string
  status: string
  notes: string | null
  reportedBy: string
  approvedBy: string | null
}

export interface ReconciliationDTO {
  id: string
  type: string
  targetId: string
  currency: string
  amount: number
  reason: string
  status: string
  notes: string | null
}

export interface AssetDocument {
  id: string
  assetId: string
  assetName: string
  documentType: string
  fileName: string
  expiryDate: string | null
  status: string
  notes: string | null
}

export interface DepreciationRecord {
  assetId: string
  assetName: string
  depreciationMethod: string
  purchasePrice: number
  residualValue: number
  usefulLife: number
  annualDepreciationRate: number
  annualDepreciation: number
  accumulatedDepreciation: number
  currentBookValue: number
  lastCalculatedDate: string
}

export interface CustomerDocument {
  id: string
  customerId: string
  customerName: string
  documentType: string
  fileName: string
  expiryDate: string | null
  status: string
  notes: string | null
}

export interface JournalEntry {
  id: string
  date: string
  txType: string
  reference: string
  description: string
  user: string
  status: string
  lines: Array<{
    accountName: string
    currency: string
    debit: number
    credit: number
    originalAmount: number
    exchangeRate: number
    equivalentLYD: number
  }>
}

export interface CustomerAccountEntry {
  id: string
  type: 'deposit' | 'withdraw'
  customerId: string
  customerName: string
  vaultId: string
  vaultName: string
  currency: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  notes: string | null
  user: string
  shiftId: string | null
  timestamp: string
}

export interface DailyClosingDTO {
  id: string
  level: 'branch' | 'company'
  targetId: string
  targetName: string
  date: string
  status: string
  balancesSnapshot: Record<string, { name: string; type?: string; branch?: string; balances: Record<string, number> }>
  totals: Record<string, number>
  closedBy: string
  closedAt: string
  approvedBy: string | null
  approvedAt: string | null
  notes: string | null
}
