'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Search, Download, MessageCircle, Loader2, FileText } from 'lucide-react'
import { api, openFile, downloadFile, Currency } from '@/lib/api-client'
import { ApiError } from '@/lib/auth-provider'
import { CurrencyFlag } from '@/components/ui/currency-flag'
import { DateInput } from '@/components/ui/date-input'

interface StatementSection { name: string; headers: string[]; rows: string[][] }
interface StatementData { sections: StatementSection[]; closingLine: string }

export default function AllCustomersStatementPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [currencyFilter, setCurrencyFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statement, setStatement] = useState<StatementData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    api.get<Currency[]>('/currencies').then(setCurrencies).catch(() => {})
  }, [])

  const currencyFlag = (code: string) => currencies.find((c) => c.code === code)?.flag || ''

  const query = () => {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (currencyFilter) params.set('currency', currencyFilter)
    return params.toString()
  }

  const loadStatement = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await api.get<StatementData>(`/customer_statements/all?${query()}`)
      setStatement(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل كشف الحساب الشامل')
      setStatement(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStatement() }, [])

  const handleDownload = async (format: 'xlsx' | 'pdf') => {
    const key = `dl-${format}`
    setDownloading(key)
    setError('')
    try {
      const path = `/customer_statements/all/export?format=${format}&${query()}`
      if (format === 'pdf') {
        await openFile(path)
      } else {
        await downloadFile(path, 'statement_all_customers.xlsx')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل الملف')
    } finally {
      setDownloading(null)
    }
  }

  const sendWhatsapp = async () => {
    setSending(true)
    setError('')
    try {
      await api.post(`/customer_statements/all/send_whatsapp?${query()}`, {})
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إرسال كشف الحساب عبر واتساب')
    } finally {
      setSending(false)
    }
  }

  const allCurrencies = useMemo(() => currencies.map((c) => c.code), [currencies])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4" /> العملاء
        </Link>
        <h2 className="text-2xl font-bold text-foreground">كشف حساب شامل — جميع العملاء</h2>
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">من تاريخ</label>
            <DateInput value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">إلى تاريخ</label>
            <DateInput value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
            <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">كل العملات</option>
              {allCurrencies.map((ccy) => <option key={ccy} value={ccy}>{ccy}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <button
            onClick={loadStatement}
            disabled={loading}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} عرض كشف الحساب
          </button>
          <button
            onClick={() => handleDownload('pdf')}
            disabled={downloading === 'dl-pdf'}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {downloading === 'dl-pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} فتح PDF
          </button>
          <button
            onClick={() => handleDownload('xlsx')}
            disabled={downloading === 'dl-xlsx'}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {downloading === 'dl-xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} تحميل Excel
          </button>
          <button
            onClick={sendWhatsapp}
            disabled={sending}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted hover:text-success transition-colors disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} إرسال عبر واتساب
          </button>
        </div>
      </div>

      {/* Results */}
      {statement && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-sm px-6 py-4">
            <h3 className="text-lg font-semibold text-foreground">كشف حساب شامل — جميع العملاء</h3>
            <p className="text-xs text-muted-foreground mt-1">{dateFrom || 'البداية'} إلى {dateTo || 'اليوم'}</p>
          </div>

          {statement.sections.map((section) => (
            <div key={section.name} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="border-b border-border px-6 py-3 bg-secondary/30">
                <h4 className="text-sm font-semibold text-foreground">{section.name}</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                    <tr>{section.headers.map((h) => <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {section.rows.length === 0 ? (
                      <tr><td colSpan={section.headers.length} className="px-6 py-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                    ) : (() => {
                      const entryIdx = section.headers.indexOf('دخول')
                      const exitIdx = section.headers.indexOf('خروج')
                      const hasFlow = entryIdx !== -1 && exitIdx !== -1
                      return section.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-muted/50 transition-colors">
                          {row.map((cell, j) => {
                            const isEntry = hasFlow && j === entryIdx && cell !== ''
                            const isExit = hasFlow && j === exitIdx && cell !== ''
                            return (
                              <td
                                key={j}
                                dir={isEntry || isExit ? 'ltr' : undefined}
                                className={`px-4 py-3 whitespace-nowrap ${isEntry ? 'font-bold text-success' : isExit ? 'font-bold text-danger' : ''}`}
                              >
                                {isEntry ? `+${cell}` : isExit ? `-${cell}` : cell}
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-border bg-card shadow-sm px-6 py-3 text-sm font-medium text-foreground">
            {statement.closingLine}
          </div>
        </div>
      )}
    </div>
  )
}
