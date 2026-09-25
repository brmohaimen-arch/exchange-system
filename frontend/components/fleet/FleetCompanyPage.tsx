'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Plus, X, Loader2, Trash2, Package, Truck, Wallet, TriangleAlert, TrendingUp, TrendingDown, Landmark, ListTree, FileText, Download, Power, Tag, ArrowUpRight, ArrowDownRight, CalendarRange } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart'
import { api, openFile, downloadFile, FleetVehicle, FleetTransaction, FleetTransactionType, FleetDamageRecord, FleetSummary, FleetTransactionWithVehicle, FleetAccount, FleetAccountType, FleetPaymentMethod, FleetWarehouse, Currency } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'
import { TablePagination, paginate } from '@/components/TablePagination'
import { useConfirm } from '@/components/ConfirmProvider'
import { DateInput } from '@/components/ui/date-input'
import { NumberInput } from '@/components/ui/number-input'
import { useTableFilters } from '@/components/TableFilters'

interface PeriodTotals { income: number; expense: number; profit: number; count: number }
interface PeriodKpis extends PeriodTotals { profitChangePct: number | null; incomeChangePct: number | null; previous: PeriodTotals }
interface FleetKpis {
  week: PeriodKpis & { from: string; to: string; daily: ({ date: string } & PeriodTotals)[] }
  month: PeriodKpis & { label: string; trend: ({ month: string } & PeriodTotals)[] }
}
const kpiChartConfig: ChartConfig = { profit: { label: 'صافي الربح (د.ل)', color: '#7C3AED' } }
const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

function ChangeBadge({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">لا توجد بيانات {label} للمقارنة</span>
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${up ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`} dir="ltr">
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {up ? '+' : ''}{pct}%
    </span>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }) {
  return (
    <div className="rounded-lg bg-secondary/40 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-foreground'}`} dir="ltr">{value}</p>
    </div>
  )
}

const VEHICLE_STATUSES = ['عرض', 'صيانة', 'متوقف', 'تم البيع']
const DAMAGE_STATUSES = ['مُبلغ عنه', 'قيد الإصلاح', 'تم الإصلاح']

function formatAutoNumber(n: number) {
  return String(n).padStart(3, '0')
}

function emptyVehicleForm() {
  return {
    name: '', type: '', serialNumber: '', chassisNumber: '', color: '', manufactureDate: '', operator: '', status: 'عرض',
    purchaseDate: '', purchasePrice: '', purchasePaymentMethod: '' as FleetPaymentMethod | '', purchaseAccountId: '', sellerName: '', bankName: '', bankAccountNumber: '', bankHolder: '', warehouseId: '',
    currency: 'LYD', notes: '',
  }
}

function emptySellForm() {
  return { buyerName: '', salePrice: '', saleDate: new Date().toISOString().slice(0, 10), saleCurrency: '', salePaymentMethod: 'cash' as FleetPaymentMethod, saleAccountId: '', saleClientAccountId: '', saleBankName: '', saleBankAccount: '', saleBankHolder: '', notes: '' }
}

function emptyTxForm() {
  return { type: 'income' as FleetTransactionType, category: '', amount: '', currency: 'LYD', date: new Date().toISOString().slice(0, 10), notes: '', accountId: '', counterparty: '' }
}

function emptyDamageForm() {
  return { date: new Date().toISOString().slice(0, 10), description: '', cost: '', currency: 'LYD', reportedBy: '', status: 'مُبلغ عنه' }
}

function emptyAccountForm() {
  return { name: '', currency: 'LYD', accountType: 'company' as FleetAccountType, accountNumber: '', bankName: '', notes: '' }
}

function balanceBadge(balances: Record<string, number>) {
  const entries = Object.entries(balances).filter(([, v]) => Math.abs(v) > 0.001)
  if (entries.length === 0) return <span className="text-xs text-muted-foreground">لا يوجد رصيد</span>
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([cur, amt]) => (
        <span key={cur} dir="ltr" className={`rounded-full px-2 py-0.5 text-xs font-medium ${amt < 0 ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
          {amt.toLocaleString()} {cur}
        </span>
      ))}
    </div>
  )
}

const MANUAL_ACCOUNT = '__manual__'

export type FleetCompany = 'bayan' | 'imtiaz' | 'itqan'
const COMPANY_META: Record<FleetCompany, { name: string; perm: string; base: string }> = {
  bayan: { name: 'بيان الدولية', perm: 'إدارة شركة بيان', base: '' },
  imtiaz: { name: 'شركة الامتياز', perm: 'إدارة شركة الامتياز', base: '/imtiaz' },
  itqan: { name: 'شركة اتقن المحركات', perm: 'إدارة شركة اتقن المحركات', base: '/itqan' },
}

export default function FleetCompanyPage({ company }: { company: FleetCompany }) {
  const { name: companyName, perm, base } = COMPANY_META[company]
  const { hasPermission } = useAuth()
  const confirmDialog = useConfirm()
  const canManage = hasPermission(perm)

  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  const [view, setView] = useState<'vehicles' | 'statement' | 'accounts' | 'warehouses'>('vehicles')
  const [summary, setSummary] = useState<FleetSummary | null>(null)
  const [kpis, setKpis] = useState<FleetKpis | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [statementDateFrom, setStatementDateFrom] = useState('')
  const [statementDateTo, setStatementDateTo] = useState('')
  const [allTransactions, setAllTransactions] = useState<FleetTransactionWithVehicle[]>([])
  const [statementLoading, setStatementLoading] = useState(false)
  const [statementPage, setStatementPage] = useState(1)
  const [exporting, setExporting] = useState<string | null>(null)

  const [accounts, setAccounts] = useState<FleetAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [wallets, setWallets] = useState<FleetAccount[]>([])
  const [warehouses, setWarehouses] = useState<FleetWarehouse[]>([])
  const [whModal, setWhModal] = useState<{ id: string | null; name: string; notes: string } | null>(null)
  const [whError, setWhError] = useState('')
  const [savingWh, setSavingWh] = useState(false)
  const [editingAccount, setEditingAccount] = useState<FleetAccount | null>(null)
  const [accountForm, setAccountForm] = useState(emptyAccountForm())
  const [accountFormError, setAccountFormError] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<FleetVehicle | null>(null)
  const [form, setForm] = useState(emptyVehicleForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [sellingVehicle, setSellingVehicle] = useState<FleetVehicle | null>(null)
  const [sellForm, setSellForm] = useState(emptySellForm())
  const [sellFormError, setSellFormError] = useState('')
  const [selling, setSelling] = useState(false)

  const [recordsFor, setRecordsFor] = useState<FleetVehicle | null>(null)
  const [recordsTab, setRecordsTab] = useState<'ledger' | 'damage'>('ledger')
  const [transactions, setTransactions] = useState<FleetTransaction[]>([])
  const [damageRecords, setDamageRecords] = useState<FleetDamageRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [txForm, setTxForm] = useState(emptyTxForm())
  const [txSaving, setTxSaving] = useState(false)
  const [damageForm, setDamageForm] = useState(emptyDamageForm())
  const [damageSaving, setDamageSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get<FleetVehicle[]>(`${base}/fleet/vehicles`)
      setVehicles(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل قائمة الأسطول')
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async () => {
    setSummaryLoading(true)
    loadKpis()
    try {
      const params = new URLSearchParams()
      if (statementDateFrom) params.set('date_from', statementDateFrom)
      if (statementDateTo) params.set('date_to', statementDateTo)
      const res = await api.get<FleetSummary>(`${base}/fleet/summary?${params.toString()}`)
      setSummary(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل ملخص الشركة')
    } finally {
      setSummaryLoading(false)
    }
  }

  const loadStatement = async () => {
    setStatementLoading(true)
    try {
      const params = new URLSearchParams()
      if (statementDateFrom) params.set('date_from', statementDateFrom)
      if (statementDateTo) params.set('date_to', statementDateTo)
      const res = await api.get<FleetTransactionWithVehicle[]>(`${base}/fleet/transactions?${params.toString()}`)
      setAllTransactions(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل كشف حركات الشركة')
    } finally {
      setStatementLoading(false)
    }
  }

  const loadWarehouses = async () => {
    try {
      setWarehouses(await api.get<FleetWarehouse[]>(`${base}/fleet/warehouses`))
    } catch { /* the warehouse list is supplementary */ }
  }

  const submitWarehouse = async (e: FormEvent) => {
    e.preventDefault()
    if (!whModal) return
    if (!whModal.name.trim()) { setWhError('اسم المخزن مطلوب'); return }
    setSavingWh(true)
    setWhError('')
    try {
      const payload = { name: whModal.name.trim(), notes: whModal.notes.trim() || null }
      if (whModal.id) await api.put(`${base}/fleet/warehouses/${whModal.id}`, payload)
      else await api.post(`${base}/fleet/warehouses`, payload)
      setWhModal(null)
      await Promise.all([loadWarehouses(), load()])
    } catch (err) {
      setWhError(err instanceof ApiError ? err.message : 'تعذر حفظ المخزن')
    } finally {
      setSavingWh(false)
    }
  }

  const removeWarehouse = async (w: FleetWarehouse) => {
    if (!(await confirmDialog(`هل تريد حذف المخزن "${w.name}"؟`, { requireTypedWord: true }))) return
    setError('')
    try {
      await api.delete(`${base}/fleet/warehouses/${w.id}`)
      await loadWarehouses()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف المخزن')
    }
  }

  const loadKpis = async () => {
    try {
      setKpis(await api.get<FleetKpis>(`${base}/fleet/kpis`))
    } catch {
      /* KPIs are supplementary; the rest of the page still works without them */
    }
  }

  const loadAccounts = async () => {
    setAccountsLoading(true)
    try {
      setWallets(await api.get<FleetAccount[]>(`${base}/fleet/wallets`))
      const res = await api.get<FleetAccount[]>(`${base}/fleet/accounts`)
      setAccounts(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل حسابات الشركة')
    } finally {
      setAccountsLoading(false)
    }
  }

  const handleStatementExport = async (format: 'xlsx' | 'pdf') => {
    const key = `dl-${format}`
    setExporting(key)
    setError('')
    try {
      const params = new URLSearchParams({ format })
      if (statementDateFrom) params.set('date_from', statementDateFrom)
      if (statementDateTo) params.set('date_to', statementDateTo)
      if (statementCcy) params.set('currency', statementCcy)
      const path = `${base}/fleet/statement/export?${params.toString()}`
      if (format === 'pdf') {
        await openFile(path)
      } else {
        await downloadFile(path, `statement_${company}.xlsx`)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل الملف')
    } finally {
      setExporting(null)
    }
  }

  useEffect(() => {
    load()
    loadSummary()
    loadAccounts()
    loadWarehouses()
    api.get<Currency[]>('/currencies').then(setCurrencies).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadSummary()
    if (view === 'statement') loadStatement()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statementDateFrom, statementDateTo, view])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyVehicleForm())
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (v: FleetVehicle) => {
    setEditing(v)
    setForm({
      name: v.name, type: v.type, serialNumber: v.serialNumber || '', chassisNumber: v.chassisNumber || '',
      color: v.color || '', manufactureDate: v.manufactureDate || '', operator: v.operator || '',
      status: v.status, purchaseDate: v.purchaseDate || '', purchasePrice: v.purchasePrice ? String(v.purchasePrice) : '',
      purchasePaymentMethod: v.purchasePaymentMethod || '', purchaseAccountId: v.purchaseManualBank ? MANUAL_ACCOUNT : (v.purchaseAccountId || ''), sellerName: v.sellerName || '', warehouseId: v.warehouseId || '', bankName: '', bankAccountNumber: '', bankHolder: '',
      currency: v.currency, notes: v.notes || '',
    })
    setFormError('')
    setShowModal(true)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.type.trim()) {
      setFormError('الاسم والنوع حقول مطلوبة')
      return
    }
    const purchasePrice = parseFloat(form.purchasePrice) || 0
    const manualBank = purchasePrice > 0 && form.purchasePaymentMethod === 'bank' && form.purchaseAccountId === MANUAL_ACCOUNT
    if (purchasePrice > 0 && !form.purchasePaymentMethod) {
      setFormError('اختر طريقة الدفع: نقدي أو بنك')
      return
    }
    if (purchasePrice > 0 && form.purchasePaymentMethod === 'bank' && !form.purchaseAccountId) {
      setFormError('اختر الحساب البنكي المستخدم للشراء أو اختر «إدخال يدوي»')
      return
    }
    if (manualBank && (!form.sellerName.trim() || !form.bankName.trim() || !form.bankAccountNumber.trim() || !form.bankHolder.trim())) {
      setFormError('الإدخال اليدوي: أدخل اسم البائع، واسم البنك ورقم الحساب واسم صاحب حساب الشركة')
      return
    }
    const manualDetails = manualBank ? `البنك: ${form.bankName.trim()} — رقم الحساب: ${form.bankAccountNumber.trim()} — صاحب الحساب: ${form.bankHolder.trim()}` : null
    setSaving(true)
    try {
      if (editing) {
        const payload = {
          name: form.name.trim(), type: form.type.trim(), serial_number: form.serialNumber.trim() || null,
          chassis_number: form.chassisNumber.trim() || null, color: form.color.trim() || null,
          manufacture_date: form.manufactureDate || null, operator: form.operator.trim() || null,
          status: form.status, currency: form.currency, notes: form.notes.trim() || null, warehouse_id: form.warehouseId || null,
          purchase_price: purchasePrice, purchase_date: form.purchaseDate || null,
          purchase_payment_method: purchasePrice > 0 ? form.purchasePaymentMethod : null,
          purchase_account_id: purchasePrice > 0 && form.purchasePaymentMethod === 'bank' && !manualBank ? form.purchaseAccountId : null,
          purchase_manual_bank: manualBank, seller_name: form.sellerName.trim() || null, purchase_bank_details: manualDetails,
        }
        await api.put(`${base}/fleet/vehicles/${editing.id}`, payload)
      } else {
        const payload = {
          name: form.name.trim(), type: form.type.trim(), serial_number: form.serialNumber.trim() || null,
          chassis_number: form.chassisNumber.trim() || null, color: form.color.trim() || null,
          manufacture_date: form.manufactureDate || null, operator: form.operator.trim() || null,
          status: form.status, purchase_date: form.purchaseDate || null, purchase_price: purchasePrice,
          purchase_payment_method: purchasePrice > 0 ? form.purchasePaymentMethod : null,
          purchase_account_id: purchasePrice > 0 && form.purchasePaymentMethod === 'bank' && !manualBank ? form.purchaseAccountId : null,
          purchase_manual_bank: manualBank, seller_name: form.sellerName.trim() || null, purchase_bank_details: manualDetails,
          currency: form.currency, notes: form.notes.trim() || null, warehouse_id: form.warehouseId || null,
        }
        await api.post(`${base}/fleet/vehicles`, payload)
      }
      setShowModal(false)
      await Promise.all([load(), loadSummary(), loadAccounts()])
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (v: FleetVehicle) => {
    if (!(await confirmDialog(`هل تريد حذف "${v.name}"؟ سيتم حذف جميع قيوده المالية وسجلات الأضرار الخاصة به أيضاً.`, { requireTypedWord: true }))) return
    setError('')
    try {
      await api.delete(`${base}/fleet/vehicles/${v.id}`)
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف المركبة')
    }
  }

  const openSell = (v: FleetVehicle) => {
    setSellingVehicle(v)
    setSellForm({ ...emptySellForm(), saleCurrency: v.currency })
    setSellFormError('')
  }

  const submitSell = async (e: FormEvent) => {
    e.preventDefault()
    if (!sellingVehicle) return
    setSellFormError('')
    const salePrice = parseFloat(sellForm.salePrice)
    if (!sellForm.buyerName.trim() || !salePrice || salePrice <= 0 || !sellForm.saleDate) {
      setSellFormError('اسم المشتري وسعر البيع وتاريخ البيع حقول مطلوبة')
      return
    }
    const manualSaleBank = sellForm.salePaymentMethod === 'bank' && sellForm.saleAccountId === MANUAL_ACCOUNT
    if (sellForm.salePaymentMethod === 'bank' && !sellForm.saleAccountId) {
      setSellFormError('اختر الحساب المستلِم أو «إدخال يدوي»')
      return
    }
    if (manualSaleBank && (!sellForm.saleBankName.trim() || !sellForm.saleBankAccount.trim() || !sellForm.saleBankHolder.trim())) {
      setSellFormError('الإدخال اليدوي: أدخل اسم البنك ورقم الحساب واسم صاحب الحساب')
      return
    }
    const saleBankDetails = manualSaleBank ? `البنك: ${sellForm.saleBankName.trim()} — رقم الحساب: ${sellForm.saleBankAccount.trim()} — صاحب الحساب: ${sellForm.saleBankHolder.trim()}` : null
    setSelling(true)
    try {
      await api.post(`${base}/fleet/vehicles/${sellingVehicle.id}/sell`, {
        buyer_name: sellForm.buyerName.trim(), sale_price: salePrice, sale_date: sellForm.saleDate,
        sale_payment_method: sellForm.salePaymentMethod, sale_currency: sellForm.saleCurrency || sellingVehicle.currency,
        sale_account_id: sellForm.salePaymentMethod === 'bank' && !manualSaleBank ? sellForm.saleAccountId : null,
        sale_manual_bank: manualSaleBank,
        sale_client_account_id: sellForm.salePaymentMethod === 'bank' ? (sellForm.saleClientAccountId || null) : null,
        sale_bank_details: saleBankDetails,
        notes: sellForm.notes.trim() || null,
      })
      setSellingVehicle(null)
      await Promise.all([load(), loadSummary(), loadAccounts()])
    } catch (err) {
      setSellFormError(err instanceof ApiError ? err.message : 'تعذر تسجيل عملية البيع')
    } finally {
      setSelling(false)
    }
  }

  const openCreateAccount = () => {
    setEditingAccount(null)
    setAccountForm(emptyAccountForm())
    setAccountFormError('')
    setShowAccountModal(true)
  }

  const openEditAccount = (a: FleetAccount) => {
    setEditingAccount(a)
    setAccountForm({ name: a.name, currency: a.currency, accountType: a.accountType, accountNumber: a.accountNumber || '', bankName: a.bankName || '', notes: a.notes || '' })
    setAccountFormError('')
    setShowAccountModal(true)
  }

  const submitAccount = async (e: FormEvent) => {
    e.preventDefault()
    setAccountFormError('')
    if (!accountForm.name.trim()) {
      setAccountFormError('اسم الحساب حقل مطلوب')
      return
    }
    setSavingAccount(true)
    try {
      const payload = {
        name: accountForm.name.trim(), currency: accountForm.currency, account_type: accountForm.accountType,
        account_number: accountForm.accountNumber.trim() || null, bank_name: accountForm.bankName.trim() || null,
        notes: accountForm.notes.trim() || null,
      }
      if (editingAccount) {
        await api.put(`${base}/fleet/accounts/${editingAccount.id}`, payload)
      } else {
        await api.post(`${base}/fleet/accounts`, payload)
      }
      setShowAccountModal(false)
      await loadAccounts()
    } catch (err) {
      setAccountFormError(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات')
    } finally {
      setSavingAccount(false)
    }
  }

  const toggleAccountActive = async (a: FleetAccount) => {
    try {
      await api.put(`${base}/fleet/accounts/${a.id}/toggle_active`, {})
      await loadAccounts()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحديث حالة الحساب')
    }
  }

  const removeAccount = async (a: FleetAccount) => {
    if (!(await confirmDialog(`هل تريد حذف حساب "${a.name}"؟`, { requireTypedWord: true }))) return
    setError('')
    try {
      await api.delete(`${base}/fleet/accounts/${a.id}`)
      await loadAccounts()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف الحساب — تأكد أنه لا يحتوي على قيود مسجلة')
    }
  }

  const openRecords = async (v: FleetVehicle) => {
    setRecordsFor(v)
    setRecordsTab('ledger')
    setTxForm(emptyTxForm())
    setDamageForm(emptyDamageForm())
    setRecordsLoading(true)
    try {
      const [tx, dmg] = await Promise.all([
        api.get<FleetTransaction[]>(`${base}/fleet/vehicles/${v.id}/transactions`),
        api.get<FleetDamageRecord[]>(`${base}/fleet/vehicles/${v.id}/damage`),
      ])
      setTransactions(tx)
      setDamageRecords(dmg)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل السجلات')
    } finally {
      setRecordsLoading(false)
    }
  }

  const submitTx = async (e: FormEvent) => {
    e.preventDefault()
    if (!recordsFor) return
    if (!txForm.category.trim() || !txForm.amount || parseFloat(txForm.amount) <= 0 || !txForm.date) {
      setError('الفئة والمبلغ والتاريخ حقول مطلوبة')
      return
    }
    setTxSaving(true)
    setError('')
    try {
      await api.post(`${base}/fleet/vehicles/${recordsFor.id}/transactions`, {
        type: txForm.type, category: txForm.category.trim(), amount: parseFloat(txForm.amount),
        currency: txForm.currency, date: txForm.date, notes: txForm.notes.trim() || null,
        account_id: txForm.accountId || null, counterparty: txForm.counterparty.trim() || null,
      })
      setTxForm(emptyTxForm())
      const [tx] = await Promise.all([api.get<FleetTransaction[]>(`${base}/fleet/vehicles/${recordsFor.id}/transactions`), load(), loadSummary(), loadAccounts()])
      setTransactions(tx)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إضافة القيد')
    } finally {
      setTxSaving(false)
    }
  }

  const deleteTx = async (t: FleetTransaction) => {
    if (!(await confirmDialog('هل تريد حذف هذا القيد؟'))) return
    if (!recordsFor) return
    try {
      await api.delete(`${base}/fleet/transactions/${t.id}`)
      setTransactions((prev) => prev.filter((x) => x.id !== t.id))
      await Promise.all([load(), loadSummary(), loadAccounts()])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف القيد')
    }
  }

  const submitDamage = async (e: FormEvent) => {
    e.preventDefault()
    if (!recordsFor) return
    if (!damageForm.description.trim() || !damageForm.date) {
      setError('الوصف والتاريخ حقول مطلوبة')
      return
    }
    setDamageSaving(true)
    setError('')
    try {
      await api.post(`${base}/fleet/vehicles/${recordsFor.id}/damage`, {
        date: damageForm.date, description: damageForm.description.trim(), cost: parseFloat(damageForm.cost) || 0,
        currency: damageForm.currency, reported_by: damageForm.reportedBy.trim() || null, status: damageForm.status,
      })
      setDamageForm(emptyDamageForm())
      const [dmg] = await Promise.all([api.get<FleetDamageRecord[]>(`${base}/fleet/vehicles/${recordsFor.id}/damage`), load(), loadSummary()])
      setDamageRecords(dmg)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تسجيل الضرر')
    } finally {
      setDamageSaving(false)
    }
  }

  const changeDamageStatus = async (d: FleetDamageRecord, status: string) => {
    try {
      await api.put(`${base}/fleet/damage/${d.id}`, { status })
      setDamageRecords((prev) => prev.map((x) => (x.id === d.id ? { ...x, status } : x)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحديث الحالة')
    }
  }

  const deleteDamage = async (d: FleetDamageRecord) => {
    if (!(await confirmDialog('هل تريد حذف سجل الضرر هذا؟'))) return
    if (!recordsFor) return
    try {
      await api.delete(`${base}/fleet/damage/${d.id}`)
      setDamageRecords((prev) => prev.filter((x) => x.id !== d.id))
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف السجل')
    }
  }

  const fVehicles = useTableFilters(vehicles, { onChange: () => setPage(1) })
  const pagedVehicles = paginate(fVehicles.filtered, page)
  const [statementCcy, setStatementCcy] = useState('')
  const statementCurrencies = Array.from(new Set(allTransactions.map((t) => t.currency)))
  const shownTransactions = statementCcy ? allTransactions.filter((t) => t.currency === statementCcy) : allTransactions
  const fStatement = useTableFilters(shownTransactions, { onChange: () => setStatementPage(1) })
  const fWarehouses = useTableFilters(warehouses)
  const fAccounts = useTableFilters(accounts)
  const pagedStatement = paginate(fStatement.filtered, statementPage)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Truck className="h-6 w-6 text-primary" /> {companyName} للمركبات والمعدات الثقيلة</h2>
          <p className="text-xs text-muted-foreground mt-1">نظام مستقل لـ{companyName} — تشتري وتبيع وتؤجّر السيارات والمعدات الثقيلة (جرافات، إسعاف، إلخ) — حساباتها وأرباحها وأضرارها الخاصة، منفصل تماماً عن الأصول الثابتة والخزائن والحسابات البنكية.</p>
        </div>
        {canManage && view === 'vehicles' && (
          <button onClick={openCreate} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> إضافة مركبة/معدة
          </button>
        )}
        {canManage && view === 'accounts' && (
          <button onClick={openCreateAccount} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> إضافة حساب
          </button>
        )}
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

      {/* Company-wide KPI dashboard */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><TrendingUp className="h-4 w-4 text-success" /> إجمالي الإيرادات</div>
          <p className="text-2xl font-bold text-foreground" dir="ltr">{summaryLoading ? '—' : (summary?.totalIncomeLyd ?? 0).toLocaleString()} د.ل</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><TrendingDown className="h-4 w-4 text-danger" /> إجمالي التكاليف</div>
          <p className="text-2xl font-bold text-foreground" dir="ltr">{summaryLoading ? '—' : (summary?.totalCostsLyd ?? 0).toLocaleString()} د.ل</p>
          <p className="text-xs text-muted-foreground mt-1">مصروفات {(summary?.totalExpenseLyd ?? 0).toLocaleString()} + أضرار {(summary?.totalDamageCostLyd ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><Landmark className="h-4 w-4 text-primary" /> صافي الربح</div>
          <p className={`text-2xl font-bold ${(summary?.netProfitLyd ?? 0) < 0 ? 'text-danger' : 'text-foreground'}`} dir="ltr">{summaryLoading ? '—' : (summary?.netProfitLyd ?? 0).toLocaleString()} د.ل</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><Truck className="h-4 w-4 text-primary" /> عدد المركبات/المعدات</div>
          <p className="text-2xl font-bold text-foreground">{summaryLoading ? '—' : summary?.vehicleCount ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {summary && Object.entries(summary.statusCounts).map(([s, c]) => `${s}: ${c}`).join(' · ')}
          </p>
        </div>
      </div>

      {/* Cash wallet + weekly / monthly performance */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {wallets.map((w) => (
          <div key={w.id} className="rounded-xl border border-success/30 bg-success/5 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><Wallet className="h-4 w-4 text-success" /> المحفظة النقدية ({w.currency})</div>
            <p className="text-2xl font-bold text-foreground" dir="ltr">{money(w.balance)} {w.currency}</p>
            <p className="text-xs text-muted-foreground mt-1">يتتبّع العمليات النقدية فقط (شراء / بيع / قيود نقدية)</p>
          </div>
        ))}
      </div>
      {kpis && (
        <div className="grid gap-6 lg:grid-cols-2">
          {([
            { key: 'week', title: 'أداء الأسبوع', icon: TrendingUp, sub: `${kpis.week.from.replace(/-/g, '/')} → ${kpis.week.to.replace(/-/g, '/')} · آخر 7 أيام`, prevLabel: 'الأسبوع السابق', k: kpis.week, series: kpis.week.daily.map((d) => ({ x: d.date.slice(5).replace('-', '/'), profit: d.profit })) },
            { key: 'month', title: 'مؤشرات الشهر', icon: CalendarRange, sub: `${kpis.month.label.replace('-', '/')} · حتى اليوم`, prevLabel: 'الشهر السابق', k: kpis.month, series: kpis.month.trend.map((m) => ({ x: m.month.replace('-', '/'), profit: m.profit })) },
          ] as const).map((c) => (
            <div key={c.key} className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold text-foreground"><c.icon className="h-5 w-5 text-primary" /> {c.title}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{c.sub}</p>
                </div>
                <ChangeBadge pct={c.k.profitChangePct} label={c.prevLabel} />
              </div>
              <p className={`mt-4 text-3xl font-bold ${c.k.profit < 0 ? 'text-danger' : 'text-foreground'}`} dir="ltr">{money(c.k.profit)} <span className="text-sm font-medium text-muted-foreground">د.ل</span></p>
              <p className="text-xs text-muted-foreground">صافي الربح — {c.prevLabel}: {money(c.k.previous.profit)} د.ل</p>
              <ChartContainer config={kpiChartConfig} className="mt-4 h-40 w-full" dir="ltr" style={{ direction: 'ltr' }}>
                <BarChart data={c.series} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="x" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => `\u200E${v < 0 ? '\u2212' : ''}${Math.abs(v).toLocaleString('en-US')}`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="profit" fill="var(--color-profit)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <MiniStat label="الإيرادات" value={money(c.k.income)} tone="success" />
                <MiniStat label="المصروفات والأضرار" value={money(c.k.expense)} tone="danger" />
                <MiniStat label="عدد القيود" value={String(c.k.count)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View switcher */}
      <div className="flex border-b border-border">
        <button onClick={() => setView('vehicles')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'vehicles' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Truck className="h-3.5 w-3.5" /> المركبات والمعدات
        </button>
        <button onClick={() => setView('statement')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'statement' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <ListTree className="h-3.5 w-3.5" /> كشف حركات الشركة
        </button>
        <button onClick={() => setView('warehouses')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'warehouses' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Package className="h-3.5 w-3.5" /> المخازن
        </button>
        <button onClick={() => setView('accounts')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'accounts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Landmark className="h-3.5 w-3.5" /> الحسابات
        </button>
      </div>

      {view === 'statement' && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">من تاريخ</label>
                <DateInput value={statementDateFrom} onChange={(e) => setStatementDateFrom(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">إلى تاريخ</label>
                <DateInput value={statementDateTo} onChange={(e) => setStatementDateTo(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
                <select value={statementCcy} onChange={(e) => { setStatementCcy(e.target.value); setStatementPage(1) }} className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">كل العملات (كل عملة في جدول منفصل)</option>
                  {statementCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleStatementExport('pdf')} disabled={exporting === 'dl-pdf'} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60">
                {exporting === 'dl-pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} فتح PDF
              </button>
              <button onClick={() => handleStatementExport('xlsx')} disabled={exporting === 'dl-xlsx'} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60">
                {exporting === 'dl-xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} تحميل Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'warehouses' ? (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h3 className="text-base font-semibold text-foreground">مخازن السيارات</h3>
            {canManage && (
              <button onClick={() => { setWhModal({ id: null, name: '', notes: '' }); setWhError('') }} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> إضافة مخزن
              </button>
            )}
          </div>
          {fWarehouses.filterBar}
          {warehouses.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">لا توجد مخازن — أضف مخزناً ثم اربط السيارات به من نموذج السيارة</p>
          ) : (
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">اسم المخزن</th>
                  <th className="px-4 py-3 font-medium">السيارات الحالية</th>
                  <th className="px-4 py-3 font-medium">إجمالي السيارات</th>
                  <th className="px-4 py-3 font-medium">ملاحظات</th>
                  {canManage && <th className="px-4 py-3 font-medium">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fWarehouses.filtered.map((w) => (
                  <tr key={w.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-medium">{w.name}</td>
                    <td className="px-4 py-3">{w.inStockCount}</td>
                    <td className="px-4 py-3">{w.vehicleCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">{w.notes || '—'}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button onClick={() => { setWhModal({ id: w.id, name: w.name, notes: w.notes || '' }); setWhError('') }} className="text-xs font-medium text-primary hover:underline">تعديل</button>
                          <button onClick={() => removeWarehouse(w)} className="text-xs font-medium text-danger hover:underline">حذف</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : view === 'accounts' ? (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {fAccounts.filterBar}
          {accountsLoading ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">جاري التحميل...</p>
          ) : accounts.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">لا توجد حسابات مسجلة بعد لـ{companyName}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">اسم الحساب</th>
                    <th className="px-4 py-3 font-medium">النوع</th>
                    <th className="px-4 py-3 font-medium">البنك</th>
                    <th className="px-4 py-3 font-medium">رقم الحساب</th>
                    <th className="px-4 py-3 font-medium">العملة</th>
                    <th className="px-4 py-3 font-medium">الرصيد</th>
                    <th className="px-4 py-3 font-medium">الحالة</th>
                    {canManage && <th className="px-4 py-3 font-medium">إجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {fAccounts.filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{a.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${a.accountType === 'company' ? 'bg-primary/10 text-primary' : a.accountType === 'wallet' ? 'bg-success/10 text-success' : 'bg-info/10 text-info'}`}>
                          {a.accountType === 'company' ? 'حساب شركة' : a.accountType === 'wallet' ? 'محفظة نقدية' : 'حساب عميل'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{a.bankName || '—'}</td>
                      <td className="px-4 py-3" dir="ltr">{a.accountNumber || '—'}</td>
                      <td className="px-4 py-3">{a.currency}</td>
                      <td className="px-4 py-3 font-medium" dir="ltr">{a.accountType === 'client' ? '—' : `${a.balance.toLocaleString()} ${a.currency}`}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${a.isActive ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground'}`}>{a.isActive ? 'نشط' : 'معطّل'}</span>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditAccount(a)} className="text-xs font-medium text-primary hover:underline">تعديل</button>
                            <button onClick={() => toggleAccountActive(a)} className="text-muted-foreground hover:text-foreground" title={a.isActive ? 'تعطيل' : 'تفعيل'}>
                              <Power className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => removeAccount(a)} className="text-xs font-medium text-danger hover:underline">حذف</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : view === 'statement' ? (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {fStatement.filterBar}
          {statementLoading ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">جاري التحميل...</p>
          ) : shownTransactions.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">لا توجد حركات مسجلة في هذه الفترة</p>
          ) : (
            <div>
              {Array.from(new Set(pagedStatement.map((t) => t.currency))).map((ccy) => (
                <div key={ccy}>
                  <div className="border-b border-border bg-secondary/30 px-4 py-2 text-sm font-semibold text-foreground">حركات {ccy}</div>
                  <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">التاريخ</th>
                    <th className="px-4 py-3 font-medium">المركبة/المعدة</th>
                    <th className="px-4 py-3 font-medium">رقم الهيكل</th>
                    <th className="px-4 py-3 font-medium">سعر الشراء</th>
                    <th className="px-4 py-3 font-medium">التفاصيل</th>
                    <th className="px-4 py-3 font-medium">دخول</th>
                    <th className="px-4 py-3 font-medium">خروج</th>
                    <th className="px-4 py-3 font-medium">العملة</th>
                    <th className="px-4 py-3 font-medium">من</th>
                    <th className="px-4 py-3 font-medium">إلى</th>
                    <th className="px-4 py-3 font-medium">الرصيد بعد</th>
                    <th className="px-4 py-3 font-medium">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagedStatement.filter((t) => t.currency === ccy).map((t) => {
                    const accountLabel = t.accountName || '—'
                    const counterpartyLabel = t.counterparty || '—'
                    const [fromLabel, toLabel] = t.type === 'income' ? [counterpartyLabel, accountLabel] : [accountLabel, counterpartyLabel]
                    const isClientLinked = accounts.find((a) => a.id === t.accountId)?.accountType === 'client'
                    return (
                      <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3">{t.date}</td>
                        <td className="px-4 py-3 font-medium">{t.vehicleName}</td>
                        <td className="px-4 py-3" dir="ltr">{t.vehicleChassis || '—'}</td>
                        <td className="px-4 py-3" dir="ltr">{t.vehiclePurchasePrice ? `${t.vehiclePurchasePrice.toLocaleString()} ${t.vehiclePurchaseCurrency || ''}` : '—'}</td>
                        <td className="px-4 py-3">{t.category}</td>
                        <td className="px-4 py-3 text-success" dir="ltr">{t.type === 'income' ? t.amount.toLocaleString() : ''}</td>
                        <td className="px-4 py-3 text-danger" dir="ltr">{t.type === 'expense' ? t.amount.toLocaleString() : ''}</td>
                        <td className="px-4 py-3">{t.currency}</td>
                        <td className="px-4 py-3">{fromLabel}</td>
                        <td className="px-4 py-3">{toLabel}</td>
                        <td className="px-4 py-3" dir="ltr">{t.balanceAfter !== null && !isClientLinked ? t.balanceAfter.toLocaleString() : '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.notes || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
                </div>
              ))}
            </div>
          )}
          <TablePagination page={statementPage} totalItems={fStatement.filtered.length} onPageChange={setStatementPage} />
        </div>
      ) : (
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">جاري التحميل...</p>
        ) : vehicles.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">لا توجد مركبات أو معدات مسجلة بعد</p>
        ) : (
          <div className="overflow-x-auto">
            {fVehicles.filterBar}
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">الرقم</th>
                  <th className="px-4 py-3 font-medium">الاسم</th>
                  <th className="px-4 py-3 font-medium">النوع</th>
                  <th className="px-4 py-3 font-medium">اللوحة</th>
                  <th className="px-4 py-3 font-medium">رقم الهيكل</th>
                  <th className="px-4 py-3 font-medium">اللون</th>
                  <th className="px-4 py-3 font-medium">المخزن</th>
                  <th className="px-4 py-3 font-medium">السائق/المشغّل</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3 font-medium">الرصيد</th>
                  <th className="px-4 py-3 font-medium">الربح</th>
                  <th className="px-4 py-3 font-medium">السجلات</th>
                  {canManage && <th className="px-4 py-3 font-medium">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedVehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground" dir="ltr">#{formatAutoNumber(v.autoNumber)}</td>
                    <td className="px-4 py-3 font-medium">{v.name}</td>
                    <td className="px-4 py-3">{v.type}</td>
                    <td className="px-4 py-3" dir="ltr">{v.serialNumber || '—'}</td>
                    <td className="px-4 py-3" dir="ltr">{v.chassisNumber || '—'}</td>
                    <td className="px-4 py-3">{v.color || '—'}</td>
                    <td className="px-4 py-3">{v.warehouseName || '—'}</td>
                    <td className="px-4 py-3">{v.operator || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{v.status}</span>
                    </td>
                    <td className="px-4 py-3">{balanceBadge(v.balances)}</td>
                    <td className="px-4 py-3">
                      {v.profit !== null ? (
                        <span dir="ltr" className={`rounded-full px-2 py-0.5 text-xs font-medium ${v.profit < 0 ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
                          {v.profit.toLocaleString()} {v.profitCurrency}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openRecords(v)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors">
                        <Wallet className="h-3.5 w-3.5" /> السجلات
                      </button>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(v)} className="text-xs font-medium text-primary hover:underline">تعديل</button>
                          {v.salePrice === null && (
                            <button onClick={() => openSell(v)} className="text-xs font-medium text-success hover:underline">بيع</button>
                          )}
                          <button onClick={() => remove(v)} className="text-xs font-medium text-danger hover:underline">حذف</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination page={page} totalItems={fVehicles.filtered.length} onPageChange={setPage} />
      </div>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
              <h3 className="text-lg font-semibold text-foreground">{editing ? 'تعديل بيانات مركبة/معدة' : 'إضافة مركبة/معدة جديدة'}</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submit} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 text-right">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الاسم *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">النوع * (سيارة، جرافة، إسعاف، إلخ)</label>
                  <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">اللوحة</label>
                  <input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رقم الهيكل</label>
                  <input value={form.chassisNumber} onChange={(e) => setForm({ ...form, chassisNumber: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">اللون</label>
                  <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">تاريخ الصنع</label>
                  <DateInput value={form.manufactureDate} onChange={(e) => setForm({ ...form, manufactureDate: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">السائق/المشغّل</label>
                  <input value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الحالة</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    {VEHICLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">المخزن</label>
                <select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">بدون مخزن الآن — يُحدَّد لاحقاً</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">عملة الحسابات</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} disabled={!!editing} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60">
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.nameAr} ({c.code})</option>)}
                  </select>
                </div>
                {(
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">تاريخ الشراء</label>
                    <DateInput value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                )}
              </div>
              {(
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">سعر الشراء</label>
                      <NumberInput step="any" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">طريقة الدفع {(parseFloat(form.purchasePrice) || 0) > 0 && '*'}</label>
                      <select value={form.purchasePaymentMethod} onChange={(e) => setForm({ ...form, purchasePaymentMethod: e.target.value as FleetPaymentMethod | '', purchaseAccountId: '' })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                        <option value="">اختر: نقدي أو بنك</option>
                        <option value="cash">نقدي</option>
                        <option value="bank">بنك</option>
                      </select>
                    </div>
                  </div>
                  {(parseFloat(form.purchasePrice) || 0) > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">اسم البائع {form.purchaseAccountId === MANUAL_ACCOUNT ? '*' : '(اختياري)'}</label>
                      <input value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                  )}
                  {(parseFloat(form.purchasePrice) || 0) > 0 && form.purchasePaymentMethod === 'bank' && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">حساب {companyName} الذي دُفع منه</label>
                      <select value={form.purchaseAccountId} onChange={(e) => setForm({ ...form, purchaseAccountId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                        <option value="">اختر الحساب</option>
                        {accounts.filter((a) => a.currency === form.currency && a.isActive && a.accountType === 'company').map((a) => (
                          <option key={a.id} value={a.id}>{a.name} — رصيده الحالي {a.balance.toLocaleString()} {a.currency}</option>
                        ))}
                        <option value={MANUAL_ACCOUNT}>إدخال يدوي (بدون حساب مسجل)</option>
                      </select>
                      {form.purchaseAccountId === MANUAL_ACCOUNT && (
                        <div className="mt-3 space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
                          <p className="text-xs text-muted-foreground">بيانات حساب {companyName} الذي دُفع منه — تظهر في الكشف في خانة «من»، دون خصم من أي حساب مسجل.</p>
                          <div className="grid grid-cols-2 gap-3">
                            <input placeholder="اسم البنك *" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                            <input placeholder="رقم الحساب / IBAN *" value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} dir="ltr" className="rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                          </div>
                          <input placeholder="اسم صاحب الحساب *" value={form.bankHolder} onChange={(e) => setForm({ ...form, bankHolder: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              {formError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Records modal */}
      {recordsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">سجلات — {recordsFor.name}</h3>
              <button onClick={() => setRecordsFor(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex border-b border-border px-6">
              <button onClick={() => setRecordsTab('ledger')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${recordsTab === 'ledger' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> الحساب (إيرادات/مصروفات)</span>
              </button>
              <button onClick={() => setRecordsTab('damage')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${recordsTab === 'damage' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                <span className="flex items-center gap-1"><TriangleAlert className="h-3.5 w-3.5" /> سجلات الأضرار</span>
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              {recordsLoading ? (
                <p className="text-center text-sm text-muted-foreground py-4">جاري التحميل...</p>
              ) : recordsTab === 'ledger' ? (
                <>
                  {canManage && (
                    <form onSubmit={submitTx} className="rounded-md border border-border p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <select value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value as FleetTransactionType })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                          <option value="income">إيراد</option>
                          <option value="expense">مصروف</option>
                        </select>
                        <input placeholder="الفئة (إيجار، وقود، صيانة...)" value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <NumberInput step="any" placeholder="المبلغ" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        <select value={txForm.currency} onChange={(e) => setTxForm({ ...txForm, currency: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                          {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                        </select>
                        <DateInput value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                      <div>
                        <select value={txForm.accountId} onChange={(e) => setTxForm({ ...txForm, accountId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                          <option value="">نقدي — عبر المحفظة النقدية</option>
                          {accounts.filter((a) => a.currency === txForm.currency && a.isActive).map((a) => (
                            <option key={a.id} value={a.id}>{a.accountType === 'client' ? a.name : `${a.name} — رصيده الحالي ${a.balance.toLocaleString()} ${a.currency}`}</option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">اختر الحساب الذي تحرّكت منه/إليه هذه العملية، أو اتركه «نقدي» ليُسجَّل على المحفظة النقدية — يُحدَّث الرصيد تلقائياً.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">
                          {txForm.type === 'income' ? 'من (مصدر هذا الإيراد) — من دفع؟' : 'إلى (وجهة هذا المصروف) — لمن/أين دُفع؟'}
                        </label>
                        <input
                          placeholder={txForm.type === 'income' ? 'مثال: العميل أحمد، إيجار من شركة كذا...' : 'مثال: محطة وقود كذا، ورشة الصيانة...'}
                          value={txForm.counterparty}
                          onChange={(e) => setTxForm({ ...txForm, counterparty: e.target.value })}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {txForm.type === 'income' ? 'الجهة التي دفعت هذا المبلغ قبل أن يدخل الحساب.' : 'الجهة التي استلمت هذا المبلغ بعد أن خرج من الحساب.'}
                        </p>
                      </div>
                      <input placeholder="ملاحظات (اختياري)" value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      <div className="flex justify-end">
                        <button type="submit" disabled={txSaving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                          {txSaving && <Loader2 className="h-4 w-4 animate-spin" />} إضافة القيد
                        </button>
                      </div>
                    </form>
                  )}
                  {transactions.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-4">لا توجد قيود مسجلة بعد</p>
                  ) : (
                    <div className="space-y-2">
                      {transactions.map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                          <div className="text-sm">
                            <span className={`font-medium ${t.type === 'income' ? 'text-success' : 'text-danger'}`}>{t.type === 'income' ? 'إيراد' : 'مصروف'}</span>
                            {' — '}{t.category} — <span dir="ltr">{t.amount.toLocaleString()} {t.currency}</span> — {t.date}
                            {t.accountName && (
                              <span className="text-muted-foreground">
                                {' '}— حساب {t.accountName}
                                {accounts.find((a) => a.id === t.accountId)?.accountType !== 'client' && ` (الرصيد بعد: ${t.balanceAfter?.toLocaleString()})`}
                              </span>
                            )}
                            <span className="text-muted-foreground"> — {t.type === 'income' ? 'من' : 'إلى'}: {t.counterparty || 'غير محدد'}</span>
                            {t.notes && <span className="text-muted-foreground"> ({t.notes})</span>}
                          </div>
                          {canManage && (
                            <button onClick={() => deleteTx(t)} className="text-muted-foreground hover:text-danger shrink-0" title="حذف">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {canManage && (
                    <form onSubmit={submitDamage} className="rounded-md border border-border p-4 space-y-3">
                      <textarea placeholder="وصف الضرر *" value={damageForm.description} onChange={(e) => setDamageForm({ ...damageForm, description: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      <div className="grid grid-cols-3 gap-3">
                        <NumberInput step="any" placeholder="التكلفة" value={damageForm.cost} onChange={(e) => setDamageForm({ ...damageForm, cost: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        <select value={damageForm.currency} onChange={(e) => setDamageForm({ ...damageForm, currency: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                          {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                        </select>
                        <DateInput value={damageForm.date} onChange={(e) => setDamageForm({ ...damageForm, date: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input placeholder="تم الإبلاغ بواسطة (اختياري)" value={damageForm.reportedBy} onChange={(e) => setDamageForm({ ...damageForm, reportedBy: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        <select value={damageForm.status} onChange={(e) => setDamageForm({ ...damageForm, status: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                          {DAMAGE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <p className="text-xs text-muted-foreground">تكلفة الضرر تُخصم تلقائياً من رصيد المركبة/المعدة.</p>
                      <div className="flex justify-end">
                        <button type="submit" disabled={damageSaving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                          {damageSaving && <Loader2 className="h-4 w-4 animate-spin" />} تسجيل الضرر
                        </button>
                      </div>
                    </form>
                  )}
                  {damageRecords.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-4">لا توجد أضرار مسجلة</p>
                  ) : (
                    <div className="space-y-2">
                      {damageRecords.map((d) => (
                        <div key={d.id} className="rounded-md border border-border px-3 py-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{d.date} — <span dir="ltr">{d.cost.toLocaleString()} {d.currency}</span></span>
                            <div className="flex items-center gap-2">
                              {canManage ? (
                                <select value={d.status} onChange={(e) => changeDamageStatus(d, e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50">
                                  {DAMAGE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              ) : (
                                <span className="text-xs text-muted-foreground">{d.status}</span>
                              )}
                              {canManage && (
                                <button onClick={() => deleteDamage(d)} className="text-muted-foreground hover:text-danger" title="حذف">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">{d.description}</p>
                          {d.reportedBy && <p className="text-xs text-muted-foreground">أبلغ عنه: {d.reportedBy}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sell vehicle modal */}
      {sellingVehicle && (() => {
        const saleCcy = sellForm.saleCurrency || sellingVehicle.currency
        const sameCcy = saleCcy === sellingVehicle.currency
        const salePriceNum = parseFloat(sellForm.salePrice)
        const isBank = sellForm.salePaymentMethod === 'bank'
        const isManual = isBank && sellForm.saleAccountId === MANUAL_ACCOUNT
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2"><Tag className="h-4 w-4 text-success" /> بيع {sellingVehicle.name}
                <span className="text-xs font-normal text-muted-foreground" dir="ltr">(شراء: {sellingVehicle.purchasePrice.toLocaleString()} {sellingVehicle.currency})</span></h3>
              <button onClick={() => setSellingVehicle(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitSell} className="flex min-h-0 flex-1 flex-col text-right">
              <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 overflow-y-auto p-5">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-foreground">اسم المشتري *</label>
                  <input value={sellForm.buyerName} onChange={(e) => setSellForm({ ...sellForm, buyerName: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">سعر البيع *</label>
                  <NumberInput step="any" value={sellForm.salePrice} onChange={(e) => setSellForm({ ...sellForm, salePrice: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-right" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">عملة البيع</label>
                  <select value={saleCcy} onChange={(e) => setSellForm({ ...sellForm, saleCurrency: e.target.value, saleAccountId: '', saleClientAccountId: '' })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">تاريخ البيع *</label>
                  <DateInput value={sellForm.saleDate} onChange={(e) => setSellForm({ ...sellForm, saleDate: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">طريقة الاستلام</label>
                  <select value={sellForm.salePaymentMethod} onChange={(e) => setSellForm({ ...sellForm, salePaymentMethod: e.target.value as FleetPaymentMethod, saleAccountId: '' })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="cash">نقدي</option>
                    <option value="bank">بنك</option>
                  </select>
                </div>
                {Number.isFinite(salePriceNum) && salePriceNum > 0 && (
                  <p className="col-span-2 text-xs font-medium" dir="ltr">
                    {sameCcy
                      ? <span className={salePriceNum - sellingVehicle.purchasePrice < 0 ? 'text-danger' : 'text-success'}>الربح المتوقع: {(salePriceNum - sellingVehicle.purchasePrice).toLocaleString()} {saleCcy}</span>
                      : <span className="text-muted-foreground">البيع بعملة ({saleCcy}) مختلفة عن الشراء ({sellingVehicle.currency}) — يُحسب الربح بما يعادله بالدينار بعد التسجيل</span>}
                  </p>
                )}
                {isBank && (
                  <>
                    <div className={isManual ? 'col-span-2' : ''}>
                      <label className="mb-1 block text-xs font-medium text-foreground">حساب {companyName} المستلِم *</label>
                      <select value={sellForm.saleAccountId} onChange={(e) => setSellForm({ ...sellForm, saleAccountId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                        <option value="">اختر الحساب</option>
                        {accounts.filter((a) => a.currency === saleCcy && a.isActive && a.accountType === 'company').map((a) => (
                          <option key={a.id} value={a.id}>{a.name} — {a.balance.toLocaleString()} {a.currency}</option>
                        ))}
                        <option value={MANUAL_ACCOUNT}>إدخال يدوي (بدون حساب مسجل)</option>
                      </select>
                    </div>
                    {!isManual && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-foreground">حساب المشتري (اختياري)</label>
                        <select value={sellForm.saleClientAccountId} onChange={(e) => setSellForm({ ...sellForm, saleClientAccountId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                          <option value="">بدون</option>
                          {accounts.filter((a) => a.currency === saleCcy && a.isActive && a.accountType === 'client').map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {isManual && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-foreground">اسم البنك *</label>
                          <input value={sellForm.saleBankName} onChange={(e) => setSellForm({ ...sellForm, saleBankName: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-foreground">رقم الحساب / IBAN *</label>
                          <input value={sellForm.saleBankAccount} onChange={(e) => setSellForm({ ...sellForm, saleBankAccount: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-right" />
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-xs font-medium text-foreground">اسم صاحب الحساب *</label>
                          <input value={sellForm.saleBankHolder} onChange={(e) => setSellForm({ ...sellForm, saleBankHolder: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                        <p className="col-span-2 text-xs text-muted-foreground">يُسجَّل في الكشف بهذه البيانات دون تغيير رصيد أي حساب مسجل.</p>
                      </>
                    )}
                  </>
                )}
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-foreground">ملاحظات</label>
                  <input value={sellForm.notes} onChange={(e) => setSellForm({ ...sellForm, notes: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                {sellFormError && <p className="col-span-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{sellFormError}</p>}
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
                <button type="button" onClick={() => setSellingVehicle(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={selling} className="flex items-center gap-2 rounded-md bg-success px-4 py-2 text-sm font-medium text-success-foreground hover:opacity-90 transition-colors disabled:opacity-60">
                  {selling && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد البيع
                </button>
              </div>
            </form>
          </div>
        </div>
        )
      })()}

      {/* Warehouse modal */}
      {whModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-base font-semibold text-foreground">{whModal.id ? 'تعديل مخزن' : 'إضافة مخزن'}</h3>
              <button onClick={() => setWhModal(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitWarehouse} className="space-y-3 p-5 text-right">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">اسم المخزن *</label>
                <input value={whModal.name} onChange={(e) => setWhModal({ ...whModal, name: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">ملاحظات</label>
                <input value={whModal.notes} onChange={(e) => setWhModal({ ...whModal, notes: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              {whError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{whError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setWhModal(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={savingWh} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                  {savingWh && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account create/edit modal */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editingAccount ? 'تعديل حساب' : 'إضافة حساب جديد'}</h3>
              <button onClick={() => setShowAccountModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitAccount} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">اسم الحساب *</label>
                <input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">نوع الحساب *</label>
                <select value={accountForm.accountType} onChange={(e) => setAccountForm({ ...accountForm, accountType: e.target.value as FleetAccountType })} disabled={!!editingAccount} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60">
                  <option value="company">حساب شركة — يُستخدم لدفع ثمن الشراء</option>
                  <option value="client">حساب عميل — يُستخدم لاستلام قيمة البيع</option>
                </select>
                {editingAccount && <p className="text-xs text-muted-foreground mt-1">لا يمكن تغيير نوع حساب له قيود مسجلة بالفعل.</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">العملة *</label>
                <select value={accountForm.currency} onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })} disabled={!!editingAccount} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60">
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.nameAr} ({c.code})</option>)}
                </select>
                {editingAccount && <p className="text-xs text-muted-foreground mt-1">لا يمكن تغيير عملة حساب له قيود مسجلة بالفعل.</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">البنك (اختياري)</label>
                  <input value={accountForm.bankName} onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رقم الحساب (اختياري)</label>
                  <input value={accountForm.accountNumber} onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea value={accountForm.notes} onChange={(e) => setAccountForm({ ...accountForm, notes: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              {accountFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{accountFormError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAccountModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={savingAccount} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {savingAccount && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
