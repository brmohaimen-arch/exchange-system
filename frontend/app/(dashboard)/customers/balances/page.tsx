'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Search, Download, MessageCircle, Loader2, FileText, Users } from 'lucide-react'
import { api, openFile, downloadFile, Currency } from '@/lib/api-client'
import { ApiError } from '@/lib/auth-provider'
import { CurrencyFlag } from '@/components/ui/currency-flag'
import { NumberInput } from '@/components/ui/number-input'

interface Section { name: string; headers: string[]; rows: string[][] }
interface Report {
  sections: Section[]
  closingLine: string
  summary: Record<string, { oweUs: number; weOwe: number; oweUsCount: number; weOweCount: number }>
}

type Side = 'both' | 'owe_us' | 'we_owe'
type View = 'split' | 'combined'

const SIDES: { key: Side; label: string }[] = [
  { key: 'both', label: 'الكل' },
  { key: 'owe_us', label: 'عملاء عليهم (مطلوب منهم)' },
  { key: 'we_owe', label: 'عملاء لهم (مطلوب لهم)' },
]

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

export default function CustomerBalancesPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [side, setSide] = useState<Side>('both')
  const [currency, setCurrency] = useState('')
  const [view, setView] = useState<View>('split')
  const [withLyd, setWithLyd] = useState(true)
  const [search, setSearch] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sentMsg, setSentMsg] = useState('')

  useEffect(() => { api.get<Currency[]>('/currencies').then(setCurrencies).catch(() => {}) }, [])
  const flag = (code: string) => currencies.find((c) => c.code === code)?.flag || ''

  const query = () => {
    const p = new URLSearchParams({ side, view, with_lyd: String(withLyd) })
    if (currency) p.set('currency', currency)
    if (search.trim()) p.set('search', search.trim())
    if (minAmount) p.set('min_amount', minAmount)
    return p.toString()
  }

  const load = async () => {
    setError('')
    setLoading(true)
    try {
      setReport(await api.get<Report>(`/customer_balances?${query()}`))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل كشف الأرصدة')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  // Reload whenever a filter changes (search is debounced so typing doesn't fire a request per key).
  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, currency, view, withLyd, search, minAmount])

  const download = async (format: 'pdf' | 'xlsx') => {
    setDownloading(format)
    setError('')
    try {
      const path = `/customer_balances/export?format=${format}&${query()}`
      if (format === 'pdf') await openFile(path)
      else await downloadFile(path, 'customer_balances.xlsx')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل الملف')
    } finally {
      setDownloading(null)
    }
  }

  const sendWhatsapp = async () => {
    setSending(true)
    setError('')
    setSentMsg('')
    try {
      await api.post(`/customer_balances/send_whatsapp?${query()}`, {})
      setSentMsg('تم إرسال الكشف إلى واتساب المدير')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إرسال الكشف عبر واتساب')
    } finally {
      setSending(false)
    }
  }

  const summaryEntries = useMemo(() => Object.entries(report?.summary || {}), [report])
  const chip = (active: boolean) => `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/customers" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4" /> العملاء
        </Link>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Users className="h-6 w-6 text-primary" /> كشف أرصدة العملاء</h2>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">الصافي = الرصيد − الديون − السلف. <span className="font-semibold text-danger">عليه</span> = العميل مدين لنا (بالسالب)، <span className="font-semibold text-success">له</span> = نحن مدينون للعميل.</p>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}
      {sentMsg && <p className="rounded-md bg-success/10 px-4 py-2 text-sm text-success">{sentMsg}</p>}

      {/* Filters */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">الجانب:</span>
          {SIDES.map((s) => (
            <button key={s.key} onClick={() => setSide(s.key)} className={chip(side === s.key)}>{s.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">العملة:</span>
          <button onClick={() => setCurrency('')} className={chip(!currency)}>كل العملات</button>
          {currencies.map((c) => (
            <button key={c.code} onClick={() => setCurrency(c.code)} className={`flex items-center gap-1 ${chip(currency === c.code)}`}>
              <CurrencyFlag code={c.code} flag={flag(c.code)} /> {c.code}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">العرض:</span>
          <button onClick={() => setView('split')} className={chip(view === 'split')}>منفصل حسب العملة</button>
          <button onClick={() => setView('combined')} className={chip(view === 'combined')}>مجمّع (كل العملات معاً)</button>
          {view === 'combined' && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={withLyd} onChange={(e) => setWithLyd(e.target.checked)} /> إظهار ما يعادله بالدينار (تقديري بسعر الصرف الحالي)
            </label>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو رقم العميل أو الهاتف..." className="w-full rounded-md border border-input bg-background py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <NumberInput value={minAmount} onChange={(e) => setMinAmount(e.target.value)} min="0" placeholder="إخفاء الأرصدة الأقل من مبلغ (اختياري)" dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <button onClick={() => download('pdf')} disabled={downloading === 'pdf'} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60">
            {downloading === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} فتح PDF
          </button>
          <button onClick={() => download('xlsx')} disabled={downloading === 'xlsx'} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60">
            {downloading === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} تحميل Excel
          </button>
          <button onClick={sendWhatsapp} disabled={sending} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted hover:text-success transition-colors disabled:opacity-60">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} إرسال عبر واتساب
          </button>
        </div>
      </div>

      {/* Totals at a glance */}
      {summaryEntries.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaryEntries.map(([ccy, s]) => (
            <div key={ccy} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground"><CurrencyFlag code={ccy} flag={flag(ccy)} /> {ccy}</div>
              <div className="flex justify-between text-sm" dir="ltr"><span className="font-bold text-danger">-{fmt(s.oweUs)}</span><span className="text-muted-foreground" dir="rtl">عليهم ({s.oweUsCount})</span></div>
              <div className="flex justify-between text-sm" dir="ltr"><span className="font-bold text-success">{fmt(s.weOwe)}</span><span className="text-muted-foreground" dir="rtl">لهم ({s.weOweCount})</span></div>
            </div>
          ))}
        </div>
      )}

      {loading && !report ? (
        <p className="py-10 text-center text-sm text-muted-foreground">جاري التحميل...</p>
      ) : report?.sections.map((section) => {
        const netIdx = section.headers.indexOf('الصافي')
        const lydIdx = section.headers.indexOf('≈ د.ل')
        return (
          <div key={section.name} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-secondary/30 px-6 py-3"><h4 className="text-sm font-semibold text-foreground">{section.name}</h4></div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                  <tr>{section.headers.map((h) => <th key={h} className="whitespace-nowrap px-3 py-3 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {section.rows.length === 0 ? (
                    <tr><td colSpan={section.headers.length} className="px-6 py-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                  ) : section.rows.map((row, i) => {
                    const isTotal = row[0] === ''
                    return (
                      <tr key={i} className={isTotal ? 'bg-secondary/40 font-bold' : 'transition-colors hover:bg-muted/50'}>
                        {row.map((cell, j) => {
                          const isMoney = j === netIdx || j === lydIdx
                          const colored = isMoney && cell !== '' ? (cell.startsWith('-') ? 'font-bold text-danger' : 'font-bold text-success') : ''
                          return <td key={j} dir={isMoney || (j >= 5 && j <= 7) ? 'ltr' : undefined} className={`px-3 py-2.5 ${colored}`}>{cell}</td>
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
