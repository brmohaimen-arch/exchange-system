'use client'

import { useEffect, useMemo, useRef, useState, FormEvent, ChangeEvent, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus, Eye, Pencil, Trash2, X, Loader2, Users, Landmark, HandCoins, FileText, Upload, ArrowDownCircle, ArrowUpCircle, Printer, Download, CreditCard, MessageCircle } from 'lucide-react'
import { api, newId, openFile, uploadFile, Customer, Debt, Currency, CustomerDocument, CustomerAccountEntry, Vault, BankAccount, Transaction } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'
import { TablePagination, paginate } from '@/components/TablePagination'
import { useConfirm } from '@/components/ConfirmProvider'
import { CurrencyFlag } from '@/components/ui/currency-flag'

const typeLabels: Record<string, string> = { individual: 'فرد', company: 'شركة' }
const debtStatusClass: Record<string, string> = {
  unpaid: 'bg-danger/10 text-danger',
  partially_paid: 'bg-warning/10 text-warning',
  paid: 'bg-success/10 text-success',
}
const debtStatusLabel: Record<string, string> = { unpaid: 'غير مسدد', partially_paid: 'مسدد جزئياً', paid: 'مسدد بالكامل' }

interface BalanceRow { currency: string; amount: string }

function emptyForm() {
  return { code: '', name: '', type: 'individual', phone: '', idNumber: '', address: '', debtLimit: '0', profitPct: '0', notes: '', isActive: true, bankName: '', bankAccountNumber: '', passportNumber: '' }
}

function emptyDebtForm() {
  return { customerId: '', currency: 'LYD', amount: '', dueDate: '', paymentPeriod: 'monthly', paymentAmount: '0', notes: '' }
}

function emptyDocForm() {
  return { customerId: '', documentType: '', fileName: '', expiryDate: '', status: 'ساري', notes: '', file: null as File | null }
}

function docEditFormFrom(d: CustomerDocument) {
  return { documentType: d.documentType, expiryDate: d.expiryDate || '', status: d.status, notes: d.notes || '' }
}

const docStatusClass: Record<string, string> = {
  'ساري': 'bg-success/10 text-success',
  'قارب على الانتهاء': 'bg-warning/10 text-warning',
  'منتهي': 'bg-danger/10 text-danger',
}

const VALID_TABS = ['customers', 'cards', 'debts', 'documents'] as const
type CustomersTab = typeof VALID_TABS[number]

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>}>
      <CustomersPageInner />
    </Suspense>
  )
}

function CustomersPageInner() {
  const { hasPermission } = useAuth()
  const confirmDialog = useConfirm()
  const searchParams = useSearchParams()
  const initialTab = (VALID_TABS as readonly string[]).includes(searchParams.get('tab') || '')
    ? (searchParams.get('tab') as CustomersTab)
    : 'customers'
  const [tab, setTab] = useState<CustomersTab>(initialTab)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const currencyFlag = (code: string) => currencies.find((c) => c.code === code)?.flag || ''
  const currencyName = (code: string) => currencies.find((c) => c.code === code)?.nameAr || code
  const [documents, setDocuments] = useState<CustomerDocument[]>([])
  const [vaults, setVaults] = useState<Vault[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [accountEntries, setAccountEntries] = useState<CustomerAccountEntry[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importMsg, setImportMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [selectedCurrency, setSelectedCurrency] = useState('')
  const [form, setForm] = useState(emptyForm())
  const [balanceRows, setBalanceRows] = useState<BalanceRow[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [payingDebt, setPayingDebt] = useState<Debt | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payError, setPayError] = useState('')
  const [paying, setPaying] = useState(false)

  const [showDebtModal, setShowDebtModal] = useState(false)
  const [debtForm, setDebtForm] = useState(emptyDebtForm())
  const [debtFormError, setDebtFormError] = useState('')
  const [savingDebt, setSavingDebt] = useState(false)

  const [showDocModal, setShowDocModal] = useState(false)
  const [docForm, setDocForm] = useState(emptyDocForm())
  const [docFormError, setDocFormError] = useState('')
  const [savingDoc, setSavingDoc] = useState(false)
  const [importing, setImporting] = useState(false)

  const [depositWithdrawCustomer, setDepositWithdrawCustomer] = useState<Customer | null>(null)
  const [depositWithdrawType, setDepositWithdrawType] = useState<'deposit' | 'withdraw'>('deposit')
  const [dwForm, setDwForm] = useState({ sourceType: 'vault' as 'vault' | 'bank_account' | 'other', vaultId: '', bankAccountId: '', otherSource: '', currency: 'LYD', amount: '', notes: '' })
  const [dwError, setDwError] = useState('')
  const [dwSaving, setDwSaving] = useState(false)

  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null)
  const [statementCurrency, setStatementCurrency] = useState('')

  const [customersPage, setCustomersPage] = useState(1)
  const [debtsPage, setDebtsPage] = useState(1)
  const [documentsPage, setDocumentsPage] = useState(1)
  const [unlinkedDocsPage, setUnlinkedDocsPage] = useState(1)
  const [statementPage, setStatementPage] = useState(1)
  const [statementTxPage, setStatementTxPage] = useState(1)

  const [connectingDoc, setConnectingDoc] = useState<CustomerDocument | null>(null)
  const [connectCustomerId, setConnectCustomerId] = useState('')
  const [connectError, setConnectError] = useState('')
  const [connecting, setConnecting] = useState(false)

  const [editingDoc, setEditingDoc] = useState<CustomerDocument | null>(null)
  const [docEditForm, setDocEditForm] = useState(docEditFormFrom({ documentType: '', expiryDate: '', status: '', notes: '' } as CustomerDocument))
  const [docEditError, setDocEditError] = useState('')
  const [savingDocEdit, setSavingDocEdit] = useState(false)
  const [sendingStatementId, setSendingStatementId] = useState<string | null>(null)
  const [sendingDebtId, setSendingDebtId] = useState<string | null>(null)

  const canManage = hasPermission('إدارة العملاء')
  const canManageDebts = hasPermission('إدارة الديون')

  const load = async () => {
    try {
      const [custs, debtsData, currs, docs, v, ba, ae, tx] = await Promise.all([
        api.get<Customer[]>('/customers'),
        api.get<Debt[]>('/debts'),
        api.get<Currency[]>('/currencies'),
        api.get<CustomerDocument[]>('/customer_documents'),
        api.get<Vault[]>('/vaults'),
        api.get<BankAccount[]>('/bank_accounts'),
        api.get<CustomerAccountEntry[]>('/customer_account_entries'),
        api.get<Transaction[]>('/transactions'),
      ])
      setCustomers(custs)
      setDebts(debtsData)
      setCurrencies(currs)
      setDocuments(docs)
      setVaults(v)
      setBankAccounts(ba)
      setAccountEntries(ae)
      setTransactions(tx)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات العملاء')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = async () => {
    setEditingCustomer(null)
    setForm(emptyForm())
    setBalanceRows([])
    setFormError('')
    setShowModal(true)
    try {
      const { code } = await api.get<{ code: string }>('/customers/next_code')
      setForm((f) => ({ ...f, code }))
    } catch {
      // best-effort suggestion — the field stays editable either way
    }
  }

  const openEdit = (c: Customer) => {
    setEditingCustomer(c)
    setForm({
      code: c.id, name: c.name, type: c.type, phone: c.phone, idNumber: c.idNumber, address: c.address,
      debtLimit: String(c.debtLimit), profitPct: String(c.profitPct), notes: c.notes || '', isActive: c.isActive,
      bankName: c.bankName || '', bankAccountNumber: c.bankAccountNumber || '', passportNumber: c.passportNumber || '',
    })
    setBalanceRows(Object.entries(c.balances).map(([currency, amount]) => ({ currency, amount: String(amount) })))
    setFormError('')
    setShowModal(true)
  }

  const addBalanceRow = () => setBalanceRows((rows) => [...rows, { currency: 'LYD', amount: '0' }])
  const removeBalanceRow = (idx: number) => setBalanceRows((rows) => rows.filter((_, i) => i !== idx))
  const updateBalanceRow = (idx: number, patch: Partial<BalanceRow>) =>
    setBalanceRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.phone.trim()) {
      setFormError('الاسم ورقم الهاتف مطلوبان')
      return
    }
    if (!editingCustomer && !form.code.trim()) {
      setFormError('رمز العميل مطلوب')
      return
    }
    const balances: Record<string, number> = {}
    for (const row of balanceRows) {
      if (row.currency) balances[row.currency] = parseFloat(row.amount) || 0
    }
    setSaving(true)
    try {
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, {
          id: editingCustomer.id,
          name: form.name.trim(),
          type: form.type,
          phone: form.phone.trim(),
          id_number: form.idNumber.trim(),
          address: form.address.trim(),
          debt_limit: parseFloat(form.debtLimit) || 0,
          balances,
          profit_pct: parseFloat(form.profitPct) || 0,
          notes: form.notes.trim() || null,
          is_active: form.isActive,
          bank_name: form.bankName.trim() || null,
          bank_account_number: form.bankAccountNumber.trim() || null,
          passport_number: form.passportNumber.trim() || null,
        })
      } else {
        await api.post('/customers', {
          id: form.code.trim(),
          name: form.name.trim(),
          type: form.type,
          phone: form.phone.trim(),
          id_number: form.idNumber.trim(),
          address: form.address.trim(),
          debt_limit: parseFloat(form.debtLimit) || 0,
          balances,
          profit_pct: parseFloat(form.profitPct) || 0,
          notes: form.notes.trim() || null,
          bank_name: form.bankName.trim() || null,
          bank_account_number: form.bankAccountNumber.trim() || null,
          passport_number: form.passportNumber.trim() || null,
        })
      }
      setShowModal(false)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذر حفظ بيانات العميل')
    } finally {
      setSaving(false)
    }
  }

  const deleteCustomer = async (c: Customer) => {
    if (!(await confirmDialog(`هل تريد حذف العميل ${c.name}؟`))) return
    try {
      await api.delete(`/customers/${c.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف العميل')
    }
  }

  const openPay = (d: Debt) => {
    setPayingDebt(d)
    setPayAmount('')
    setPayError('')
  }

  const submitPay = async (e: FormEvent) => {
    e.preventDefault()
    if (!payingDebt) return
    setPayError('')
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) {
      setPayError('أدخل مبلغاً صحيحاً')
      return
    }
    setPaying(true)
    try {
      await api.post(`/debts/${payingDebt.id}/pay`, { amount, notes: null })
      setPayingDebt(null)
      await load()
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'تعذر تسجيل الدفعة')
    } finally {
      setPaying(false)
    }
  }

  const openDepositWithdraw = (c: Customer, type: 'deposit' | 'withdraw') => {
    setDepositWithdrawCustomer(c)
    setDepositWithdrawType(type)
    setDwForm({ sourceType: 'vault', vaultId: vaults[0]?.id || '', bankAccountId: bankAccounts[0]?.id || '', otherSource: '', currency: 'LYD', amount: '', notes: '' })
    setDwError('')
  }

  const submitDepositWithdraw = async (e: FormEvent) => {
    e.preventDefault()
    if (!depositWithdrawCustomer) return
    setDwError('')
    const amount = parseFloat(dwForm.amount)
    const sourceLabel = { vault: 'الخزنة', bank_account: 'الحساب البنكي', other: 'وصف المصدر' }[dwForm.sourceType]
    const sourceOk = dwForm.sourceType === 'vault' ? !!dwForm.vaultId : dwForm.sourceType === 'bank_account' ? !!dwForm.bankAccountId : !!dwForm.otherSource.trim()
    if (!sourceOk || !amount || amount <= 0) {
      setDwError(`${sourceLabel} والمبلغ حقول مطلوبة`)
      return
    }
    setDwSaving(true)
    try {
      await api.post(`/customers/${depositWithdrawCustomer.id}/${depositWithdrawType}`, {
        vault_id: dwForm.sourceType === 'vault' ? dwForm.vaultId : null,
        bank_account_id: dwForm.sourceType === 'bank_account' ? dwForm.bankAccountId : null,
        other_source: dwForm.sourceType === 'other' ? dwForm.otherSource.trim() : null,
        currency: dwForm.currency,
        amount,
        notes: dwForm.notes.trim() || null,
      })
      setDepositWithdrawCustomer(null)
      await load()
    } catch (err) {
      setDwError(err instanceof ApiError ? err.message : 'تعذر تنفيذ العملية')
    } finally {
      setDwSaving(false)
    }
  }

  const openCreateDebt = () => {
    setDebtForm(emptyDebtForm())
    setDebtFormError('')
    setShowDebtModal(true)
  }

  const submitDebt = async (e: FormEvent) => {
    e.preventDefault()
    setDebtFormError('')
    const customer = customers.find((c) => c.id === debtForm.customerId)
    const amount = parseFloat(debtForm.amount)
    if (!customer || !amount || amount <= 0 || !debtForm.dueDate) {
      setDebtFormError('العميل والمبلغ وتاريخ الاستحقاق حقول مطلوبة')
      return
    }
    setSavingDebt(true)
    try {
      await api.post('/debts', {
        id: newId('debt'),
        customer_id: customer.id,
        customer_name: customer.name,
        currency: debtForm.currency,
        amount,
        start_date: new Date().toISOString().slice(0, 10),
        due_date: debtForm.dueDate,
        payment_period: debtForm.paymentPeriod,
        payment_amount: parseFloat(debtForm.paymentAmount) || 0,
        notes: debtForm.notes.trim() || null,
      })
      setShowDebtModal(false)
      await load()
    } catch (err) {
      setDebtFormError(err instanceof ApiError ? err.message : 'تعذر تسجيل الدين')
    } finally {
      setSavingDebt(false)
    }
  }

  // ---------------- Customer Documents ----------------
  const openCreateDoc = () => {
    setDocForm(emptyDocForm())
    setDocFormError('')
    setShowDocModal(true)
  }

  const submitDoc = async (e: FormEvent) => {
    e.preventDefault()
    setDocFormError('')
    const customer = customers.find((c) => c.id === docForm.customerId)
    if (!docForm.documentType.trim() || !docForm.file) {
      setDocFormError('نوع المستند والملف حقول مطلوبة')
      return
    }
    setSavingDoc(true)
    try {
      const docId = newId('cdoc')
      await api.post('/customer_documents', {
        id: docId,
        customer_id: customer?.id || null,
        customer_name: customer?.name || null,
        document_type: docForm.documentType.trim(),
        file_name: docForm.file.name,
        expiry_date: docForm.expiryDate || null,
        status: docForm.status,
        notes: docForm.notes.trim() || null,
      })
      await uploadFile(`/customer_documents/${docId}/file`, docForm.file)
      setShowDocModal(false)
      await load()
    } catch (err) {
      setDocFormError(err instanceof ApiError ? err.message : 'تعذر حفظ المستند')
    } finally {
      setSavingDoc(false)
    }
  }

  const openConnectDoc = (d: CustomerDocument) => {
    setConnectingDoc(d)
    setConnectCustomerId('')
    setConnectError('')
  }

  const submitConnectDoc = async (e: FormEvent) => {
    e.preventDefault()
    if (!connectingDoc) return
    if (!connectCustomerId) {
      setConnectError('اختر عميلاً لربط المستند به')
      return
    }
    setConnecting(true)
    setConnectError('')
    try {
      await api.post(`/customer_documents/${connectingDoc.id}/connect`, { customer_id: connectCustomerId })
      setConnectingDoc(null)
      await load()
    } catch (err) {
      setConnectError(err instanceof ApiError ? err.message : 'تعذر ربط المستند')
    } finally {
      setConnecting(false)
    }
  }

  const openEditDoc = (d: CustomerDocument) => {
    setEditingDoc(d)
    setDocEditForm(docEditFormFrom(d))
    setDocEditError('')
  }

  const submitEditDoc = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingDoc) return
    if (!docEditForm.documentType.trim()) {
      setDocEditError('نوع المستند مطلوب')
      return
    }
    setSavingDocEdit(true)
    setDocEditError('')
    try {
      await api.put(`/customer_documents/${editingDoc.id}`, {
        id: editingDoc.id,
        customer_id: editingDoc.customerId,
        customer_name: editingDoc.customerName,
        document_type: docEditForm.documentType.trim(),
        file_name: editingDoc.fileName,
        expiry_date: docEditForm.expiryDate || null,
        status: docEditForm.status,
        notes: docEditForm.notes.trim() || null,
      })
      setEditingDoc(null)
      await load()
    } catch (err) {
      setDocEditError(err instanceof ApiError ? err.message : 'تعذر تعديل المستند')
    } finally {
      setSavingDocEdit(false)
    }
  }

  const deleteDocument = async (d: CustomerDocument) => {
    if (!(await confirmDialog(`هل تريد حذف مستند "${d.documentType}"؟`))) return
    try {
      await api.delete(`/customer_documents/${d.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف المستند')
    }
  }

  const sendStatementWhatsapp = async (c: Customer, currency: string) => {
    setSendingStatementId(c.id)
    setError('')
    try {
      const qs = currency ? `?currency=${encodeURIComponent(currency)}` : ''
      await api.post(`/customers/${c.id}/send_statement_whatsapp${qs}`, {})
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إرسال كشف الحساب عبر واتساب')
    } finally {
      setSendingStatementId(null)
    }
  }

  const sendDebtReceiptWhatsapp = async (d: Debt) => {
    setSendingDebtId(d.id)
    setError('')
    try {
      await api.post(`/debts/${d.id}/send_receipt_whatsapp`, {})
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إرسال إيصال الدين عبر واتساب')
    } finally {
      setSendingDebtId(null)
    }
  }

  // ---------------- CSV Import ----------------
  const triggerImport = () => fileInputRef.current?.click()

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportMsg('')
    setError('')
    setImporting(true)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      if (lines.length < 2) throw new Error('الملف فارغ أو لا يحتوي على بيانات')
      const headers = lines[0].split(',').map((h) => h.trim())
      const rows = lines.slice(1).map((line) => {
        const cells = line.split(',').map((c) => c.trim())
        const row: Record<string, string> = {}
        headers.forEach((h, i) => { row[h] = cells[i] ?? '' })
        return {
          id: row.id || newId('cust'),
          name: row.name || '',
          type: row.type || 'individual',
          phone: row.phone || '',
          id_number: row.id_number || '',
          address: row.address || '',
          debt_limit: parseFloat(row.debt_limit) || 0,
          profit_pct: parseFloat(row.profit_pct) || 0,
          opening_balance_currency: row.opening_balance_currency || null,
          opening_balance_amount: parseFloat(row.opening_balance_amount) || 0,
        }
      })
      const result = await api.post<{ created: string[]; skipped: string[] }>('/customers/import', { rows })
      setImportMsg(`تم استيراد ${result.created.length} عميل بنجاح${result.skipped.length ? `، تم تجاوز ${result.skipped.length} (موجودين مسبقاً)` : ''}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر استيراد الملف. تأكد أن الملف CSV بالتنسيق الصحيح: id,name,type,phone,id_number,address,debt_limit,profit_pct')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const openDebtsCount = debts.filter((d) => d.status !== 'paid').length

  // Newest-first, capped to a page — lists arrive in insertion order from the
  // server, so reversing (or sorting by timestamp where one exists) puts the
  // newest record first before slicing to a page.
  const sortedCustomers = useMemo(() => [...customers].reverse(), [customers])
  const pagedCustomers = paginate(sortedCustomers, customersPage)

  const sortedDebts = useMemo(() => [...debts].reverse(), [debts])
  const pagedDebts = paginate(sortedDebts, debtsPage)

  const sortedDocuments = useMemo(() => [...documents].filter((d) => d.customerId).reverse(), [documents])
  const pagedDocuments = paginate(sortedDocuments, documentsPage)

  const unlinkedDocuments = useMemo(() => [...documents].filter((d) => !d.customerId).reverse(), [documents])
  const pagedUnlinkedDocuments = paginate(unlinkedDocuments, unlinkedDocsPage)

  const statementEntries = useMemo(
    () => accountEntries
      .filter((e) => e.customerId === statementCustomer?.id && (!statementCurrency || e.currency === statementCurrency))
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    [accountEntries, statementCustomer, statementCurrency]
  )
  const pagedStatementEntries = paginate(statementEntries, statementPage)

  const statementTransactions = useMemo(
    () => transactions
      .filter((t) => {
        if (t.customerId !== statementCustomer?.id || !['buy', 'sell', 'exchange'].includes(t.type)) return false
        if (!statementCurrency) return true
        const txCurrency = t.type === 'sell' ? t.toCurrency : t.fromCurrency
        return txCurrency === statementCurrency
      })
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    [transactions, statementCustomer, statementCurrency]
  )
  const pagedStatementTransactions = paginate(statementTransactions, statementTxPage)

  const statementDocuments = useMemo(
    () => documents.filter((d) => d.customerId === statementCustomer?.id),
    [documents, statementCustomer]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-foreground">العملاء</h2>
          <Link
            href="/customers/statement"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <FileText className="h-3.5 w-3.5" /> كشف حساب مفصّل
          </Link>
        </div>
        {tab === 'customers' && canManage && (
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportFile} className="hidden" />
            <button
              onClick={triggerImport}
              disabled={importing}
              className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              استيراد CSV
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              إضافة عميل
            </button>
          </div>
        )}
        {tab === 'cards' && canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            إضافة بطاقة عميل
          </button>
        )}
        {tab === 'debts' && canManageDebts && (
          <button
            onClick={openCreateDebt}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            إضافة دين
          </button>
        )}
        {tab === 'documents' && canManage && (
          <button
            onClick={openCreateDoc}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            إضافة مستند
          </button>
        )}
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}
      {importMsg && <p className="rounded-md bg-success/10 px-4 py-2 text-sm text-success">{importMsg}</p>}

      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setTab('customers')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'customers' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="h-4 w-4" /> العملاء
        </button>
        <button
          onClick={() => setTab('cards')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'cards' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <CreditCard className="h-4 w-4" /> بطاقات العملاء
        </button>
        <button
          onClick={() => setTab('debts')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'debts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <HandCoins className="h-4 w-4" /> الديون
          {openDebtsCount > 0 && <span className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger">{openDebtsCount}</span>}
        </button>
        <button
          onClick={() => setTab('documents')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'documents' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="h-4 w-4" /> المستندات
        </button>
      </div>

      {tab === 'customers' && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">رقم الحساب</th>
                  <th className="px-6 py-4 font-medium">اسم العميل</th>
                  <th className="px-6 py-4 font-medium">النوع</th>
                  <th className="px-6 py-4 font-medium">رقم الهاتف</th>
                  <th className="px-6 py-4 font-medium">الأرصدة</th>
                  <th className="px-6 py-4 font-medium">حد الدين</th>
                  <th className="px-6 py-4 font-medium">نسبة الربح</th>
                  <th className="px-6 py-4 font-medium">الحالة</th>
                  <th className="px-6 py-4 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={9} className="px-6 py-10 text-center text-muted-foreground">جاري التحميل...</td></tr>
                ) : customers.length === 0 ? (
                  <tr><td colSpan={9} className="px-6 py-10 text-center text-muted-foreground">لا يوجد عملاء بعد</td></tr>
                ) : pagedCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{customer.id}</td>
                    <td className="px-6 py-4">{customer.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{typeLabels[customer.type] || customer.type}</td>
                    <td className="px-6 py-4" dir="ltr">{customer.phone}</td>
                    <td className="px-6 py-4">
                      {Object.keys(customer.balances).length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {Object.entries(customer.balances).map(([ccy, amt]) => (
                            <span key={ccy} className="inline-flex w-fit items-center gap-1 rounded-md bg-secondary/50 px-2 py-0.5 text-xs font-bold">
                              <CurrencyFlag code={ccy} flag={currencyFlag(ccy)} />
                              <span>{amt.toLocaleString()} {ccy}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{customer.debtLimit.toLocaleString()} د.ل</td>
                    <td className="px-6 py-4 text-muted-foreground">{customer.profitPct}%</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                        ${customer.isActive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                        {customer.isActive ? 'نشط' : 'موقوف'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => { setSelected(customer); setSelectedCurrency(Object.keys(customer.balances)[0] || '') }}
                          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-primary hover:bg-muted transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" /> عرض
                        </button>
                        <button
                          onClick={() => {
                            setStatementCustomer(customer)
                            setStatementCurrency(Object.keys(customer.balances)[0] || '')
                            setStatementPage(1)
                            setStatementTxPage(1)
                          }}
                          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors"
                        >
                          <FileText className="h-3.5 w-3.5" /> كشف الحساب
                        </button>
                        {canManage && customer.isActive && (
                          <>
                            <button onClick={() => openDepositWithdraw(customer, 'deposit')} className="flex items-center gap-1 rounded-md border border-success/30 px-2 py-1 text-xs font-medium text-success hover:bg-success/10 transition-colors">
                              <ArrowDownCircle className="h-3.5 w-3.5" /> إيداع
                            </button>
                            <button onClick={() => openDepositWithdraw(customer, 'withdraw')} className="flex items-center gap-1 rounded-md border border-warning/30 px-2 py-1 text-xs font-medium text-warning hover:bg-warning/10 transition-colors">
                              <ArrowUpCircle className="h-3.5 w-3.5" /> سحب
                            </button>
                          </>
                        )}
                        {canManage && (
                          <>
                            <button onClick={() => openEdit(customer)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-primary hover:bg-muted transition-colors">
                              <Pencil className="h-3.5 w-3.5" /> تعديل
                            </button>
                            <button onClick={() => deleteCustomer(customer)} className="flex items-center gap-1 rounded-md border border-danger/30 px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" /> حذف
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={customersPage} totalItems={sortedCustomers.length} onPageChange={setCustomersPage} />
        </div>
      )}

      {tab === 'cards' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد عملاء بعد</p>
          ) : pagedCustomers.map((customer) => (
            <div key={customer.id} className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">{customer.name}</h3>
                    <span className="text-[11px] text-muted-foreground" dir="ltr">{customer.id}</span>
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${customer.isActive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                  {customer.isActive ? 'نشط' : 'موقوف'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">رقم الهاتف</p>
                  <p className="font-medium text-foreground" dir="ltr">{customer.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">الرقم الوطني</p>
                  <p className="font-medium text-foreground" dir="ltr">{customer.idNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">رقم جواز السفر</p>
                  <p className="font-medium text-foreground" dir="ltr">{customer.passportNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">حساب بنكي (IBAN)</p>
                  <p className="font-medium text-foreground" dir="ltr">{customer.bankAccountNumber || '—'}</p>
                </div>
              </div>
              {customer.bankName && <p className="text-[11px] text-muted-foreground">البنك: {customer.bankName}</p>}
              {canManage && (
                <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-border">
                  <button onClick={() => openEdit(customer)} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-muted transition-colors">
                    <Pencil className="h-3.5 w-3.5" /> تعديل البطاقة
                  </button>
                  <button onClick={() => deleteCustomer(customer)} className="flex items-center gap-1 rounded-md border border-danger/30 px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" /> حذف
                  </button>
                </div>
              )}
            </div>
          ))}
          <TablePagination page={customersPage} totalItems={sortedCustomers.length} onPageChange={setCustomersPage} />
        </div>
      )}

      {tab === 'debts' && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">العميل</th>
                  <th className="px-6 py-4 font-medium">المبلغ الأصلي</th>
                  <th className="px-6 py-4 font-medium">المسدد</th>
                  <th className="px-6 py-4 font-medium">المتبقي</th>
                  <th className="px-6 py-4 font-medium">تاريخ الاستحقاق</th>
                  <th className="px-6 py-4 font-medium">الحالة</th>
                  <th className="px-6 py-4 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {debts.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">لا توجد ديون مسجلة</td></tr>
                ) : pagedDebts.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{d.customerName}</td>
                    <td className="px-6 py-4">{d.amount.toLocaleString()} {d.currency}</td>
                    <td className="px-6 py-4 text-success">{d.paidAmount.toLocaleString()} {d.currency}</td>
                    <td className="px-6 py-4 font-bold">{d.remainingAmount.toLocaleString()} {d.currency}</td>
                    <td className="px-6 py-4 text-muted-foreground">{d.dueDate}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${debtStatusClass[d.status] || 'bg-muted text-muted-foreground'}`}>
                        {debtStatusLabel[d.status] || d.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {canManageDebts && d.status !== 'paid' && (
                          <button onClick={() => openPay(d)} className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors text-xs font-medium">
                            <Landmark className="h-3.5 w-3.5" /> تسديد دفعة
                          </button>
                        )}
                        <button
                          onClick={() => openFile(`/debts/${d.id}/receipt`).catch((err) => setError(err instanceof ApiError ? err.message : 'تعذر فتح الإيصال'))}
                          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                        >
                          <Printer className="h-3.5 w-3.5" /> طباعة إيصال
                        </button>
                        <button
                          onClick={() => sendDebtReceiptWhatsapp(d)}
                          disabled={sendingDebtId === d.id}
                          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-success transition-colors disabled:opacity-50"
                        >
                          {sendingDebtId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} إرسال واتساب
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={debtsPage} totalItems={sortedDebts.length} onPageChange={setDebtsPage} />
        </div>
      )}

      {tab === 'documents' && (
        <div className="space-y-6">
          {unlinkedDocuments.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 shadow-sm overflow-hidden">
              <div className="border-b border-warning/30 px-6 py-4">
                <h3 className="text-sm font-semibold text-foreground">سجلات غير مرتبطة بعميل</h3>
                <p className="text-xs text-muted-foreground mt-1">مستندات تم رفعها قبل إنشاء أو تحديد سجل العميل — اربطها بعميل فور توفره</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-6 py-4 font-medium">نوع المستند</th>
                      <th className="px-6 py-4 font-medium">اسم الملف</th>
                      <th className="px-6 py-4 font-medium">ملاحظات</th>
                      <th className="px-6 py-4 font-medium">الملف</th>
                      <th className="px-6 py-4 font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pagedUnlinkedDocuments.map((d) => (
                      <tr key={d.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-foreground">{d.documentType}</td>
                        <td className="px-6 py-4 text-muted-foreground">{d.fileName}</td>
                        <td className="px-6 py-4 text-muted-foreground">{d.notes || '—'}</td>
                        <td className="px-6 py-4">
                          {d.hasFile ? (
                            <button onClick={() => openFile(`/customer_documents/${d.id}/file`).catch((err) => setError(err instanceof ApiError ? err.message : 'تعذر فتح الملف'))} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                              <Download className="h-3.5 w-3.5" /> فتح الملف
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">لا يوجد ملف</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {canManage && (
                            <button onClick={() => openConnectDoc(d)} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
                              <Users className="h-3.5 w-3.5" /> ربط بعميل
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination page={unlinkedDocsPage} totalItems={unlinkedDocuments.length} onPageChange={setUnlinkedDocsPage} />
            </div>
          )}

          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">العميل</th>
                    <th className="px-6 py-4 font-medium">نوع المستند</th>
                    <th className="px-6 py-4 font-medium">اسم الملف</th>
                    <th className="px-6 py-4 font-medium">تاريخ الانتهاء</th>
                    <th className="px-6 py-4 font-medium">الحالة</th>
                    <th className="px-6 py-4 font-medium">الملف</th>
                    <th className="px-6 py-4 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedDocuments.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">لا توجد مستندات مسجلة</td></tr>
                  ) : pagedDocuments.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{d.customerName}</td>
                      <td className="px-6 py-4">{d.documentType}</td>
                      <td className="px-6 py-4 text-muted-foreground">{d.fileName}</td>
                      <td className="px-6 py-4 text-muted-foreground">{d.expiryDate || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${docStatusClass[d.status] || 'bg-muted text-muted-foreground'}`}>{d.status}</span>
                      </td>
                      <td className="px-6 py-4">
                        {d.hasFile ? (
                          <button onClick={() => openFile(`/customer_documents/${d.id}/file`).catch((err) => setError(err instanceof ApiError ? err.message : 'تعذر فتح الملف'))} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                            <Download className="h-3.5 w-3.5" /> فتح الملف
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">لا يوجد ملف</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {canManage && (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => openEditDoc(d)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                              <Pencil className="h-3.5 w-3.5" /> تعديل
                            </button>
                            <button onClick={() => deleteDocument(d)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-danger transition-colors">
                              <Trash2 className="h-3.5 w-3.5" /> حذف
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={documentsPage} totalItems={sortedDocuments.length} onPageChange={setDocumentsPage} />
          </div>
        </div>
      )}

      {/* Connect Document to Customer Modal */}
      {connectingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">ربط المستند بعميل</h3>
              <button onClick={() => setConnectingDoc(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitConnectDoc} className="space-y-4 p-6 text-right">
              <p className="text-xs text-muted-foreground">{connectingDoc.documentType} — {connectingDoc.fileName}</p>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">العميل *</label>
                <select
                  value={connectCustomerId}
                  onChange={(e) => setConnectCustomerId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">اختر عميلاً</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {connectError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{connectError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setConnectingDoc(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={connecting} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {connecting && <Loader2 className="h-4 w-4 animate-spin" />} ربط
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Document Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">تعديل المستند</h3>
              <button onClick={() => setEditingDoc(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitEditDoc} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">نوع المستند *</label>
                <input
                  type="text"
                  value={docEditForm.documentType}
                  onChange={(e) => setDocEditForm({ ...docEditForm, documentType: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">تاريخ الانتهاء</label>
                  <input
                    type="date"
                    value={docEditForm.expiryDate}
                    onChange={(e) => setDocEditForm({ ...docEditForm, expiryDate: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الحالة</label>
                  <select
                    value={docEditForm.status}
                    onChange={(e) => setDocEditForm({ ...docEditForm, status: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="ساري">ساري</option>
                    <option value="قارب على الانتهاء">قارب على الانتهاء</option>
                    <option value="منتهي">منتهي</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea
                  value={docEditForm.notes}
                  onChange={(e) => setDocEditForm({ ...docEditForm, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {docEditError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{docEditError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingDoc(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={savingDocEdit} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {savingDocEdit && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-6 text-right max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">رمز العميل *</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={!!editingCustomer}
                  dir="ltr"
                  placeholder="مثال: 001"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-muted disabled:text-muted-foreground"
                />
                {!editingCustomer && <p className="mt-1 text-xs text-muted-foreground">رقم مقترح تلقائياً بالتسلسل — يمكنك تعديله إذا احتجت رمزاً مختلفاً، ولا يمكن تغييره بعد الإنشاء</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">اسم العميل *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">النوع</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="individual">فرد</option>
                    <option value="company">شركة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رقم الهاتف *</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    dir="ltr"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">رقم الهوية / السجل التجاري</label>
                <input
                  value={form.idNumber}
                  onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">العنوان</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">حد الدين المسموح (د.ل)</label>
                  <input
                    type="number"
                    value={form.debtLimit}
                    onChange={(e) => setForm({ ...form, debtLimit: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">نسبة الربح الإضافية (%)</label>
                  <input
                    type="number"
                    value={form.profitPct}
                    onChange={(e) => setForm({ ...form, profitPct: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              {editingCustomer && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-input"
                  />
                  حساب نشط (إلغاء التحديد يوقف العميل عن تنفيذ أي عمليات جديدة)
                </label>
              )}

              {/* Balances editor — only meaningful once the customer exists, but useful for both add & edit */}
              <div className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">أرصدة حساب العميل</span>
                  <button type="button" onClick={addBalanceRow} className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                    + إضافة رصيد
                  </button>
                </div>
                {balanceRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">لا توجد أرصدة</p>
                ) : (
                  <div className="space-y-2">
                    {balanceRows.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={row.currency}
                          onChange={(e) => updateBalanceRow(idx, { currency: e.target.value })}
                          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                          {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                        </select>
                        <input
                          type="number"
                          value={row.amount}
                          onChange={(e) => updateBalanceRow(idx, { amount: e.target.value })}
                          className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <button type="button" onClick={() => removeBalanceRow(idx)} className="text-danger hover:text-danger/80 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">اسم بنك العميل</label>
                  <input
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رقم حساب العميل البنكي (IBAN)</label>
                  <input
                    value={form.bankAccountNumber}
                    onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
                    dir="ltr"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">رقم جواز السفر</label>
                <input
                  value={form.passportNumber}
                  onChange={(e) => setForm({ ...form, passportNumber: e.target.value })}
                  dir="ltr"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {formError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Customer Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{selected.name}</h3>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-6 text-right text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">رقم الحساب</span><span className="font-medium">{selected.id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">النوع</span><span className="font-medium">{typeLabels[selected.type] || selected.type}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">الهاتف</span><span className="font-medium" dir="ltr">{selected.phone}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">رقم الهوية</span><span className="font-medium">{selected.idNumber || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">العنوان</span><span className="font-medium">{selected.address || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">حد الدين</span><span className="font-medium">{selected.debtLimit.toLocaleString()} د.ل</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">نسبة الربح</span><span className="font-medium">{selected.profitPct}%</span></div>
              <div className="pt-2 border-t border-border">
                <p className="text-muted-foreground mb-2">الحساب — كل عملة حساب مستقل</p>
                {Object.keys(selected.balances).length === 0 ? (
                  <p className="text-muted-foreground">لا توجد حسابات لهذا العميل بعد</p>
                ) : (
                  <>
                    <select
                      value={selectedCurrency}
                      onChange={(e) => setSelectedCurrency(e.target.value)}
                      className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {Object.keys(selected.balances).map((ccy) => (
                        <option key={ccy} value={ccy}>{currencyFlag(ccy)} {currencyName(ccy)} ({ccy})</option>
                      ))}
                    </select>
                    {selectedCurrency && (
                      <div className="rounded-lg border border-border bg-secondary/30 p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <CurrencyFlag code={selectedCurrency} flag={currencyFlag(selectedCurrency)} className="h-4 w-6" />
                          <span className="text-xs font-medium text-muted-foreground">{currencyName(selectedCurrency)}</span>
                        </div>
                        <p className="text-xl font-bold text-foreground" dir="ltr">
                          {(selected.balances[selectedCurrency] ?? 0).toLocaleString()} <span className="text-sm font-medium text-muted-foreground">{selectedCurrency}</span>
                        </p>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>حساب جاري</span>
                          <span dir="ltr">{selected.id}-{selectedCurrency}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              {selected.notes && (
                <div className="pt-2 border-t border-border">
                  <p className="text-muted-foreground mb-1">ملاحظات</p>
                  <p>{selected.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pay Debt Modal */}
      {payingDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">تسديد دفعة</h3>
              <button onClick={() => setPayingDebt(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitPay} className="space-y-4 p-6 text-right">
              <p className="text-sm text-muted-foreground">
                العميل: <span className="font-medium text-foreground">{payingDebt.customerName}</span> — المتبقي:{' '}
                <span className="font-medium text-foreground">{payingDebt.remainingAmount.toLocaleString()} {payingDebt.currency}</span>
              </p>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">مبلغ الدفعة *</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {payError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{payError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setPayingDebt(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {paying && <Loader2 className="h-4 w-4 animate-spin" />}
                  تأكيد الدفع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Debt Modal */}
      {showDebtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">تسجيل دين جديد</h3>
              <button onClick={() => setShowDebtModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitDebt} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">العميل *</label>
                <select
                  value={debtForm.customerId}
                  onChange={(e) => setDebtForm({ ...debtForm, customerId: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">اختر عميلاً</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
                  <select
                    value={debtForm.currency}
                    onChange={(e) => setDebtForm({ ...debtForm, currency: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">المبلغ *</label>
                  <input
                    type="number"
                    value={debtForm.amount}
                    onChange={(e) => setDebtForm({ ...debtForm, amount: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">تاريخ الاستحقاق *</label>
                  <input
                    type="date"
                    value={debtForm.dueDate}
                    onChange={(e) => setDebtForm({ ...debtForm, dueDate: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">دورية السداد</label>
                  <select
                    value={debtForm.paymentPeriod}
                    onChange={(e) => setDebtForm({ ...debtForm, paymentPeriod: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="monthly">شهري</option>
                    <option value="daily">يومي</option>
                    <option value="none">دفعة واحدة</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">قيمة القسط (اختياري)</label>
                <input
                  type="number"
                  value={debtForm.paymentAmount}
                  onChange={(e) => setDebtForm({ ...debtForm, paymentAmount: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea
                  value={debtForm.notes}
                  onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {debtFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{debtFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowDebtModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingDebt}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {savingDebt && <Loader2 className="h-4 w-4 animate-spin" />}
                  حفظ الدين
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">إضافة مستند عميل</h3>
              <button onClick={() => setShowDocModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitDoc} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">العميل</label>
                <select
                  value={docForm.customerId}
                  onChange={(e) => setDocForm({ ...docForm, customerId: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">بدون عميل محدد (يمكن ربطه لاحقاً)</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">نوع المستند *</label>
                <input
                  value={docForm.documentType}
                  onChange={(e) => setDocForm({ ...docForm, documentType: e.target.value })}
                  placeholder="بطاقة شخصية، جواز سفر، سجل تجاري..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الملف *</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => setDocForm({ ...docForm, file: e.target.files?.[0] || null })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 file:ml-3 file:rounded file:border-0 file:bg-accent file:px-2 file:py-1 file:text-xs"
                />
                <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG, DOC أو DOCX — حتى 10 ميغابايت</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">تاريخ الانتهاء</label>
                  <input
                    type="date"
                    value={docForm.expiryDate}
                    onChange={(e) => setDocForm({ ...docForm, expiryDate: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الحالة</label>
                  <select
                    value={docForm.status}
                    onChange={(e) => setDocForm({ ...docForm, status: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="ساري">ساري</option>
                    <option value="قارب على الانتهاء">قارب على الانتهاء</option>
                    <option value="منتهي">منتهي</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea
                  value={docForm.notes}
                  onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {docFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{docFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowDocModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingDoc}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {savingDoc && <Loader2 className="h-4 w-4 animate-spin" />}
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit / Withdraw Modal */}
      {depositWithdrawCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">
                {depositWithdrawType === 'deposit' ? 'إيداع لحساب' : 'سحب من حساب'} {depositWithdrawCustomer.name}
              </h3>
              <button onClick={() => setDepositWithdrawCustomer(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitDepositWithdraw} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">مصدر العملية *</label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={dwForm.sourceType === 'vault'} onChange={() => setDwForm({ ...dwForm, sourceType: 'vault' })} />
                    خزنة
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={dwForm.sourceType === 'bank_account'} onChange={() => setDwForm({ ...dwForm, sourceType: 'bank_account' })} />
                    حساب بنكي
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={dwForm.sourceType === 'other'} onChange={() => setDwForm({ ...dwForm, sourceType: 'other' })} />
                    أخرى
                  </label>
                </div>
              </div>
              {dwForm.sourceType === 'vault' ? (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الخزنة *</label>
                  <select
                    value={dwForm.vaultId}
                    onChange={(e) => setDwForm({ ...dwForm, vaultId: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">اختر</option>
                    {vaults.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              ) : dwForm.sourceType === 'bank_account' ? (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الحساب البنكي *</label>
                  <select
                    value={dwForm.bankAccountId}
                    onChange={(e) => setDwForm({ ...dwForm, bankAccountId: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">اختر</option>
                    {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName} - {b.accountName}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">وصف المصدر *</label>
                  <input
                    type="text"
                    value={dwForm.otherSource}
                    onChange={(e) => setDwForm({ ...dwForm, otherSource: e.target.value })}
                    placeholder="مثال: مبلغ نقدي خارج الخزنة"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">لن يتم خصم/إضافة هذا المبلغ من أي خزنة أو حساب بنكي مسجل في النظام.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
                  <select
                    value={dwForm.currency}
                    onChange={(e) => setDwForm({ ...dwForm, currency: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">المبلغ *</label>
                  <input
                    type="number"
                    value={dwForm.amount}
                    onChange={(e) => setDwForm({ ...dwForm, amount: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea
                  value={dwForm.notes}
                  onChange={(e) => setDwForm({ ...dwForm, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {dwError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{dwError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setDepositWithdrawCustomer(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={dwSaving}
                  className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60 ${
                    depositWithdrawType === 'deposit' ? 'bg-success hover:bg-success/90' : 'bg-warning hover:bg-warning/90'
                  }`}
                >
                  {dwSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {depositWithdrawType === 'deposit' ? 'تأكيد الإيداع' : 'تأكيد السحب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Statement */}
      {statementCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">كشف حساب — {statementCustomer.name}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => sendStatementWhatsapp(statementCustomer, statementCurrency)}
                  disabled={sendingStatementId === statementCustomer.id}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-success transition-colors disabled:opacity-50"
                >
                  {sendingStatementId === statementCustomer.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} إرسال عبر واتساب
                </button>
                <button onClick={() => setStatementCustomer(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-6 text-right">
              <div className="mb-4">
                <p className="text-sm font-medium text-foreground mb-2">المستندات</p>
                <div className="flex flex-wrap gap-2">
                  {statementDocuments.length === 0 ? (
                    <span className="text-sm text-muted-foreground">لا توجد مستندات مرفوعة</span>
                  ) : statementDocuments.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => d.hasFile && openFile(`/customer_documents/${d.id}/file`).catch((err) => setError(err instanceof ApiError ? err.message : 'تعذر فتح الملف'))}
                      disabled={!d.hasFile}
                      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <FileText className="h-3.5 w-3.5" /> {d.documentType}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <p className="text-sm font-medium text-foreground mb-2">الحساب</p>
                {Object.keys(statementCustomer.balances).length === 0 ? (
                  <span className="text-sm text-muted-foreground">لا توجد حسابات لهذا العميل بعد</span>
                ) : (
                  <div className="flex items-center gap-3">
                    <select
                      value={statementCurrency}
                      onChange={(e) => { setStatementCurrency(e.target.value); setStatementPage(1); setStatementTxPage(1) }}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {Object.keys(statementCustomer.balances).map((ccy) => (
                        <option key={ccy} value={ccy}>{currencyFlag(ccy)} {currencyName(ccy)} ({ccy})</option>
                      ))}
                    </select>
                    <span className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-lg font-bold" dir="ltr">
                      {(statementCustomer.balances[statementCurrency] ?? 0).toLocaleString()} {statementCurrency}
                    </span>
                  </div>
                )}
              </div>
              <div className="mb-4">
                <p className="text-sm font-medium text-foreground mb-2">معاملات الصرافة (شراء / بيع / تبديل)</p>
                <div className="rounded-md border border-border overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">رقم العملية</th>
                        <th className="px-3 py-2 font-medium">النوع</th>
                        <th className="px-3 py-2 font-medium">المبلغ</th>
                        <th className="px-3 py-2 font-medium">السعر</th>
                        <th className="px-3 py-2 font-medium">الإجمالي</th>
                        <th className="px-3 py-2 font-medium">الحالة</th>
                        <th className="px-3 py-2 font-medium">بواسطة</th>
                        <th className="px-3 py-2 font-medium">التاريخ</th>
                        <th className="px-3 py-2 font-medium">إيصال</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {statementTransactions.length === 0 ? (
                        <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">لا توجد معاملات صرافة مسجلة</td></tr>
                      ) : pagedStatementTransactions.map((t) => (
                        <tr key={t.id}>
                          <td className="px-3 py-2 font-medium text-foreground">{t.id}</td>
                          <td className="px-3 py-2">{typeLabels[t.type] || t.type}</td>
                          <td className="px-3 py-2">{t.amount.toLocaleString()} {t.type === 'sell' ? t.toCurrency : t.fromCurrency}</td>
                          <td className="px-3 py-2 text-muted-foreground">{t.rate}</td>
                          <td className="px-3 py-2 font-medium">{t.totalAmount.toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${t.status === 'reversed' ? 'bg-danger/10 text-danger' : t.status === 'pending' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                              {t.status === 'reversed' ? 'ملغي' : t.status === 'pending' ? 'قيد المعالجة' : 'مكتمل'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{t.user}</td>
                          <td className="px-3 py-2 text-muted-foreground">{t.timestamp}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => openFile(`/transactions/${t.id}/receipt`).catch((err) => setError(err instanceof ApiError ? err.message : 'تعذر فتح الإيصال'))} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                              <Printer className="h-3.5 w-3.5" /> إيصال
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination page={statementTxPage} totalItems={statementTransactions.length} onPageChange={setStatementTxPage} />
              </div>

              <div>
                <p className="text-sm font-medium text-foreground mb-2">حركات الإيداع والسحب على الحساب</p>
                <div className="rounded-md border border-border overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">النوع</th>
                        <th className="px-3 py-2 font-medium">المبلغ</th>
                        <th className="px-3 py-2 font-medium">الرصيد قبل</th>
                        <th className="px-3 py-2 font-medium">الرصيد بعد</th>
                        <th className="px-3 py-2 font-medium">الخزنة</th>
                        <th className="px-3 py-2 font-medium">بواسطة</th>
                        <th className="px-3 py-2 font-medium">التاريخ</th>
                        <th className="px-3 py-2 font-medium">إيصال</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {statementEntries.length === 0 ? (
                        <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">لا توجد حركات إيداع أو سحب مسجلة</td></tr>
                      ) : pagedStatementEntries.map((e) => (
                        <tr key={e.id}>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${e.type === 'deposit' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                              {e.type === 'deposit' ? 'إيداع' : 'سحب'}
                            </span>
                          </td>
                          <td className={`px-3 py-2 font-bold ${e.type === 'deposit' ? 'text-success' : 'text-danger'}`} dir="ltr">
                            {e.type === 'deposit' ? '+' : '-'}{e.amount.toLocaleString()} {e.currency}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{e.balanceBefore.toLocaleString()}</td>
                          <td className="px-3 py-2 font-medium">{e.balanceAfter.toLocaleString()}</td>
                          <td className="px-3 py-2 text-muted-foreground">{e.vaultName || e.bankAccountName || '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{e.user}</td>
                          <td className="px-3 py-2 text-muted-foreground">{e.timestamp}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => openFile(`/transactions/${e.id}/receipt`).catch((err) => setError(err instanceof ApiError ? err.message : 'تعذر فتح الإيصال'))} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                              <Printer className="h-3.5 w-3.5" /> إيصال
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination page={statementPage} totalItems={statementEntries.length} onPageChange={setStatementPage} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
