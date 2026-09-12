// Thin client for the FX Exchange Office FastAPI backend.
// Every endpoint returns { success, message_ar, message_en, code, data, details }.

// A relative path so every request goes through this same origin and is proxied
// server-side by next.config.js's rewrites() to BACKEND_URL. An absolute URL here
// gets baked into the client-side JS bundle at build time and would send every
// visitor's browser to whatever "localhost" means on THEIR machine — which is how
// this broke silently in production despite working in local dev, where frontend
// and backend happen to share the same machine as the browser testing them.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

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
    if ((res.status === 401 || code === 'TRIAL_EXPIRED') && typeof window !== 'undefined') {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      if (code === 'TRIAL_EXPIRED' && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
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
  if (!res.ok) {
    // The server returns a JSON error body even for a file download route (APIError),
    // so surface its actual message instead of a generic one — otherwise every
    // download failure looks identical regardless of cause (auth, 404, server error).
    const body = await res.json().catch(() => null)
    const detail = body?.detail ?? body
    throw new ApiError(detail?.message_ar || 'تعذر تحميل الملف', detail?.code || 'DOWNLOAD_FAILED', res.status)
  }
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

export async function uploadFile<T>(path: string, file: File): Promise<T> {
  // Deliberately not routed through request() — that always sets
  // Content-Type: application/json, which would break the multipart
  // boundary fetch needs to set itself for a FormData body.
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: form })
  const body = await res.json().catch(() => null)
  if (!res.ok || (body && body.success === false)) {
    const detail = body?.detail ?? body
    throw new ApiError(detail?.message_ar || 'تعذر رفع الملف', detail?.code || 'UPLOAD_FAILED', res.status)
  }
  return body?.data as T
}

export async function openFile(path: string) {
  // Opens the file (PDF receipt, scanned image, etc.) directly in a new tab instead
  // of forcing a save-to-disk prompt — the browser renders PDFs/images inline on its own.
  const blob = await requestBlob(path)
  const url = window.URL.createObjectURL(blob)
  window.open(url, '_blank')
  // Give the new tab time to actually load the blob before revoking its URL.
  setTimeout(() => window.URL.revokeObjectURL(url), 60000)
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
  bankName: string | null
  bankAccountNumber: string | null
  passportNumber: string | null
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

export interface Movement {
  id: string
  timestamp: string
  entityType: string
  entityId: string
  entityName: string
  currency: string
  type: string
  amountIn: number
  amountOut: number
  balanceBefore: number
  balanceAfter: number
  referenceId: string | null
  user: string
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

export interface BankDeposit {
  id: string
  bankAccountId: string
  amount: number
  currency: string
  interestRate: number
  depositDate: string
  accruedInterest: number
  lastCalculated: string | null
  status: string
  notes: string | null
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
  createdBy: string | null
}

export interface DebtPaymentRecord {
  id: string
  debtId: string
  customerId: string
  customerName: string
  currency: string
  amount: number
  timestamp: string
  user: string
  notes: string | null
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
  color: string | null
  carModel: string | null
  vin: string | null
  makeYear: number | null
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
  warehouseId: string | null
  barcode: string | null
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
  entityType: string | null
  entityId: string | null
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

export interface DailyExpenseDTO {
  id: string
  date: string
  category: string
  amount: number
  currency: string
  description: string | null
  recordedBy: string
  timestamp: string
}

export const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'إيجار' },
  { value: 'salaries', label: 'رواتب' },
  { value: 'electricity', label: 'كهرباء' },
  { value: 'maintenance', label: 'صيانة' },
  { value: 'other', label: 'أخرى' },
] as const

export interface AssetDocument {
  id: string
  assetId: string
  assetName: string
  documentType: string
  fileName: string
  expiryDate: string | null
  status: string
  notes: string | null
  hasFile: boolean
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
  customerId: string | null
  customerName: string | null
  documentType: string
  fileName: string
  expiryDate: string | null
  status: string
  notes: string | null
  hasFile: boolean
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
  type: 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out'
  customerId: string
  customerName: string
  vaultId: string | null
  vaultName: string | null
  bankAccountId: string | null
  bankAccountName: string | null
  otherSource: string | null
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
