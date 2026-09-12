'use client'

import { Suspense, useEffect, useMemo, useState, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FileText, Download, TrendingUp, AlertTriangle, ShieldAlert, Check, BookOpen, ChevronDown, RotateCcw, Building2, User as UserIcon, Ban, X, Loader2, MessageCircle, Filter, Lock, Landmark, CheckCircle2 } from 'lucide-react'
import { api, downloadFile, openFile, ComplianceFlag, JournalEntry, CancelledTransaction, Branch, DailyClosingDTO } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'
import { TablePagination, paginate } from '@/components/TablePagination'

interface BreakdownEntry { profit: number; count: number }

interface ProfitSummary {
  totalProfit: number
  buyCount: number
  sellCount: number
  exchangeCount: number
  totalTx: number
  volumeByCurrency: Record<string, number>
  profitByBranch: Record<string, BreakdownEntry>
  profitByCashier: Record<string, BreakdownEntry>
}

interface DebtsSummary {
  openCount: number
  overdueCount: number
  dueSoonCount: number
  totalOpen: number
  totalOverdue: number
}

const tabs = [
  { key: 'reports', label: 'التقارير', icon: FileText },
  { key: 'closing', label: 'الإقفال اليومي', icon: Lock },
] as const
type TabKey = typeof tabs[number]['key']

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>}>
      <ReportsPageInner />
    </Suspense>
  )
}

function ReportsPageInner() {
  const { hasPermission } = useAuth()
  const canView = hasPermission('رؤية التقارير')
  const canClose = hasPermission('اعتماد الإقفالات')

  const searchParams = useSearchParams()
  const router = useRouter()
  const requestedTab = searchParams.get('tab') as TabKey | null
  const [tab, setTabState] = useState<TabKey>(requestedTab && tabs.some((t) => t.key === requestedTab) ? requestedTab : 'reports')
  const setTab = (next: TabKey) => {
    setTabState(next)
    router.replace(`/reports?tab=${next}`, { scroll: false })
  }

  // ---------------- Reports tab state ----------------
  const [profit, setProfit] = useState<ProfitSummary | null>(null)
  const [debts, setDebts] = useState<DebtsSummary | null>(null)
  const [flags, setFlags] = useState<ComplianceFlag[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [cancelledTx, setCancelledTx] = useState<CancelledTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [sendingReport, setSendingReport] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [reviewingFlag, setReviewingFlag] = useState<string | null>(null)
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)
  const [reversingId, setReversingId] = useState<string | null>(null)
  const [reversingEntry, setReversingEntry] = useState<JournalEntry | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [reverseError, setReverseError] = useState('')

  const [flagsPage, setFlagsPage] = useState(1)
  const [journalPage, setJournalPage] = useState(1)
  const [cancelledPage, setCancelledPage] = useState(1)
  const [branchPage, setBranchPage] = useState(1)
  const [cashierPage, setCashierPage] = useState(1)
  const [volumePage, setVolumePage] = useState(1)

  const canReverse = hasPermission('إنشاء عملية عكسية')

  const sortedFlags = useMemo(() => [...flags].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)), [flags])
  const pagedFlags = paginate(sortedFlags, flagsPage)

  const sortedJournalEntries = useMemo(() => [...journalEntries].sort((a, b) => (a.date < b.date ? 1 : -1)), [journalEntries])
  const pagedJournalEntries = paginate(sortedJournalEntries, journalPage)

  const sortedCancelledTx = useMemo(() => [...cancelledTx].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)), [cancelledTx])
  const pagedCancelledTx = paginate(sortedCancelledTx, cancelledPage)

  const branchEntries = useMemo(() => Object.entries(profit?.profitByBranch || {}).sort((a, b) => b[1].profit - a[1].profit), [profit])
  const pagedBranchEntries = paginate(branchEntries, branchPage)

  const cashierEntries = useMemo(() => Object.entries(profit?.profitByCashier || {}).sort((a, b) => b[1].profit - a[1].profit), [profit])
  const pagedCashierEntries = paginate(cashierEntries, cashierPage)

  const volumeEntries = useMemo(() => Object.entries(profit?.volumeByCurrency || {}), [profit])
  const pagedVolumeEntries = paginate(volumeEntries, volumePage)

  const profitQuery = () => {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    return params.toString()
  }

  const loadProfit = async () => {
    try {
      const p = await api.get<{ summary: ProfitSummary }>(`/reports/profit?${profitQuery()}`)
      setProfit(p.summary)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل تقرير الأرباح')
    }
  }

  const clearDateFilter = () => { setDateFrom(''); setDateTo('') }

  // ---------------- Closing tab state ----------------
  const [branches, setBranches] = useState<Branch[]>([])
  const [closings, setClosings] = useState<DailyClosingDTO[]>([])
  const [closingTarget, setClosingTarget] = useState<{ level: 'branch' | 'company'; id: string; name: string } | null>(null)
  const [closeNotes, setCloseNotes] = useState('')
  const [closeError, setCloseError] = useState('')
  const [savingClose, setSavingClose] = useState(false)
  const [expandedClosing, setExpandedClosing] = useState<string | null>(null)
  const [closingsPage, setClosingsPage] = useState(1)

  const todaysClosings = closings.filter((c) => c.date === today())
  const closedBranchIds = new Set(todaysClosings.filter((c) => c.level === 'branch').map((c) => c.targetId))
  const companyClosedToday = todaysClosings.some((c) => c.level === 'company')
  const allBranchesClosed = branches.length > 0 && branches.every((b) => closedBranchIds.has(b.id))

  const sortedClosings = useMemo(() => [...closings].sort((a, b) => (a.closedAt < b.closedAt ? 1 : -1)), [closings])
  const pagedClosings = paginate(sortedClosings, closingsPage)

  const openClose = (level: 'branch' | 'company', id: string, name: string) => {
    setClosingTarget({ level, id, name })
    setCloseNotes('')
    setCloseError('')
  }

  const load = async () => {
    try {
      const results = await Promise.allSettled([
        api.get<{ summary: ProfitSummary }>(`/reports/profit?${profitQuery()}`),
        api.get<DebtsSummary>('/reports/debts-summary'),
        api.get<ComplianceFlag[]>('/compliance/flags'),
        api.get<JournalEntry[]>('/journal_entries'),
        api.get<CancelledTransaction[]>('/reports/cancelled-transactions'),
        api.get<Branch[]>('/branches'),
        api.get<DailyClosingDTO[]>('/daily_closings'),
      ])
      const [p, d, f, j, ct, br, cl] = results
      if (p.status === 'fulfilled') setProfit(p.value.summary)
      if (d.status === 'fulfilled') setDebts(d.value)
      if (f.status === 'fulfilled') setFlags(f.value)
      if (j.status === 'fulfilled') setJournalEntries(j.value)
      if (ct.status === 'fulfilled') setCancelledTx(ct.value)
      if (br.status === 'fulfilled') setBranches(br.value)
      if (cl.status === 'fulfilled') setClosings(cl.value)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل التقارير')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (!loading) loadProfit() }, [dateFrom, dateTo])

  const submitClose = async (e: FormEvent) => {
    e.preventDefault()
    if (!closingTarget) return
    setCloseError('')
    setSavingClose(true)
    try {
      const path = closingTarget.level === 'branch'
        ? `/daily_closings/branch/${encodeURIComponent(closingTarget.id)}/close`
        : '/daily_closings/company/close'
      await api.post(path, { notes: closeNotes.trim() || null })
      setClosingTarget(null)
      await load()
    } catch (err) {
      setCloseError(err instanceof ApiError ? err.message : 'تعذر تنفيذ الإقفال')
    } finally {
      setSavingClose(false)
    }
  }

  const openReverseEntry = (entry: JournalEntry) => {
    setReversingEntry(entry)
    setReverseReason('')
    setReverseError('')
  }

  const submitReverseEntry = async (e: FormEvent) => {
    e.preventDefault()
    if (!reversingEntry) return
    if (!reverseReason.trim()) {
      setReverseError('سبب العكس مطلوب')
      return
    }
    setReversingId(reversingEntry.id)
    try {
      await api.post(`/journal_entries/${reversingEntry.id}/reverse`, { reason: reverseReason.trim() })
      setReversingEntry(null)
      await load()
    } catch (err) {
      setReverseError(err instanceof ApiError ? err.message : 'تعذر عكس القيد')
    } finally {
      setReversingId(null)
    }
  }

  const reviewFlag = async (flag: ComplianceFlag, status: 'reviewed' | 'reported') => {
    setReviewingFlag(flag.id)
    try {
      await api.put(`/compliance/flags/${flag.id}`, { status, notes: null })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحديث حالة المراجعة')
    } finally {
      setReviewingFlag(null)
    }
  }

  const handleDownload = async (key: string, path: string, filename: string, openInstant: boolean) => {
    setDownloading(key)
    try {
      if (openInstant) {
        await openFile(path)
      } else {
        await downloadFile(path, filename)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر فتح الملف')
    } finally {
      setDownloading(null)
    }
  }

  const sendReportWhatsapp = async (key: string, path: string, body: Record<string, unknown>) => {
    setSendingReport(key)
    setError('')
    try {
      await api.post(path, body)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إرسال التقرير عبر واتساب')
    } finally {
      setSendingReport(null)
    }
  }

  const reportCards = [
    { key: 'profit-xlsx', label: 'تقرير الأرباح (Excel)', path: `/reports/profit/export?format=xlsx&${profitQuery()}`, filename: 'profit_report.xlsx', openInstant: false, whatsappPath: '/reports/send_whatsapp', whatsappBody: { report: 'profit', format: 'xlsx', date_from: dateFrom || undefined, date_to: dateTo || undefined } },
    { key: 'profit-pdf', label: 'تقرير الأرباح (PDF)', path: `/reports/profit/export?format=pdf&${profitQuery()}`, filename: 'profit_report.pdf', openInstant: true, whatsappPath: '/reports/send_whatsapp', whatsappBody: { report: 'profit', format: 'pdf', date_from: dateFrom || undefined, date_to: dateTo || undefined } },
    { key: 'debts-xlsx', label: 'ملخص الديون (Excel)', path: '/reports/debts-summary/export?format=xlsx', filename: 'debts_summary.xlsx', openInstant: false, whatsappPath: '/reports/send_whatsapp', whatsappBody: { report: 'debts-summary', format: 'xlsx' } },
    { key: 'tx-xlsx', label: 'سجل العمليات (Excel)', path: '/transactions/export?format=xlsx', filename: 'transactions.xlsx', openInstant: false, whatsappPath: '/transactions/send_whatsapp', whatsappBody: { format: 'xlsx' } },
    { key: 'tx-pdf', label: 'سجل العمليات (PDF)', path: '/transactions/export?format=pdf', filename: 'transactions.pdf', openInstant: true, whatsappPath: '/transactions/send_whatsapp', whatsappBody: { format: 'pdf' } },
    { key: 'jv-xlsx', label: 'القيود المحاسبية (Excel)', path: '/journal_entries/export?format=xlsx', filename: 'journal_entries.xlsx', openInstant: false, whatsappPath: '/journal_entries/send_whatsapp', whatsappBody: { format: 'xlsx' } },
    { key: 'jv-pdf', label: 'القيود المحاسبية (PDF)', path: '/journal_entries/export?format=pdf', filename: 'journal_entries.pdf', openInstant: true, whatsappPath: '/journal_entries/send_whatsapp', whatsappBody: { format: 'pdf' } },
    { key: 'cancelled-xlsx', label: 'العمليات الملغاة (Excel)', path: '/reports/cancelled-transactions/export?format=xlsx', filename: 'cancelled_transactions.xlsx', openInstant: false, whatsappPath: '/reports/send_whatsapp', whatsappBody: { report: 'cancelled-transactions', format: 'xlsx' } },
    { key: 'cancelled-pdf', label: 'العمليات الملغاة (PDF)', path: '/reports/cancelled-transactions/export?format=pdf', filename: 'cancelled_transactions.pdf', openInstant: true, whatsappPath: '/reports/send_whatsapp', whatsappBody: { report: 'cancelled-transactions', format: 'pdf' } },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">التقارير والإقفال اليومي</h2>
        {tab === 'closing' && <span className="text-sm text-muted-foreground">{today()}</span>}
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}
      {tab === 'reports' && !canView && <p className="rounded-md bg-warning/10 px-4 py-2 text-sm text-warning">لا تملك صلاحية رؤية التقارير — الأرقام قد تكون غير مكتملة.</p>}
      {tab === 'closing' && !canClose && <p className="rounded-md bg-warning/10 px-4 py-2 text-sm text-warning">لا تملك صلاحية اعتماد الإقفالات — يمكنك الاطلاع فقط.</p>}

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'reports' && (
        <>
          {/* Date range filter — scopes the profit KPIs and profit/Excel/PDF exports below.
              Defaults to the current month so one old outlier transaction can't silently
              distort an "all time" total; clear the fields to go back to all-time. */}
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Filter className="h-4 w-4 text-muted-foreground" /> فترة تقرير الأرباح
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">من تاريخ</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">إلى تاريخ</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <button onClick={clearDateFilter} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">كل الفترات</button>
            {!dateFrom && !dateTo && <span className="text-xs text-warning">عرض كل الفترات — قد تشمل عمليات قديمة تؤثر على الإجمالي</span>}
          </div>

          {/* Summary KPIs */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><TrendingUp className="h-4 w-4" /> إجمالي الأرباح المتوقعة</div>
              <p className="text-2xl font-bold text-foreground">{loading ? '—' : (profit?.totalProfit ?? 0).toLocaleString()} د.ل</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><FileText className="h-4 w-4" /> إجمالي العمليات</div>
              <p className="text-2xl font-bold text-foreground">{loading ? '—' : profit?.totalTx ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">شراء {profit?.buyCount ?? 0} · بيع {profit?.sellCount ?? 0} · تبديل {profit?.exchangeCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><AlertTriangle className="h-4 w-4" /> الديون المفتوحة</div>
              <p className="text-2xl font-bold text-foreground">{loading ? '—' : (debts?.totalOpen ?? 0).toLocaleString()} د.ل</p>
              <p className="text-xs text-muted-foreground mt-1">{debts?.openCount ?? 0} دين نشط</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 text-danger text-sm mb-2"><AlertTriangle className="h-4 w-4" /> ديون متأخرة</div>
              <p className="text-2xl font-bold text-danger">{loading ? '—' : (debts?.totalOverdue ?? 0).toLocaleString()} د.ل</p>
              <p className="text-xs text-muted-foreground mt-1">{debts?.overdueCount ?? 0} دين متأخر</p>
            </div>
          </div>

          {/* Downloadable reports */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {reportCards.map((r) => (
              <div key={r.key} className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-border bg-card shadow-sm">
                <div className="rounded-full bg-primary/10 p-4 text-primary">
                  {downloading === r.key ? <Download className="h-6 w-6 animate-bounce" /> : <FileText className="h-6 w-6" />}
                </div>
                <span className="font-medium text-foreground text-sm text-center">{r.label}</span>
                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  <button
                    onClick={() => handleDownload(r.key, r.path, r.filename, r.openInstant)}
                    disabled={downloading === r.key}
                    className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-60"
                  >
                    <Download className="h-3.5 w-3.5" /> {r.openInstant ? 'فتح' : 'تحميل'}
                  </button>
                  <button
                    onClick={() => sendReportWhatsapp(r.key, r.whatsappPath, r.whatsappBody)}
                    disabled={sendingReport === r.key}
                    className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted hover:text-success transition-colors disabled:opacity-60"
                  >
                    {sendingReport === r.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} واتساب
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* AML / Compliance flags */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4 bg-secondary/30 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-danger" />
              <h3 className="text-lg font-semibold text-foreground">عمليات تستوجب المراجعة (الامتثال ومكافحة غسل الأموال)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">العميل</th>
                    <th className="px-6 py-4 font-medium">السبب</th>
                    <th className="px-6 py-4 font-medium">القيمة (د.ل)</th>
                    <th className="px-6 py-4 font-medium">التاريخ</th>
                    <th className="px-6 py-4 font-medium">الحالة</th>
                    <th className="px-6 py-4 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {flags.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">لا توجد عمليات تستوجب المراجعة</td></tr>
                  ) : pagedFlags.map((f) => (
                    <tr key={f.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{f.customerName || '—'}</td>
                      <td className="px-6 py-4">{f.reason}</td>
                      <td className="px-6 py-4 font-medium">{f.amountLydEquivalent.toLocaleString()}</td>
                      <td className="px-6 py-4 text-muted-foreground">{f.timestamp}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                          ${f.status === 'pending' ? 'bg-warning/10 text-warning' : f.status === 'reviewed' ? 'bg-info/10 text-info' : 'bg-success/10 text-success'}`}>
                          {f.status === 'pending' ? 'بانتظار المراجعة' : f.status === 'reviewed' ? 'تمت المراجعة' : 'تم الإبلاغ'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {f.status === 'pending' && (
                          <button
                            onClick={() => reviewFlag(f, 'reviewed')}
                            disabled={reviewingFlag === f.id}
                            className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors text-xs font-medium disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" /> تحديد كمراجعة
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={flagsPage} totalItems={sortedFlags.length} onPageChange={setFlagsPage} />
          </div>

          {/* Journal Entries */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4 bg-secondary/30 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">القيود المحاسبية</h3>
            </div>
            <div className="divide-y divide-border max-h-[28rem] overflow-y-auto">
              {journalEntries.length === 0 ? (
                <p className="px-6 py-8 text-center text-muted-foreground text-sm">لا توجد قيود محاسبية</p>
              ) : pagedJournalEntries.map((jv) => (
                <div key={jv.id}>
                  <button
                    onClick={() => setExpandedEntry(expandedEntry === jv.id ? null : jv.id)}
                    className="flex w-full items-center justify-between px-6 py-3 text-right hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedEntry === jv.id ? 'rotate-180' : ''}`} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{jv.id} — {jv.txType}</p>
                        <p className="text-xs text-muted-foreground">{jv.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                        ${jv.status === 'approved' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                        {jv.status === 'approved' ? 'معتمد' : 'ملغي'}
                      </span>
                      <span className="text-xs text-muted-foreground">{jv.date}</span>
                    </div>
                  </button>
                  {expandedEntry === jv.id && (
                    <div className="bg-secondary/20 px-6 py-3 overflow-x-auto">
                      <table className="w-full text-xs text-right">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th className="py-1.5 font-medium">الحساب</th>
                            <th className="py-1.5 font-medium">العملة</th>
                            <th className="py-1.5 font-medium">مدين</th>
                            <th className="py-1.5 font-medium">دائن</th>
                            <th className="py-1.5 font-medium">المعادل (د.ل)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {jv.lines.map((l, i) => (
                            <tr key={i}>
                              <td className="py-1.5">{l.accountName}</td>
                              <td className="py-1.5">{l.currency}</td>
                              <td className="py-1.5 text-success">{l.debit ? l.debit.toLocaleString() : '—'}</td>
                              <td className="py-1.5 text-danger">{l.credit ? l.credit.toLocaleString() : '—'}</td>
                              <td className="py-1.5">{l.equivalentLYD.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {jv.status === 'approved' && canReverse && (
                        <button
                          onClick={() => openReverseEntry(jv)}
                          disabled={reversingId === jv.id}
                          className="mt-3 flex items-center gap-1 text-danger hover:text-danger/80 transition-colors text-xs font-medium disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> عكس القيد
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <TablePagination page={journalPage} totalItems={sortedJournalEntries.length} onPageChange={setJournalPage} />
          </div>

          {/* Profit breakdown by branch / cashier */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="border-b border-border px-6 py-4 bg-secondary/30 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">الأرباح حسب الفرع</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-6 py-3 font-medium">الفرع</th>
                      <th className="px-6 py-3 font-medium">عدد العمليات</th>
                      <th className="px-6 py-3 font-medium">الربح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {!profit || branchEntries.length === 0 ? (
                      <tr><td colSpan={3} className="px-6 py-6 text-center text-muted-foreground">لا توجد بيانات بعد</td></tr>
                    ) : pagedBranchEntries.map(([branch, d]) => (
                      <tr key={branch} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-3 font-medium text-foreground">{branch}</td>
                        <td className="px-6 py-3 text-muted-foreground">{d.count}</td>
                        <td className="px-6 py-3 font-medium">{d.profit.toLocaleString()} د.ل</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination page={branchPage} totalItems={branchEntries.length} onPageChange={setBranchPage} />
            </div>

            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="border-b border-border px-6 py-4 bg-secondary/30 flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">الأرباح حسب الصراف</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-6 py-3 font-medium">الصراف</th>
                      <th className="px-6 py-3 font-medium">عدد العمليات</th>
                      <th className="px-6 py-3 font-medium">الربح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {!profit || cashierEntries.length === 0 ? (
                      <tr><td colSpan={3} className="px-6 py-6 text-center text-muted-foreground">لا توجد بيانات بعد</td></tr>
                    ) : pagedCashierEntries.map(([cashier, d]) => (
                      <tr key={cashier} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-3 font-medium text-foreground">{cashier}</td>
                        <td className="px-6 py-3 text-muted-foreground">{d.count}</td>
                        <td className="px-6 py-3 font-medium">{d.profit.toLocaleString()} د.ل</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination page={cashierPage} totalItems={cashierEntries.length} onPageChange={setCashierPage} />
            </div>
          </div>

          {/* Cancelled / reversed transactions */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4 bg-secondary/30 flex items-center gap-2">
              <Ban className="h-4 w-4 text-danger" />
              <h3 className="text-lg font-semibold text-foreground">العمليات الملغاة (المعكوسة)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">رقم العملية</th>
                    <th className="px-6 py-4 font-medium">النوع</th>
                    <th className="px-6 py-4 font-medium">المبلغ</th>
                    <th className="px-6 py-4 font-medium">بواسطة</th>
                    <th className="px-6 py-4 font-medium">سبب الإلغاء</th>
                    <th className="px-6 py-4 font-medium">طلب الإلغاء بواسطة</th>
                    <th className="px-6 py-4 font-medium">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cancelledTx.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">لا توجد عمليات ملغاة</td></tr>
                  ) : pagedCancelledTx.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{t.id}</td>
                      <td className="px-6 py-4">{t.type}</td>
                      <td className="px-6 py-4">{t.amount.toLocaleString()} {t.fromCurrency}</td>
                      <td className="px-6 py-4 text-muted-foreground">{t.user}</td>
                      <td className="px-6 py-4">{t.reversalReason || '—'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{t.reversalRequestedBy || '—'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{t.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={cancelledPage} totalItems={sortedCancelledTx.length} onPageChange={setCancelledPage} />
          </div>

          {/* Volume by currency */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4 bg-secondary/30">
              <h3 className="text-lg font-semibold text-foreground">حجم التداول حسب العملة</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">العملة</th>
                    <th className="px-6 py-4 font-medium">الحجم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={2} className="px-6 py-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
                  ) : volumeEntries.length === 0 ? (
                    <tr><td colSpan={2} className="px-6 py-8 text-center text-muted-foreground">لا توجد بيانات بعد</td></tr>
                  ) : pagedVolumeEntries.map(([ccy, vol]) => (
                    <tr key={ccy} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{ccy}</td>
                      <td className="px-6 py-4">{vol.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={volumePage} totalItems={volumeEntries.length} onPageChange={setVolumePage} />
          </div>
        </>
      )}

      {tab === 'closing' && (
        <>
          {/* Branches */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4 bg-secondary/30 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">إقفال يومية الفروع</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">الفرع</th>
                    <th className="px-6 py-4 font-medium">حالة اليوم</th>
                    <th className="px-6 py-4 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {branches.length === 0 ? (
                    <tr><td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">لا توجد فروع مسجلة</td></tr>
                  ) : branches.map((b) => {
                    const closed = closedBranchIds.has(b.id)
                    return (
                      <tr key={b.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-foreground">{b.name}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${closed ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                            {closed ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                            {closed ? 'تم الإقفال' : 'لم يُقفل بعد'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {!closed && canClose && (
                            <button
                              onClick={() => openClose('branch', b.id, b.name)}
                              className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors text-xs font-medium"
                            >
                              <Lock className="h-3.5 w-3.5" /> إقفال يومية الفرع
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Company */}
          <div className={`rounded-xl border p-6 shadow-sm flex items-center justify-between ${companyClosedToday ? 'border-success/30 bg-success/5' : 'border-border bg-card'}`}>
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${companyClosedToday ? 'bg-success/10 text-success' : 'bg-accent text-primary'}`}>
                <Landmark className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">إقفال يومية الشركة (جميع الفروع)</h3>
                <p className="text-sm text-muted-foreground">
                  {companyClosedToday ? 'تم إقفال يومية الشركة لهذا اليوم' : allBranchesClosed ? 'جميع الفروع مقفلة — يمكن إقفال يومية الشركة الآن' : 'يجب إقفال جميع الفروع أولاً'}
                </p>
              </div>
            </div>
            {!companyClosedToday && canClose && (
              <button
                onClick={() => openClose('company', 'COMPANY', 'الشركة')}
                disabled={!allBranchesClosed}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Lock className="h-4 w-4" /> إقفال يومية الشركة
              </button>
            )}
          </div>

          {/* History */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4 bg-secondary/30">
              <h3 className="text-lg font-semibold text-foreground">سجل الإقفالات</h3>
            </div>
            <div className="divide-y divide-border">
              {closings.length === 0 ? (
                <p className="px-6 py-8 text-center text-muted-foreground text-sm">لا توجد إقفالات مسجلة</p>
              ) : pagedClosings.map((c) => (
                <div key={c.id}>
                  <button
                    onClick={() => setExpandedClosing(expandedClosing === c.id ? null : c.id)}
                    className="flex w-full items-center justify-between px-6 py-3 text-right hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedClosing === c.id ? 'rotate-180' : ''}`} />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {c.level === 'company' ? 'إقفال الشركة' : `إقفال فرع ${c.targetName}`} — {c.date}
                        </p>
                        <p className="text-xs text-muted-foreground">بواسطة {c.closedBy} — {c.closedAt}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-success/10 text-success">
                      {c.status === 'approved' ? 'معتمد' : 'مقفل'}
                    </span>
                  </button>
                  {expandedClosing === c.id && (
                    <div className="bg-secondary/20 px-6 py-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-1">الإجماليات</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(c.totals).map(([ccy, amt]) => (
                            <span key={ccy} className="rounded-md bg-card border border-border px-2.5 py-1 text-xs font-medium">{amt.toLocaleString()} {ccy}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-1">تفاصيل الخزنات</p>
                        <div className="rounded-md border border-border overflow-x-auto">
                          <table className="w-full text-xs text-right">
                            <thead className="bg-secondary/50 text-muted-foreground">
                              <tr>
                                <th className="px-3 py-1.5 font-medium">الخزنة</th>
                                <th className="px-3 py-1.5 font-medium">الأرصدة</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {Object.entries(c.balancesSnapshot).map(([vaultId, v]) => (
                                <tr key={vaultId}>
                                  <td className="px-3 py-1.5 font-medium">{v.name}</td>
                                  <td className="px-3 py-1.5">{Object.entries(v.balances).map(([ccy, amt]) => `${amt.toLocaleString()} ${ccy}`).join(' / ') || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      {c.notes && <p className="text-xs text-muted-foreground">ملاحظات: {c.notes}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <TablePagination page={closingsPage} totalItems={sortedClosings.length} onPageChange={setClosingsPage} />
          </div>

          {closingTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                  <h3 className="text-lg font-semibold text-foreground">إقفال يومية {closingTarget.name}</h3>
                  <button onClick={() => setClosingTarget(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                </div>
                <form onSubmit={submitClose} className="space-y-4 p-6 text-right">
                  <p className="text-xs text-muted-foreground">سيتم أخذ لقطة (Snapshot) لأرصدة جميع الخزنات المعنية وتسجيلها كإقفال نهائي لهذا اليوم.</p>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                    <textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                  {closeError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{closeError}</p>}
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setClosingTarget(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                    <button type="submit" disabled={savingClose} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                      {savingClose && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد الإقفال
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* Reverse Journal Entry Modal */}
      {reversingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">عكس القيد "{reversingEntry.id}"</h3>
              <button onClick={() => setReversingEntry(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitReverseEntry} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">سبب العكس *</label>
                <textarea
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  rows={3}
                  autoFocus
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {reverseError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{reverseError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setReversingEntry(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button
                  type="submit"
                  disabled={reversingId === reversingEntry.id}
                  className="flex items-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 transition-colors disabled:opacity-60"
                >
                  {reversingId === reversingEntry.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  تأكيد العكس
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
