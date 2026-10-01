'use client'

import { useEffect, useMemo, useState, FormEvent } from 'react'
import Link from 'next/link'
import { ArrowRight, Search, Download, MessageCircle, Loader2, FileText, Pencil, Undo2, X } from 'lucide-react'
import { matchesQuery } from '@/lib/search'
import { api, openFile, downloadFile, Customer, Currency } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'
import { CurrencyFlag } from '@/components/ui/currency-flag'
import { DateInput } from '@/components/ui/date-input'
import { NumberInput } from '@/components/ui/number-input'

interface StatementSection { name: string; headers: string[]; rows: string[][] }
interface DepositWithdrawRef { kind: 'entry' | 'transfer'; id: string; customerId: string }
interface StatementData { sections: StatementSection[]; closingLine: string; depositWithdrawRefs?: DepositWithdrawRef[] }

export default function CustomerStatementPage() {
  const { hasPermission } = useAuth()
  const canReverse = hasPermission('إنشاء عملية عكسية')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [nameFilter, setNameFilter] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [currencyFilter, setCurrencyFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [rowSearch, setRowSearch] = useState('')
  const [statement, setStatement] = useState<StatementData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // "تعديل"/"تراجع" on a deposit/withdraw or customer-to-customer transfer row
  const [undoTarget, setUndoTarget] = useState<DepositWithdrawRef & { label: string } | null>(null)
  const [undoReason, setUndoReason] = useState('')
  const [undoSaving, setUndoSaving] = useState(false)
  const [undoError, setUndoError] = useState('')

  const [editTarget, setEditTarget] = useState<DepositWithdrawRef & { label: string; amount: number; notes: string } | null>(null)
  const [editForm, setEditForm] = useState({ amount: '', notes: '', reason: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  useEffect(() => {
    api.get<Customer[]>('/customers').then(setCustomers).catch(() => {})
    api.get<Currency[]>('/currencies').then(setCurrencies).catch(() => {})
  }, [])

  useEffect(() => { setCurrencyFilter('') }, [customerId])

  const filteredCustomers = useMemo(
    () => customers.filter((c) => c.name.toLowerCase().includes(nameFilter.trim().toLowerCase())),
    [customers, nameFilter]
  )

  const selectedCustomer = customers.find((c) => c.id === customerId) || null
  const customerCurrencies = useMemo(
    () => (selectedCustomer ? Object.keys(selectedCustomer.balances) : []),
    [selectedCustomer]
  )
  const currencyFlag = (code: string) => currencies.find((c) => c.code === code)?.flag || ''

  const query = () => {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (currencyFilter) params.set('currency', currencyFilter)
    return params.toString()
  }

  const loadStatement = async () => {
    if (!customerId) { setError('اختر عميلاً أولاً'); return }
    setError('')
    setLoading(true)
    try {
      const res = await api.get<StatementData>(`/customers/${customerId}/statement?${query()}`)
      setStatement(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل كشف الحساب')
      setStatement(null)
    } finally {
      setLoading(false)
    }
  }

  const refPath = (ref: DepositWithdrawRef) =>
    ref.kind === 'transfer' ? `/customer_transfers/${ref.id}` : `/customers/${ref.customerId}/entries/${ref.id}`

  const openUndoModal = (ref: DepositWithdrawRef, label: string) => {
    setUndoTarget({ ...ref, label })
    setUndoReason('')
    setUndoError('')
  }

  const submitUndo = async (e: FormEvent) => {
    e.preventDefault()
    if (!undoTarget) return
    if (!undoReason.trim()) { setUndoError('سبب التراجع مطلوب'); return }
    setUndoError('')
    setUndoSaving(true)
    try {
      await api.post(`${refPath(undoTarget)}/reverse`, { reason: undoReason.trim() })
      setUndoTarget(null)
      await loadStatement()
    } catch (err) {
      setUndoError(err instanceof ApiError ? err.message : 'تعذر التراجع عن العملية')
    } finally {
      setUndoSaving(false)
    }
  }

  const openEditModal = (ref: DepositWithdrawRef, label: string, amount: number, notes: string) => {
    setEditTarget({ ...ref, label, amount, notes })
    setEditForm({ amount: String(amount), notes: notes || '', reason: '' })
    setEditError('')
  }

  const submitEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editTarget) return
    const amount = parseFloat(editForm.amount)
    if (!amount || amount <= 0) { setEditError('أدخل مبلغاً صحيحاً'); return }
    if (!editForm.reason.trim()) { setEditError('سبب التعديل مطلوب'); return }
    setEditError('')
    setEditSaving(true)
    try {
      await api.put(refPath(editTarget), { amount, notes: editForm.notes || null, reason: editForm.reason.trim() })
      setEditTarget(null)
      await loadStatement()
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'تعذر تعديل العملية')
    } finally {
      setEditSaving(false)
    }
  }

  const handleDownload = async (format: 'xlsx' | 'pdf') => {
    if (!customerId) { setError('اختر عميلاً أولاً'); return }
    const key = `dl-${format}`
    setDownloading(key)
    setError('')
    try {
      const path = `/customers/${customerId}/statement/export?format=${format}&${query()}`
      if (format === 'pdf') {
        await openFile(path)
      } else {
        await downloadFile(path, `statement_${customerId}.xlsx`)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل الملف')
    } finally {
      setDownloading(null)
    }
  }

  const sendWhatsapp = async () => {
    if (!customerId) { setError('اختر عميلاً أولاً'); return }
    setSending(true)
    setError('')
    try {
      await api.post(`/customers/${customerId}/send_statement_whatsapp?${query()}`, {})
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إرسال كشف الحساب عبر واتساب')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4" /> العملاء
        </Link>
        <h2 className="text-2xl font-bold text-foreground">كشف حساب العملاء</h2>
        <Link href="/customers/statement/all" className="mr-auto flex items-center gap-1.5 rounded-md border border-primary/30 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
          <FileText className="h-3.5 w-3.5" /> كشف شامل لجميع العملاء
        </Link>
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1">بحث باسم العميل</label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="اكتب اسم العميل للبحث..."
                className="w-full rounded-md border border-input bg-background pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              size={nameFilter && filteredCustomers.length > 1 ? Math.min(filteredCustomers.length, 5) : undefined}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">اختر عميلاً ({filteredCustomers.length})</option>
              {filteredCustomers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.id}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">من تاريخ</label>
            <DateInput value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">إلى تاريخ</label>
            <DateInput value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
        </div>

        {customerCurrencies.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
            <span className="text-sm font-medium text-foreground">عرض حساب:</span>
            <button
              onClick={() => setCurrencyFilter('')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${!currencyFilter ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'}`}
            >
              كل العملات
            </button>
            {customerCurrencies.map((ccy) => (
              <button
                key={ccy}
                onClick={() => setCurrencyFilter(ccy)}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${currencyFilter === ccy ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'}`}
              >
                <CurrencyFlag code={ccy} flag={currencyFlag(ccy)} /> {ccy}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <button
            onClick={loadStatement}
            disabled={loading || !customerId}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} عرض كشف الحساب
          </button>
          <button
            onClick={() => handleDownload('pdf')}
            disabled={downloading === 'dl-pdf' || !customerId}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {downloading === 'dl-pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} فتح PDF
          </button>
          <button
            onClick={() => handleDownload('xlsx')}
            disabled={downloading === 'dl-xlsx' || !customerId}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {downloading === 'dl-xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} تحميل Excel
          </button>
          <button
            onClick={sendWhatsapp}
            disabled={sending || !customerId}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted hover:text-success transition-colors disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} إرسال عبر واتساب
          </button>
        </div>
      </div>

      {/* Results — kept separated by kind (trades / deposits & withdrawals /
          debts / سلف, each debt/سلفة currency its own table) rather than one
          merged chronological list. */}
      {statement && selectedCustomer && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-sm px-6 py-4">
            <h3 className="text-lg font-semibold text-foreground">كشف حساب — {selectedCustomer.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{selectedCustomer.phone || '—'} · {dateFrom || 'البداية'} إلى {dateTo || 'اليوم'}</p>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={rowSearch} onChange={(e) => setRowSearch(e.target.value)} placeholder="بحث داخل الكشف (تفاصيل، ملاحظات، مبلغ، تاريخ...)" className="w-full rounded-md border border-input bg-background py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          {statement.sections.map((section0) => { const section = { ...section0, rows: section0.rows.filter((r) => matchesQuery(rowSearch, ...r)) }; return (
            <div key={section.name} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="border-b border-border px-6 py-3 bg-secondary/30">
                <h4 className="text-sm font-semibold text-foreground">{section.name}</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      {section.headers.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
                      {canReverse && section.name === 'الإيداع والسحب' && <th className="px-4 py-3 font-medium">إجراءات</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {section.rows.length === 0 ? (
                      <tr><td colSpan={section.headers.length} className="px-6 py-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                    ) : (() => {
                      // Sections with a clear direction (deposits/withdrawals, debts,
                      // سلف) carry separate "دخول"/"خروج" columns from the backend now;
                      // a buy/sell/exchange trade is two-sided and keeps one plain
                      // "المبلغ" column instead, so it's rendered with no coloring.
                      const entryIdx = section.headers.indexOf('دخول')
                      const exitIdx = section.headers.indexOf('خروج')
                      const notesIdx = section.headers.indexOf('ملاحظات')
                      const detailIdx = section.headers.indexOf('التفاصيل')
                      const hasFlow = entryIdx !== -1 && exitIdx !== -1
                      const showActions = canReverse && section.name === 'الإيداع والسحب'
                      return section.rows.map((row, i) => {
                        // "المرجع" (row[0]) is the same 1-based sequence number the
                        // backend used when building depositWithdrawRefs in the same
                        // order — it survives the client-side search filter above, so
                        // it reliably maps a row back to its reference even once rows
                        // are filtered out.
                        const ref = showActions ? statement.depositWithdrawRefs?.[parseInt(row[0], 10) - 1] : undefined
                        const amountStr = (hasFlow ? (row[entryIdx] || row[exitIdx]) : '') || '0'
                        const amount = parseFloat(amountStr.replace(/,/g, '')) || 0
                        const notes = notesIdx !== -1 ? row[notesIdx] || '' : ''
                        const label = detailIdx !== -1 ? row[detailIdx] : ''
                        return (
                        <tr key={i} className="hover:bg-muted/50 transition-colors">
                          {row.map((cell, j) => {
                            const isEntry = hasFlow && j === entryIdx && cell !== ''
                            const isExit = hasFlow && j === exitIdx && cell !== ''
                            return (
                              <td
                                key={j}
                                dir={isEntry || isExit || /^-?\s?\d[\d,]*\.\d+$/.test(cell) ? 'ltr' : undefined}
                                className={`px-4 py-3 ${isEntry ? 'font-bold text-success' : isExit ? 'font-bold text-danger' : /^-\s?\d/.test(cell) ? 'font-bold text-danger' : ''}`}
                              >
                                {isEntry ? `+${cell}` : isExit ? `-${cell}` : cell}
                              </td>
                            )
                          })}
                          {showActions && (
                            <td className="px-4 py-3">
                              {ref && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(ref, label, amount, notes)}
                                    title="تعديل العملية"
                                    className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openUndoModal(ref, label)}
                                    title="تراجع عن العملية"
                                    className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-danger transition-colors"
                                  >
                                    <Undo2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      )})
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ) })}

          <div className="rounded-xl border border-border bg-card shadow-sm px-6 py-3 text-sm font-medium text-foreground">
            {statement.closingLine}
          </div>
        </div>
      )}

      {/* Undo (single-step reverse) Modal — deposit/withdraw or customer-to-customer transfer */}
      {undoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">تراجع عن العملية</h3>
              <button onClick={() => setUndoTarget(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitUndo} className="space-y-4 p-6 text-right">
              <p className="text-xs text-muted-foreground">
                سيتم عكس أثر "{undoTarget.label}" على الأرصدة فوراً. تختفي من كشف الحساب ويبقى السجل الكامل في سجل العمليات.
              </p>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">سبب التراجع</label>
                <textarea
                  value={undoReason}
                  onChange={(e) => setUndoReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  autoFocus
                />
              </div>
              {undoError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{undoError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setUndoTarget(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={undoSaving} className="flex items-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-medium text-danger-foreground hover:bg-danger/90 transition-colors disabled:opacity-60">
                  {undoSaving && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد التراجع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit amount/notes Modal — deposit/withdraw or customer-to-customer transfer */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">تعديل العملية</h3>
              <button onClick={() => setEditTarget(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitEdit} className="space-y-4 p-6 text-right">
              <p className="text-xs text-muted-foreground">
                سيتم عكس أثر "{editTarget.label}" الحالي على الأرصدة ثم تطبيقه من جديد بالقيم المعدّلة.
              </p>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">المبلغ</label>
                <NumberInput
                  value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">سبب التعديل</label>
                <textarea
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {editError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{editError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditTarget(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={editSaving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {editSaving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ التعديل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
