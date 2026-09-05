'use client'

import { useEffect, useRef, useState, FormEvent, ChangeEvent } from 'react'
import { Plus, Eye, Pencil, Trash2, X, Loader2, Users, Landmark, HandCoins, FileText, Upload, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { api, newId, Customer, Debt, Currency, CustomerDocument, CustomerAccountEntry, Vault } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'

const typeLabels: Record<string, string> = { individual: 'فرد', company: 'شركة' }
const debtStatusClass: Record<string, string> = {
  unpaid: 'bg-danger/10 text-danger',
  partially_paid: 'bg-warning/10 text-warning',
  paid: 'bg-success/10 text-success',
}
const debtStatusLabel: Record<string, string> = { unpaid: 'غير مسدد', partially_paid: 'مسدد جزئياً', paid: 'مسدد بالكامل' }

interface BalanceRow { currency: string; amount: string }

function emptyForm() {
  return { name: '', type: 'individual', phone: '', idNumber: '', address: '', debtLimit: '0', profitPct: '0', notes: '', isActive: true }
}

function emptyDebtForm() {
  return { customerId: '', currency: 'LYD', amount: '', dueDate: '', paymentPeriod: 'monthly', paymentAmount: '0', notes: '' }
}

function emptyDocForm() {
  return { customerId: '', documentType: '', fileName: '', expiryDate: '', status: 'ساري', notes: '' }
}

const docStatusClass: Record<string, string> = {
  'ساري': 'bg-success/10 text-success',
  'قارب على الانتهاء': 'bg-warning/10 text-warning',
  'منتهي': 'bg-danger/10 text-danger',
}

export default function CustomersPage() {
  const { hasPermission } = useAuth()
  const [tab, setTab] = useState<'customers' | 'debts' | 'documents'>('customers')

  const [customers, setCustomers] = useState<Customer[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [documents, setDocuments] = useState<CustomerDocument[]>([])
  const [vaults, setVaults] = useState<Vault[]>([])
  const [accountEntries, setAccountEntries] = useState<CustomerAccountEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importMsg, setImportMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [selected, setSelected] = useState<Customer | null>(null)
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
  const [dwForm, setDwForm] = useState({ vaultId: '', currency: 'LYD', amount: '', notes: '' })
  const [dwError, setDwError] = useState('')
  const [dwSaving, setDwSaving] = useState(false)

  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null)

  const canManage = hasPermission('إدارة العملاء')
  const canManageDebts = hasPermission('إدارة الديون')

  const load = async () => {
    try {
      const [custs, debtsData, currs, docs, v, ae] = await Promise.all([
        api.get<Customer[]>('/customers'),
        api.get<Debt[]>('/debts'),
        api.get<Currency[]>('/currencies'),
        api.get<CustomerDocument[]>('/customer_documents'),
        api.get<Vault[]>('/vaults'),
        api.get<CustomerAccountEntry[]>('/customer_account_entries'),
      ])
      setCustomers(custs)
      setDebts(debtsData)
      setCurrencies(currs)
      setDocuments(docs)
      setVaults(v)
      setAccountEntries(ae)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات العملاء')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditingCustomer(null)
    setForm(emptyForm())
    setBalanceRows([])
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (c: Customer) => {
    setEditingCustomer(c)
    setForm({
      name: c.name, type: c.type, phone: c.phone, idNumber: c.idNumber, address: c.address,
      debtLimit: String(c.debtLimit), profitPct: String(c.profitPct), notes: c.notes || '', isActive: c.isActive,
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
        })
      } else {
        await api.post('/customers', {
          id: newId('cust'),
          name: form.name.trim(),
          type: form.type,
          phone: form.phone.trim(),
          id_number: form.idNumber.trim(),
          address: form.address.trim(),
          debt_limit: parseFloat(form.debtLimit) || 0,
          balances,
          profit_pct: parseFloat(form.profitPct) || 0,
          notes: form.notes.trim() || null,
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
    if (!confirm(`هل تريد حذف العميل ${c.name}؟`)) return
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
    setDwForm({ vaultId: vaults[0]?.id || '', currency: 'LYD', amount: '', notes: '' })
    setDwError('')
  }

  const submitDepositWithdraw = async (e: FormEvent) => {
    e.preventDefault()
    if (!depositWithdrawCustomer) return
    setDwError('')
    const amount = parseFloat(dwForm.amount)
    if (!dwForm.vaultId || !amount || amount <= 0) {
      setDwError('الخزنة والمبلغ حقول مطلوبة')
      return
    }
    setDwSaving(true)
    try {
      await api.post(`/customers/${depositWithdrawCustomer.id}/${depositWithdrawType}`, {
        vault_id: dwForm.vaultId,
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
    if (!customer || !docForm.documentType.trim() || !docForm.fileName.trim()) {
      setDocFormError('العميل ونوع المستند واسم الملف حقول مطلوبة')
      return
    }
    setSavingDoc(true)
    try {
      await api.post('/customer_documents', {
        id: newId('cdoc'),
        customer_id: customer.id,
        customer_name: customer.name,
        document_type: docForm.documentType.trim(),
        file_name: docForm.fileName.trim(),
        expiry_date: docForm.expiryDate || null,
        status: docForm.status,
        notes: docForm.notes.trim() || null,
      })
      setShowDocModal(false)
      await load()
    } catch (err) {
      setDocFormError(err instanceof ApiError ? err.message : 'تعذر حفظ المستند')
    } finally {
      setSavingDoc(false)
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">العملاء</h2>
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
                ) : customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{customer.id}</td>
                    <td className="px-6 py-4">{customer.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{typeLabels[customer.type] || customer.type}</td>
                    <td className="px-6 py-4" dir="ltr">{customer.phone}</td>
                    <td className="px-6 py-4 font-bold">
                      {Object.keys(customer.balances).length === 0
                        ? '—'
                        : Object.entries(customer.balances).map(([ccy, amt]) => `${amt.toLocaleString()} ${ccy}`).join(' / ')}
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
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSelected(customer)} title="عرض" className="text-primary hover:text-primary/80 transition-colors p-1">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => setStatementCustomer(customer)} title="كشف الحساب" className="text-muted-foreground hover:text-primary transition-colors p-1">
                          <FileText className="h-4 w-4" />
                        </button>
                        {canManage && customer.isActive && (
                          <>
                            <button onClick={() => openDepositWithdraw(customer, 'deposit')} title="إيداع" className="text-success hover:text-success/80 transition-colors p-1">
                              <ArrowDownCircle className="h-4 w-4" />
                            </button>
                            <button onClick={() => openDepositWithdraw(customer, 'withdraw')} title="سحب" className="text-warning hover:text-warning/80 transition-colors p-1">
                              <ArrowUpCircle className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {canManage && (
                          <>
                            <button onClick={() => openEdit(customer)} title="تعديل" className="text-primary hover:text-primary/80 transition-colors p-1">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => deleteCustomer(customer)} title="حذف" className="text-danger hover:text-danger/80 transition-colors p-1">
                              <Trash2 className="h-4 w-4" />
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
                  {canManageDebts && <th className="px-6 py-4 font-medium">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {debts.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">لا توجد ديون مسجلة</td></tr>
                ) : debts.map((d) => (
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
                    {canManageDebts && (
                      <td className="px-6 py-4">
                        {d.status !== 'paid' && (
                          <button onClick={() => openPay(d)} className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors text-xs font-medium">
                            <Landmark className="h-3.5 w-3.5" /> تسديد دفعة
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'documents' && (
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">لا توجد مستندات مسجلة</td></tr>
                ) : documents.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{d.customerName}</td>
                    <td className="px-6 py-4">{d.documentType}</td>
                    <td className="px-6 py-4 text-muted-foreground">{d.fileName}</td>
                    <td className="px-6 py-4 text-muted-foreground">{d.expiryDate || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${docStatusClass[d.status] || 'bg-muted text-muted-foreground'}`}>{d.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                <p className="text-muted-foreground mb-1">الأرصدة</p>
                {Object.keys(selected.balances).length === 0 ? (
                  <p className="text-muted-foreground">لا توجد أرصدة</p>
                ) : (
                  Object.entries(selected.balances).map(([ccy, amt]) => (
                    <div key={ccy} className="flex justify-between"><span>{ccy}</span><span className="font-medium">{amt.toLocaleString()}</span></div>
                  ))
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
                <label className="block text-sm font-medium text-foreground mb-1">العميل *</label>
                <select
                  value={docForm.customerId}
                  onChange={(e) => setDocForm({ ...docForm, customerId: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">اختر عميلاً</option>
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
                <label className="block text-sm font-medium text-foreground mb-1">اسم الملف *</label>
                <input
                  value={docForm.fileName}
                  onChange={(e) => setDocForm({ ...docForm, fileName: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
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
              <button onClick={() => setStatementCustomer(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 text-right">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground mb-1">الرصيد الحالي</p>
                <div className="flex flex-wrap gap-3">
                  {Object.keys(statementCustomer.balances).length === 0 ? (
                    <span className="text-sm text-muted-foreground">لا توجد أرصدة</span>
                  ) : Object.entries(statementCustomer.balances).map(([ccy, amt]) => (
                    <span key={ccy} className="rounded-md bg-secondary px-3 py-1 text-sm font-medium">{amt.toLocaleString()} {ccy}</span>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-border overflow-hidden">
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {accountEntries.filter((e) => e.customerId === statementCustomer.id).length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">لا توجد حركات إيداع أو سحب مسجلة</td></tr>
                    ) : accountEntries.filter((e) => e.customerId === statementCustomer.id).map((e) => (
                      <tr key={e.id}>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${e.type === 'deposit' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                            {e.type === 'deposit' ? 'إيداع' : 'سحب'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium">{e.amount.toLocaleString()} {e.currency}</td>
                        <td className="px-3 py-2 text-muted-foreground">{e.balanceBefore.toLocaleString()}</td>
                        <td className="px-3 py-2 font-medium">{e.balanceAfter.toLocaleString()}</td>
                        <td className="px-3 py-2 text-muted-foreground">{e.vaultName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{e.user}</td>
                        <td className="px-3 py-2 text-muted-foreground">{e.timestamp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
