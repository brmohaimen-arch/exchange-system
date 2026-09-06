'use client'

import { useEffect, useMemo, useState, FormEvent } from 'react'
import { Building2, Landmark, Lock, X, Loader2, ChevronDown, CheckCircle2, AlertTriangle } from 'lucide-react'
import { api, Branch, DailyClosingDTO } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'
import { TablePagination, paginate } from '@/components/TablePagination'

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function DailyClosingPage() {
  const { user, hasPermission } = useAuth()
  const canClose = hasPermission('اعتماد الإقفالات')

  const [branches, setBranches] = useState<Branch[]>([])
  const [closings, setClosings] = useState<DailyClosingDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [closingTarget, setClosingTarget] = useState<{ level: 'branch' | 'company'; id: string; name: string } | null>(null)
  const [closeNotes, setCloseNotes] = useState('')
  const [closeError, setCloseError] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedClosing, setExpandedClosing] = useState<string | null>(null)
  const [closingsPage, setClosingsPage] = useState(1)

  const load = async () => {
    try {
      const [b, c] = await Promise.all([
        api.get<Branch[]>('/branches'),
        api.get<DailyClosingDTO[]>('/daily_closings'),
      ])
      setBranches(b)
      setClosings(c)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات الإقفال اليومي')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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

  const submitClose = async (e: FormEvent) => {
    e.preventDefault()
    if (!closingTarget) return
    setCloseError('')
    setSaving(true)
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
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">الإقفال اليومي</h2>
        <span className="text-sm text-muted-foreground">{today()}</span>
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}
      {!canClose && <p className="rounded-md bg-warning/10 px-4 py-2 text-sm text-warning">لا تملك صلاحية اعتماد الإقفالات — يمكنك الاطلاع فقط.</p>}

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
                    <div className="rounded-md border border-border overflow-hidden">
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
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد الإقفال
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
