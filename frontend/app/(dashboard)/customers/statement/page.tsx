'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Search, Download, MessageCircle, Loader2, FileText } from 'lucide-react'
import { api, openFile, downloadFile, Customer, Currency } from '@/lib/api-client'
import { ApiError } from '@/lib/auth-provider'
import { CurrencyFlag } from '@/components/ui/currency-flag'

interface StatementData { headers: string[]; rows: string[][]; closingLine: string }

export default function CustomerStatementPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [nameFilter, setNameFilter] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [currencyFilter, setCurrencyFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statement, setStatement] = useState<StatementData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

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
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">إلى تاريخ</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
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

      {/* Results */}
      {statement && selectedCustomer && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border px-6 py-4 bg-secondary/30">
            <h3 className="text-lg font-semibold text-foreground">كشف حساب — {selectedCustomer.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{selectedCustomer.phone || '—'} · {dateFrom || 'البداية'} إلى {dateTo || 'اليوم'}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>{statement.headers.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {statement.rows.length === 0 ? (
                  <tr><td colSpan={statement.headers.length} className="px-6 py-10 text-center text-muted-foreground">لا توجد حركات في هذه الفترة</td></tr>
                ) : statement.rows.map((row, i) => {
                  // Column 2 is "التفاصيل" — only deposit/withdraw entries have a clear
                  // in/out direction on the customer's own balance; a buy/sell/exchange
                  // is a two-sided trade, not a simple credit or debit, so it's left
                  // in the default color.
                  const detail = row[2] || ''
                  const isDeposit = detail.includes('إيداع')
                  const isWithdraw = detail.includes('سحب من الحساب')
                  return (
                    <tr key={i} className="hover:bg-muted/50 transition-colors">
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          dir={j === 3 && (isDeposit || isWithdraw) ? 'ltr' : undefined}
                          className={`px-4 py-3 ${j === 3 && isDeposit ? 'font-bold text-success' : j === 3 && isWithdraw ? 'font-bold text-danger' : ''}`}
                        >
                          {j === 3 && isDeposit ? `+${cell}` : j === 3 && isWithdraw ? `-${cell}` : cell}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-6 py-3 bg-secondary/20 text-sm font-medium text-foreground">
            {statement.closingLine}
          </div>
        </div>
      )}
    </div>
  )
}
