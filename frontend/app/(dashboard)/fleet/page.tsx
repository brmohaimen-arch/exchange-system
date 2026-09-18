'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Plus, X, Loader2, Trash2, Truck, Wallet, TriangleAlert, TrendingUp, TrendingDown, Landmark, ListTree, FileText, Download, Power, Tag } from 'lucide-react'
import { api, openFile, downloadFile, FleetVehicle, FleetTransaction, FleetTransactionType, FleetDamageRecord, FleetSummary, FleetTransactionWithVehicle, FleetAccount, FleetAccountType, FleetPaymentMethod, Currency } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'
import { TablePagination, paginate } from '@/components/TablePagination'
import { useConfirm } from '@/components/ConfirmProvider'

const VEHICLE_STATUSES = ['نشط', 'صيانة', 'متوقف', 'تم البيع']
const DAMAGE_STATUSES = ['مُبلغ عنه', 'قيد الإصلاح', 'تم الإصلاح']

function formatAutoNumber(n: number) {
  return String(n).padStart(3, '0')
}

function emptyVehicleForm() {
  return {
    name: '', type: '', serialNumber: '', chassisNumber: '', color: '', manufactureDate: '', operator: '', status: 'نشط',
    purchaseDate: '', purchasePrice: '', purchasePaymentMethod: 'cash' as FleetPaymentMethod, purchaseAccountId: '',
    currency: 'LYD', notes: '',
  }
}

function emptySellForm() {
  return { buyerName: '', salePrice: '', saleDate: new Date().toISOString().slice(0, 10), salePaymentMethod: 'cash' as FleetPaymentMethod, saleAccountId: '', saleBankDetails: '', notes: '' }
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

export default function FleetPage() {
  const { hasPermission } = useAuth()
  const confirmDialog = useConfirm()
  const canManage = hasPermission('إدارة شركة بيان')

  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  const [view, setView] = useState<'vehicles' | 'statement' | 'accounts'>('vehicles')
  const [summary, setSummary] = useState<FleetSummary | null>(null)
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
      const res = await api.get<FleetVehicle[]>('/fleet/vehicles')
      setVehicles(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل قائمة الأسطول')
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async () => {
    setSummaryLoading(true)
    try {
      const params = new URLSearchParams()
      if (statementDateFrom) params.set('date_from', statementDateFrom)
      if (statementDateTo) params.set('date_to', statementDateTo)
      const res = await api.get<FleetSummary>(`/fleet/summary?${params.toString()}`)
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
      const res = await api.get<FleetTransactionWithVehicle[]>(`/fleet/transactions?${params.toString()}`)
      setAllTransactions(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل كشف حركات الشركة')
    } finally {
      setStatementLoading(false)
    }
  }

  const loadAccounts = async () => {
    setAccountsLoading(true)
    try {
      const res = await api.get<FleetAccount[]>('/fleet/accounts')
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
      const path = `/fleet/statement/export?${params.toString()}`
      if (format === 'pdf') {
        await openFile(path)
      } else {
        await downloadFile(path, 'statement_bayan.xlsx')
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
      purchasePaymentMethod: v.purchasePaymentMethod || 'cash', purchaseAccountId: v.purchaseAccountId || '',
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
    if (!editing && purchasePrice > 0 && form.purchasePaymentMethod === 'bank' && !form.purchaseAccountId) {
      setFormError('اختر الحساب البنكي المستخدم للشراء')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const payload = {
          name: form.name.trim(), type: form.type.trim(), serial_number: form.serialNumber.trim() || null,
          chassis_number: form.chassisNumber.trim() || null, color: form.color.trim() || null,
          manufacture_date: form.manufactureDate || null, operator: form.operator.trim() || null,
          status: form.status, currency: form.currency, notes: form.notes.trim() || null,
        }
        await api.put(`/fleet/vehicles/${editing.id}`, payload)
      } else {
        const payload = {
          name: form.name.trim(), type: form.type.trim(), serial_number: form.serialNumber.trim() || null,
          chassis_number: form.chassisNumber.trim() || null, color: form.color.trim() || null,
          manufacture_date: form.manufactureDate || null, operator: form.operator.trim() || null,
          status: form.status, purchase_date: form.purchaseDate || null, purchase_price: purchasePrice,
          purchase_payment_method: purchasePrice > 0 ? form.purchasePaymentMethod : null,
          purchase_account_id: purchasePrice > 0 && form.purchasePaymentMethod === 'bank' ? form.purchaseAccountId : null,
          currency: form.currency, notes: form.notes.trim() || null,
        }
        await api.post('/fleet/vehicles', payload)
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
      await api.delete(`/fleet/vehicles/${v.id}`)
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف المركبة')
    }
  }

  const openSell = (v: FleetVehicle) => {
    setSellingVehicle(v)
    setSellForm(emptySellForm())
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
    if (sellForm.salePaymentMethod === 'bank' && !sellForm.saleAccountId) {
      setSellFormError('اختر الحساب البنكي الذي استلم قيمة البيع')
      return
    }
    setSelling(true)
    try {
      await api.post(`/fleet/vehicles/${sellingVehicle.id}/sell`, {
        buyer_name: sellForm.buyerName.trim(), sale_price: salePrice, sale_date: sellForm.saleDate,
        sale_payment_method: sellForm.salePaymentMethod,
        sale_account_id: sellForm.salePaymentMethod === 'bank' ? sellForm.saleAccountId : null,
        sale_bank_details: sellForm.salePaymentMethod === 'bank' ? (sellForm.saleBankDetails.trim() || null) : null,
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
        await api.put(`/fleet/accounts/${editingAccount.id}`, payload)
      } else {
        await api.post('/fleet/accounts', payload)
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
      await api.put(`/fleet/accounts/${a.id}/toggle_active`, {})
      await loadAccounts()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحديث حالة الحساب')
    }
  }

  const removeAccount = async (a: FleetAccount) => {
    if (!(await confirmDialog(`هل تريد حذف حساب "${a.name}"؟`, { requireTypedWord: true }))) return
    setError('')
    try {
      await api.delete(`/fleet/accounts/${a.id}`)
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
        api.get<FleetTransaction[]>(`/fleet/vehicles/${v.id}/transactions`),
        api.get<FleetDamageRecord[]>(`/fleet/vehicles/${v.id}/damage`),
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
      await api.post(`/fleet/vehicles/${recordsFor.id}/transactions`, {
        type: txForm.type, category: txForm.category.trim(), amount: parseFloat(txForm.amount),
        currency: txForm.currency, date: txForm.date, notes: txForm.notes.trim() || null,
        account_id: txForm.accountId || null, counterparty: txForm.counterparty.trim() || null,
      })
      setTxForm(emptyTxForm())
      const [tx] = await Promise.all([api.get<FleetTransaction[]>(`/fleet/vehicles/${recordsFor.id}/transactions`), load(), loadSummary(), loadAccounts()])
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
      await api.delete(`/fleet/transactions/${t.id}`)
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
      await api.post(`/fleet/vehicles/${recordsFor.id}/damage`, {
        date: damageForm.date, description: damageForm.description.trim(), cost: parseFloat(damageForm.cost) || 0,
        currency: damageForm.currency, reported_by: damageForm.reportedBy.trim() || null, status: damageForm.status,
      })
      setDamageForm(emptyDamageForm())
      const [dmg] = await Promise.all([api.get<FleetDamageRecord[]>(`/fleet/vehicles/${recordsFor.id}/damage`), load(), loadSummary()])
      setDamageRecords(dmg)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تسجيل الضرر')
    } finally {
      setDamageSaving(false)
    }
  }

  const changeDamageStatus = async (d: FleetDamageRecord, status: string) => {
    try {
      await api.put(`/fleet/damage/${d.id}`, { status })
      setDamageRecords((prev) => prev.map((x) => (x.id === d.id ? { ...x, status } : x)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحديث الحالة')
    }
  }

  const deleteDamage = async (d: FleetDamageRecord) => {
    if (!(await confirmDialog('هل تريد حذف سجل الضرر هذا؟'))) return
    if (!recordsFor) return
    try {
      await api.delete(`/fleet/damage/${d.id}`)
      setDamageRecords((prev) => prev.filter((x) => x.id !== d.id))
      await Promise.all([load(), loadSummary()])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف السجل')
    }
  }

  const pagedVehicles = paginate(vehicles, page)
  const pagedStatement = paginate(allTransactions, statementPage)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Truck className="h-6 w-6 text-primary" /> شركة بيان للمركبات والمعدات الثقيلة</h2>
          <p className="text-xs text-muted-foreground mt-1">نظام مستقل لشركة بيان — تشتري وتبيع وتؤجّر السيارات والمعدات الثقيلة (جرافات، إسعاف، إلخ) — حساباتها وأرباحها وأضرارها الخاصة، منفصل تماماً عن الأصول الثابتة والخزائن والحسابات البنكية.</p>
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

      {/* View switcher */}
      <div className="flex border-b border-border">
        <button onClick={() => setView('vehicles')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'vehicles' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Truck className="h-3.5 w-3.5" /> المركبات والمعدات
        </button>
        <button onClick={() => setView('statement')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${view === 'statement' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <ListTree className="h-3.5 w-3.5" /> كشف حركات الشركة
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
                <input type="date" value={statementDateFrom} onChange={(e) => setStatementDateFrom(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">إلى تاريخ</label>
                <input type="date" value={statementDateTo} onChange={(e) => setStatementDateTo(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
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

      {view === 'accounts' ? (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {accountsLoading ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">جاري التحميل...</p>
          ) : accounts.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">لا توجد حسابات مسجلة بعد لشركة بيان</p>
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
                  {accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{a.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${a.accountType === 'company' ? 'bg-primary/10 text-primary' : 'bg-info/10 text-info'}`}>
                          {a.accountType === 'company' ? 'حساب شركة' : 'حساب عميل'}
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
          {statementLoading ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">جاري التحميل...</p>
          ) : allTransactions.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">لا توجد حركات مسجلة في هذه الفترة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">التاريخ</th>
                    <th className="px-4 py-3 font-medium">المركبة/المعدة</th>
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
                  {pagedStatement.map((t) => {
                    const accountLabel = t.accountName || '—'
                    const counterpartyLabel = t.counterparty || '—'
                    const [fromLabel, toLabel] = t.type === 'income' ? [counterpartyLabel, accountLabel] : [accountLabel, counterpartyLabel]
                    const isClientLinked = accounts.find((a) => a.id === t.accountId)?.accountType === 'client'
                    return (
                      <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3">{t.date}</td>
                        <td className="px-4 py-3 font-medium">{t.vehicleName}</td>
                        <td className="px-4 py-3">{t.category}</td>
                        <td className="px-4 py-3 text-success" dir="ltr">{t.amount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-danger" dir="ltr">{t.amount.toLocaleString()}</td>
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
          )}
          <TablePagination page={statementPage} totalItems={allTransactions.length} onPageChange={setStatementPage} />
        </div>
      ) : (
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">جاري التحميل...</p>
        ) : vehicles.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">لا توجد مركبات أو معدات مسجلة بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">الرقم</th>
                  <th className="px-4 py-3 font-medium">الاسم</th>
                  <th className="px-4 py-3 font-medium">النوع</th>
                  <th className="px-4 py-3 font-medium">اللوحة</th>
                  <th className="px-4 py-3 font-medium">رقم الهيكل</th>
                  <th className="px-4 py-3 font-medium">اللون</th>
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
                    <td className="px-4 py-3">{v.operator || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{v.status}</span>
                    </td>
                    <td className="px-4 py-3">{balanceBadge(v.balances)}</td>
                    <td className="px-4 py-3">
                      {v.profit !== null ? (
                        <span dir="ltr" className={`rounded-full px-2 py-0.5 text-xs font-medium ${v.profit < 0 ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
                          {v.profit.toLocaleString()} {v.currency}
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
        <TablePagination page={page} totalItems={vehicles.length} onPageChange={setPage} />
      </div>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editing ? 'تعديل بيانات مركبة/معدة' : 'إضافة مركبة/معدة جديدة'}</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submit} className="space-y-4 p-6 text-right max-h-[70vh] overflow-y-auto">
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
                  <input type="date" value={form.manufactureDate} onChange={(e) => setForm({ ...form, manufactureDate: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">عملة الحسابات</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} disabled={!!editing} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60">
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.nameAr} ({c.code})</option>)}
                  </select>
                </div>
                {!editing && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">تاريخ الشراء</label>
                    <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                )}
              </div>
              {editing ? (
                <div className="rounded-md bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                  سعر الشراء: {editing.purchasePrice.toLocaleString()} {editing.currency}
                  {editing.purchasePaymentMethod && ` — ${editing.purchasePaymentMethod === 'cash' ? 'نقدي' : `بنك (${editing.purchaseAccountName || '—'})`}`}
                  <br />بيانات الشراء ثابتة بعد الإضافة لأنها مرتبطة بقيد مالي فعلي.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">سعر الشراء</label>
                      <input type="number" step="any" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                    {(parseFloat(form.purchasePrice) || 0) > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">طريقة الدفع</label>
                        <select value={form.purchasePaymentMethod} onChange={(e) => setForm({ ...form, purchasePaymentMethod: e.target.value as FleetPaymentMethod })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                          <option value="cash">نقدي</option>
                          <option value="bank">بنك</option>
                        </select>
                      </div>
                    )}
                  </div>
                  {(parseFloat(form.purchasePrice) || 0) > 0 && form.purchasePaymentMethod === 'bank' && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">الحساب البنكي المستخدم للشراء</label>
                      <select value={form.purchaseAccountId} onChange={(e) => setForm({ ...form, purchaseAccountId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                        <option value="">اختر الحساب</option>
                        {accounts.filter((a) => a.currency === form.currency && a.isActive && a.accountType === 'company').map((a) => (
                          <option key={a.id} value={a.id}>{a.name} — رصيده الحالي {a.balance.toLocaleString()} {a.currency}</option>
                        ))}
                      </select>
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
                        <input type="number" step="any" placeholder="المبلغ" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        <select value={txForm.currency} onChange={(e) => setTxForm({ ...txForm, currency: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                          {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                        </select>
                        <input type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                      <div>
                        <select value={txForm.accountId} onChange={(e) => setTxForm({ ...txForm, accountId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                          <option value="">بدون حساب — قيد دفتري فقط</option>
                          {accounts.filter((a) => a.currency === txForm.currency && a.isActive).map((a) => (
                            <option key={a.id} value={a.id}>{a.accountType === 'client' ? a.name : `${a.name} — رصيده الحالي ${a.balance.toLocaleString()} ${a.currency}`}</option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">اختر حساب شركة بيان الذي تحرّكت منه/إليه هذه العملية فعلياً — يُحدَّث رصيده تلقائياً.</p>
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
                        <input type="number" step="any" placeholder="التكلفة" value={damageForm.cost} onChange={(e) => setDamageForm({ ...damageForm, cost: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        <select value={damageForm.currency} onChange={(e) => setDamageForm({ ...damageForm, currency: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                          {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                        </select>
                        <input type="date" value={damageForm.date} onChange={(e) => setDamageForm({ ...damageForm, date: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
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
      {sellingVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2"><Tag className="h-4 w-4 text-success" /> بيع {sellingVehicle.name}</h3>
              <button onClick={() => setSellingVehicle(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitSell} className="space-y-4 p-6 text-right">
              <div className="rounded-md bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">سعر الشراء: {sellingVehicle.purchasePrice.toLocaleString()} {sellingVehicle.currency}</div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">اسم المشتري *</label>
                <input value={sellForm.buyerName} onChange={(e) => setSellForm({ ...sellForm, buyerName: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">سعر البيع *</label>
                  <input type="number" step="any" value={sellForm.salePrice} onChange={(e) => setSellForm({ ...sellForm, salePrice: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">تاريخ البيع *</label>
                  <input type="date" value={sellForm.saleDate} onChange={(e) => setSellForm({ ...sellForm, saleDate: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              {sellForm.salePrice && (
                <p className={`text-xs font-medium ${(parseFloat(sellForm.salePrice) - sellingVehicle.purchasePrice) < 0 ? 'text-danger' : 'text-success'}`}>
                  الربح المتوقع: {(parseFloat(sellForm.salePrice) - sellingVehicle.purchasePrice).toLocaleString()} {sellingVehicle.currency}
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">طريقة الاستلام</label>
                <select value={sellForm.salePaymentMethod} onChange={(e) => setSellForm({ ...sellForm, salePaymentMethod: e.target.value as FleetPaymentMethod })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="cash">نقدي</option>
                  <option value="bank">بنك</option>
                </select>
              </div>
              {sellForm.salePaymentMethod === 'bank' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">حساب العميل المستلِم (لتحديث الرصيد فعلياً) *</label>
                    <select value={sellForm.saleAccountId} onChange={(e) => setSellForm({ ...sellForm, saleAccountId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <option value="">اختر الحساب</option>
                      {accounts.filter((a) => a.currency === sellingVehicle.currency && a.isActive && a.accountType === 'client').map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">تظهر هنا حسابات العملاء فقط — البيع لحساب شركة بيان نفسها غير منطقي.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">تفاصيل الحساب البنكي (يُكتب يدوياً)</label>
                    <input
                      value={sellForm.saleBankDetails}
                      onChange={(e) => setSellForm({ ...sellForm, saleBankDetails: e.target.value })}
                      placeholder="مثال: مصرف الجمهورية — رقم الحساب 123456"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <p className="text-xs text-muted-foreground mt-1">وصف حر يظهر في سجلات البيع — لا يغيّر أي رصيد بحد ذاته.</p>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea value={sellForm.notes} onChange={(e) => setSellForm({ ...sellForm, notes: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              {sellFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{sellFormError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setSellingVehicle(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={selling} className="flex items-center gap-2 rounded-md bg-success px-4 py-2 text-sm font-medium text-success-foreground hover:opacity-90 transition-colors disabled:opacity-60">
                  {selling && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد البيع
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
