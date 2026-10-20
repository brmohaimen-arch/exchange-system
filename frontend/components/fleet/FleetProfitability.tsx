'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, FileText, Download } from 'lucide-react'
import { api, openFile, downloadFile, FleetVehicleAnalysis, FleetTransaction } from '@/lib/api-client'
import { ApiError } from '@/lib/auth-provider'

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
const pct = (n: number | null) => (n === null ? '—' : `${n}%`)

type Filter = 'all' | 'stock' | 'sold'
type Sort = 'number' | 'profit' | 'cost' | 'days'

function Row({ label, value, share, strong, tone }: { label: string; value: string; share?: string; strong?: boolean; tone?: 'success' | 'danger' }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 text-sm ${strong ? 'border-t border-border pt-2 font-semibold' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-3" dir="ltr">
        {share && <span className="text-xs text-muted-foreground">{share}</span>}
        <span className={tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-foreground'}>{value}</span>
      </span>
    </div>
  )
}

function CarAnalysis({ v, base, onClose }: { v: FleetVehicleAnalysis; base: string; onClose: () => void }) {
  const [moves, setMoves] = useState<FleetTransaction[] | null>(null)
  useEffect(() => {
    api.get<FleetTransaction[]>(`${base}/fleet/vehicles/${v.id}/transactions`).then(setMoves).catch(() => setMoves([]))
  }, [base, v.id])

  const share = (x: number) => (v.totalCostLyd ? `${Math.round((x / v.totalCostLyd) * 100)}%` : '')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <h3 className="text-lg font-bold text-foreground">#{String(v.autoNumber).padStart(3, '0')} — {v.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {v.type}{v.chassisNumber ? ` · الهيكل ${v.chassisNumber}` : ''} · {v.status}{v.warehouseName ? ` · ${v.warehouseName}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 p-5 text-right">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-secondary/40 px-3 py-3"><p className="text-xs text-muted-foreground">التكلفة الكاملة</p><p className="mt-1 text-lg font-bold" dir="ltr">{money(v.totalCostLyd)}</p></div>
            <div className="rounded-lg bg-secondary/40 px-3 py-3">
              <p className="text-xs text-muted-foreground">{v.sold ? 'الربح' : 'حد التعادل (أقل سعر بيع)'}</p>
              <p className={`mt-1 text-lg font-bold ${v.sold && (v.profitLyd ?? 0) < 0 ? 'text-danger' : v.sold ? 'text-success' : ''}`} dir="ltr">{money(v.sold ? (v.profitLyd ?? 0) : (v.breakEvenLyd ?? 0))}</p>
            </div>
            <div className="rounded-lg bg-secondary/40 px-3 py-3"><p className="text-xs text-muted-foreground">{v.sold ? 'مدة البيع' : 'في المخزون منذ'}</p><p className="mt-1 text-lg font-bold">{v.daysInStock === null ? '—' : `${v.daysInStock} يوم`}</p></div>
          </div>

          <div>
            <h4 className="mb-1 text-sm font-semibold text-foreground">تفصيل التكلفة (د.ل)</h4>
            <Row label={`سعر الشراء${v.currency !== 'LYD' ? ` (${money(v.purchasePrice)} ${v.currency})` : ''}${v.sellerName ? ` — من ${v.sellerName}` : ''}`} value={money(v.purchaseLyd)} share={share(v.purchaseLyd)} />
            {Object.entries(v.expensesByCategoryLyd).map(([cat, amt]) => <Row key={cat} label={cat} value={money(amt)} share={share(amt)} />)}
            {v.damageLyd > 0 && <Row label="أضرار وإصلاحات" value={money(v.damageLyd)} share={share(v.damageLyd)} />}
            <Row label="التكلفة الكاملة" value={money(v.totalCostLyd)} strong />
          </div>

          {v.sold ? (
            <div>
              <h4 className="mb-1 text-sm font-semibold text-foreground">النتيجة</h4>
              <Row label={`سعر البيع${v.saleCurrency && v.saleCurrency !== 'LYD' && v.salePrice !== null ? ` (${money(v.salePrice)} ${v.saleCurrency})` : ''}${v.buyerName ? ` — ${v.buyerName}` : ''}${v.saleDate ? ` — ${v.saleDate}` : ''}`} value={money(v.saleLyd ?? 0)} />
              {Object.entries(v.otherIncomeByCategoryLyd).map(([cat, amt]) => <Row key={cat} label={`+ ${cat}`} value={money(amt)} />)}
              <Row label="− التكلفة الكاملة" value={money(v.totalCostLyd)} />
              <Row label="الربح الصافي" value={money(v.profitLyd ?? 0)} strong tone={(v.profitLyd ?? 0) < 0 ? 'danger' : 'success'} />
              <p className="pt-1 text-xs text-muted-foreground">من التكلفة <span dir="ltr">{pct(v.profitOnCostPct)}</span> · من سعر البيع <span dir="ltr">{pct(v.marginPct)}</span></p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
              لم تُبع بعد — لتحقيق ربح يجب أن يتجاوز سعر البيع <span dir="ltr" className="font-semibold text-foreground">{money(v.breakEvenLyd ?? 0)} د.ل</span>.
              {v.otherIncomeLyd > 0 && <> وقد حققت حتى الآن إيرادات أخرى <span dir="ltr" className="font-semibold text-success">{money(v.otherIncomeLyd)} د.ل</span> (تدخل في ربحها عند البيع).</>}
            </div>
          )}

          <div>
            <h4 className="mb-1 text-sm font-semibold text-foreground">حركات المركبة</h4>
            {moves === null ? (
              <p className="text-xs text-muted-foreground">جاري التحميل...</p>
            ) : moves.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد حركات</p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border text-sm">
                {[...moves].sort((a, b) => a.date.localeCompare(b.date)).map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-xs text-muted-foreground" dir="ltr">{m.date.slice(0, 10)}</span>
                    <span className="flex-1 truncate text-foreground">{m.category}{m.counterparty ? ` — ${m.counterparty}` : ''}</span>
                    <span dir="ltr" className={m.type === 'income' ? 'text-success' : 'text-danger'}>{m.type === 'income' ? '+' : '−'} {money(m.amount)} {m.currency}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Every vehicle with its full cost, profit and days in stock; click one for its analysis. */
export function FleetProfitability({ base, company, refreshKey }: { base: string; company: string; refreshKey: number }) {
  const [rows, setRows] = useState<FleetVehicleAnalysis[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('number')
  const [open, setOpen] = useState<FleetVehicleAnalysis | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)

  useEffect(() => {
    setError('')
    api.get<FleetVehicleAnalysis[]>(`${base}/fleet/analysis`).then(setRows).catch((e) => setError(e instanceof ApiError ? e.message : 'تعذر تحميل ربحية المركبات'))
  }, [base, refreshKey])

  const shown = useMemo(() => {
    const list = (rows ?? []).filter((r) => (filter === 'all' ? true : filter === 'sold' ? r.sold : !r.sold))
    const by: Record<Sort, (a: FleetVehicleAnalysis, b: FleetVehicleAnalysis) => number> = {
      number: (a, b) => a.autoNumber - b.autoNumber,
      profit: (a, b) => (b.profitLyd ?? -Infinity) - (a.profitLyd ?? -Infinity),
      cost: (a, b) => b.totalCostLyd - a.totalCostLyd,
      days: (a, b) => (b.daysInStock ?? -1) - (a.daysInStock ?? -1),
    }
    return [...list].sort(by[sort])
  }, [rows, filter, sort])

  const totals = useMemo(() => {
    const t = { cost: 0, sale: 0, profit: 0, soldCost: 0, stock: 0 }
    for (const r of shown) {
      t.cost += r.totalCostLyd
      if (r.sold) { t.sale += r.saleLyd ?? 0; t.profit += r.profitLyd ?? 0; t.soldCost += r.totalCostLyd } else t.stock += r.totalCostLyd
    }
    return t
  }, [shown])

  const exportFile = async (format: 'pdf' | 'xlsx') => {
    setExporting(format)
    setError('')
    try {
      const path = `${base}/fleet/analysis/export?format=${format}`
      if (format === 'pdf') await openFile(path)
      else await downloadFile(path, `profitability_${company}.xlsx`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذر تحميل الملف')
    } finally {
      setExporting(null)
    }
  }

  const tab = (k: Filter, label: string) => (
    <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${filter === k ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>{label}</button>
  )

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {tab('all', 'الكل')}{tab('stock', 'في المخزون')}{tab('sold', 'المباعة')}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            <option value="number">ترتيب بالرقم</option>
            <option value="profit">الأعلى ربحاً</option>
            <option value="cost">الأعلى تكلفة</option>
            <option value="days">الأطول بقاءً</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportFile('pdf')} disabled={exporting !== null} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-60">
            {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF
          </button>
          <button onClick={() => exportFile('xlsx')} disabled={exporting !== null} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-60">
            {exporting === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Excel
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

      {rows === null && !error ? (
        <p className="py-10 text-center text-sm text-muted-foreground">جاري التحميل...</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">المركبة</th>
                <th className="px-3 py-2 font-medium">الحالة</th>
                <th className="px-3 py-2 font-medium">التكلفة الكاملة</th>
                <th className="px-3 py-2 font-medium">سعر البيع</th>
                <th className="px-3 py-2 font-medium">الربح</th>
                <th className="px-3 py-2 font-medium">% من التكلفة</th>
                <th className="px-3 py-2 font-medium">الأيام</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r)} className="cursor-pointer border-b border-border/60 hover:bg-secondary/40">
                  <td className="px-3 py-2 font-medium text-foreground">#{String(r.autoNumber).padStart(3, '0')} {r.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.sold ? 'مباعة' : r.status}</td>
                  <td className="px-3 py-2" dir="ltr">{money(r.totalCostLyd)}</td>
                  <td className="px-3 py-2" dir="ltr">{r.sold ? money(r.saleLyd ?? 0) : '—'}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {r.sold ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${(r.profitLyd ?? 0) < 0 ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>{money(r.profitLyd ?? 0)}</span> : '—'}
                  </td>
                  <td className="px-3 py-2" dir="ltr">{pct(r.profitOnCostPct)}</td>
                  <td className="px-3 py-2" dir="ltr">{r.daysInStock ?? '—'}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">لا توجد مركبات</td></tr>}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-3 py-2" colSpan={2}>الإجمالي ({shown.length})</td>
                  <td className="px-3 py-2" dir="ltr">{money(totals.cost)}</td>
                  <td className="px-3 py-2" dir="ltr">{money(totals.sale)}</td>
                  <td className={`px-3 py-2 ${totals.profit < 0 ? 'text-danger' : 'text-success'}`} dir="ltr">{money(totals.profit)}</td>
                  <td className="px-3 py-2" dir="ltr">{totals.soldCost ? `${Math.round((totals.profit / totals.soldCost) * 1000) / 10}%` : '—'}</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            )}
          </table>
          <p className="mt-3 text-xs text-muted-foreground">كل المبالغ بما يعادلها بالدينار. التكلفة الكاملة = سعر الشراء + المصروفات + الأضرار. رأس المال في المخزون = تكلفة غير المباعة ({money(totals.stock)} د.ل). اضغط على أي مركبة لتحليلها.</p>
        </div>
      )}

      {open && <CarAnalysis v={open} base={base} onClose={() => setOpen(null)} />}
    </div>
  )
}
