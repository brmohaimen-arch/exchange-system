'use client'

import { useEffect, useState } from 'react'
import { FileText, Download, TrendingUp, AlertTriangle, ShieldAlert, Check, BookOpen, ChevronDown, RotateCcw, Building2, User as UserIcon, Ban } from 'lucide-react'
import { api, downloadFile, ComplianceFlag, JournalEntry, CancelledTransaction } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'

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

export default function ReportsPage() {
  const { hasPermission } = useAuth()
  const canView = hasPermission('رؤية التقارير')

  const [profit, setProfit] = useState<ProfitSummary | null>(null)
  const [debts, setDebts] = useState<DebtsSummary | null>(null)
  const [flags, setFlags] = useState<ComplianceFlag[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [cancelledTx, setCancelledTx] = useState<CancelledTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [reviewingFlag, setReviewingFlag] = useState<string | null>(null)
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)
  const [reversingId, setReversingId] = useState<string | null>(null)

  const canReverse = hasPermission('إنشاء عملية عكسية')

  const load = async () => {
    try {
      const results = await Promise.allSettled([
        api.get<{ summary: ProfitSummary }>('/reports/profit'),
        api.get<DebtsSummary>('/reports/debts-summary'),
        api.get<ComplianceFlag[]>('/compliance/flags'),
        api.get<JournalEntry[]>('/journal_entries'),
        api.get<CancelledTransaction[]>('/reports/cancelled-transactions'),
      ])
      const [p, d, f, j, ct] = results
      if (p.status === 'fulfilled') setProfit(p.value.summary)
      if (d.status === 'fulfilled') setDebts(d.value)
      if (f.status === 'fulfilled') setFlags(f.value)
      if (j.status === 'fulfilled') setJournalEntries(j.value)
      if (ct.status === 'fulfilled') setCancelledTx(ct.value)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل التقارير')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const reverseEntry = async (entry: JournalEntry) => {
    const reason = prompt(`سبب عكس القيد "${entry.id}"؟`)
    if (!reason) return
    setReversingId(entry.id)
    try {
      await api.post(`/journal_entries/${entry.id}/reverse`, { reason })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر عكس القيد')
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

  const handleDownload = async (key: string, path: string, filename: string) => {
    setDownloading(key)
    try {
      await downloadFile(path, filename)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل الملف')
    } finally {
      setDownloading(null)
    }
  }

  const reportCards = [
    { key: 'profit-xlsx', label: 'تقرير الأرباح (Excel)', path: '/reports/profit/export?format=xlsx', filename: 'profit_report.xlsx' },
    { key: 'profit-pdf', label: 'تقرير الأرباح (PDF)', path: '/reports/profit/export?format=pdf', filename: 'profit_report.pdf' },
    { key: 'debts-xlsx', label: 'ملخص الديون (Excel)', path: '/reports/debts-summary/export?format=xlsx', filename: 'debts_summary.xlsx' },
    { key: 'tx-xlsx', label: 'سجل العمليات (Excel)', path: '/transactions/export?format=xlsx', filename: 'transactions.xlsx' },
    { key: 'jv-xlsx', label: 'القيود المحاسبية (Excel)', path: '/journal_entries/export?format=xlsx', filename: 'journal_entries.xlsx' },
    { key: 'cancelled-xlsx', label: 'العمليات الملغاة (Excel)', path: '/reports/cancelled-transactions/export?format=xlsx', filename: 'cancelled_transactions.xlsx' },
    { key: 'cancelled-pdf', label: 'العمليات الملغاة (PDF)', path: '/reports/cancelled-transactions/export?format=pdf', filename: 'cancelled_transactions.pdf' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">التقارير والإقفال</h2>
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}
      {!canView && <p className="rounded-md bg-warning/10 px-4 py-2 text-sm text-warning">لا تملك صلاحية رؤية التقارير — الأرقام قد تكون غير مكتملة.</p>}

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
          <button
            key={r.key}
            onClick={() => handleDownload(r.key, r.path, r.filename)}
            disabled={downloading === r.key}
            className="flex flex-col items-center justify-center p-6 rounded-xl border border-border bg-card shadow-sm hover:border-primary/50 transition-colors disabled:opacity-60"
          >
            <div className="rounded-full bg-primary/10 p-4 text-primary mb-3">
              {downloading === r.key ? <Download className="h-6 w-6 animate-bounce" /> : <FileText className="h-6 w-6" />}
            </div>
            <span className="font-medium text-foreground text-sm text-center">{r.label}</span>
          </button>
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
              ) : flags.map((f) => (
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
          ) : journalEntries.map((jv) => (
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
                <div className="bg-secondary/20 px-6 py-3">
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
                      onClick={() => reverseEntry(jv)}
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
                {!profit || Object.keys(profit.profitByBranch || {}).length === 0 ? (
                  <tr><td colSpan={3} className="px-6 py-6 text-center text-muted-foreground">لا توجد بيانات بعد</td></tr>
                ) : Object.entries(profit.profitByBranch).sort((a, b) => b[1].profit - a[1].profit).map(([branch, d]) => (
                  <tr key={branch} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-3 font-medium text-foreground">{branch}</td>
                    <td className="px-6 py-3 text-muted-foreground">{d.count}</td>
                    <td className="px-6 py-3 font-medium">{d.profit.toLocaleString()} د.ل</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                {!profit || Object.keys(profit.profitByCashier || {}).length === 0 ? (
                  <tr><td colSpan={3} className="px-6 py-6 text-center text-muted-foreground">لا توجد بيانات بعد</td></tr>
                ) : Object.entries(profit.profitByCashier).sort((a, b) => b[1].profit - a[1].profit).map(([cashier, d]) => (
                  <tr key={cashier} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-3 font-medium text-foreground">{cashier}</td>
                    <td className="px-6 py-3 text-muted-foreground">{d.count}</td>
                    <td className="px-6 py-3 font-medium">{d.profit.toLocaleString()} د.ل</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              ) : cancelledTx.map((t) => (
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
              ) : !profit || Object.keys(profit.volumeByCurrency).length === 0 ? (
                <tr><td colSpan={2} className="px-6 py-8 text-center text-muted-foreground">لا توجد بيانات بعد</td></tr>
              ) : Object.entries(profit.volumeByCurrency).map(([ccy, vol]) => (
                <tr key={ccy} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">{ccy}</td>
                  <td className="px-6 py-4">{vol.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
