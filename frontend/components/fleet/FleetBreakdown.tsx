'use client'

import { Landmark, TrendingUp, TrendingDown, Truck } from 'lucide-react'
import type { FleetSummary } from '@/lib/api-client'

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'success' | 'danger' }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1 text-sm ${strong ? 'border-t border-border pt-2 font-semibold' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span dir="ltr" className={tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-foreground'}>{value}</span>
    </div>
  )
}

function CategoryList({ title, items }: { title: string; items: Record<string, number> }) {
  const rows = Object.entries(items)
  if (rows.length === 0) return null
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{title}</p>
      {rows.map(([cat, amt]) => <Line key={cat} label={cat} value={`${money(amt)} د.ل`} />)}
    </div>
  )
}

/** Capital tied up in unsold cars / profit on sold cars / what was spent — the company picture without charts.
 *  Every amount is a LYD equivalent. */
export function FleetBreakdown({ summary, loading, vehicleCount, statusCounts }: { summary: FleetSummary | null; loading: boolean; vehicleCount: number; statusCounts: Record<string, number> }) {
  const p = summary?.profitability
  if (loading && !p) return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">جاري تحميل ملخص الشركة...</div>
  if (!p) return null
  const profit = p.sales.realizedProfitLyd
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Landmark className="h-4 w-4 text-primary" /> رأس المال في المخزون</div>
          <p className="text-2xl font-bold text-foreground" dir="ltr">{money(p.capital.inventoryCostLyd)} د.ل</p>
          <p className="mb-3 text-xs text-muted-foreground">{p.capital.inventoryCount} مركبة/معدة غير مباعة — أموال مجمّدة وليست خسارة</p>
          <Line label="سعر الشراء" value={`${money(p.capital.purchaseLyd)} د.ل`} />
          <Line label="مصروفات وأضرار عليها" value={`${money(p.capital.expensesLyd)} د.ل`} />
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4 text-success" /> الربح المحقق من المباع</div>
          <p className={`text-2xl font-bold ${profit < 0 ? 'text-danger' : 'text-foreground'}`} dir="ltr">{money(profit)} د.ل</p>
          <p className="mb-3 text-xs text-muted-foreground">
            {p.sales.soldCount} مركبة مباعة
            {p.sales.profitOnCostPct !== null && <> — العائد على رأس المال <span dir="ltr">{p.sales.profitOnCostPct}%</span> — هامش المبيعات <span dir="ltr">{p.sales.marginPct}%</span></>}
          </p>
          <Line label="المبيعات" value={`${money(p.sales.salesLyd)} د.ل`} />
          <Line label="سعر شراء المباع" value={`− ${money(p.sales.purchaseOfSoldLyd)} د.ل`} />
          <Line label="مصروفات وأضرار المباع" value={`− ${money(p.sales.expensesOfSoldLyd)} د.ل`} />
          {p.sales.otherIncomeLyd !== 0 && <Line label="إيرادات أخرى لها (إيجار وغيره)" value={`+ ${money(p.sales.otherIncomeLyd)} د.ل`} />}
          <Line label="الربح المحقق" value={`${money(profit)} د.ل`} strong tone={profit < 0 ? 'danger' : 'success'} />
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><TrendingDown className="h-4 w-4 text-danger" /> المصروفات (دون سعر الشراء)</div>
          <p className="text-2xl font-bold text-foreground" dir="ltr">{money(p.expenses.onSoldLyd + p.expenses.onStockLyd)} د.ل</p>
          <p className="mb-1 text-xs text-muted-foreground">مصروفات وأضرار — على المباع {money(p.expenses.onSoldLyd)} وعلى المخزون {money(p.expenses.onStockLyd)}</p>
          <CategoryList title="على السيارات المباعة" items={p.expenses.onSoldByCategoryLyd} />
          <CategoryList title="على السيارات في المخزون" items={p.expenses.onStockByCategoryLyd} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Object.keys(p.otherIncomeByCategoryLyd).length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4 text-success" /> إيرادات أخرى غير البيع</div>
            <p className="mb-2 text-xl font-bold text-foreground" dir="ltr">{money(p.otherIncomeTotalLyd)} د.ل</p>
            {Object.entries(p.otherIncomeByCategoryLyd).map(([cat, amt]) => <Line key={cat} label={cat} value={`${money(amt)} د.ل`} />)}
          </div>
        )}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground"><Truck className="h-4 w-4 text-primary" /> عدد المركبات/المعدات</div>
          <p className="text-xl font-bold text-foreground">{vehicleCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">{Object.entries(statusCounts).map(([s, c]) => `${s}: ${c}`).join(' · ')}</p>
          <p className="mt-3 text-xs text-muted-foreground">كل المبالغ بما يعادلها بالدينار حسب سعر الصرف الحالي. «المباع» = المركبات المباعة ضمن الفترة المحددة (أو كلها إن لم تُحدَّد فترة).</p>
        </div>
      </div>
    </div>
  )
}
