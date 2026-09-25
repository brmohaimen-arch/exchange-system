'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { DateInput } from '@/components/ui/date-input'
import { matchesQuery } from '@/lib/search'

// One filter bar for every table. Nothing is configured per table: the search
// looks through every value in a row, and the dropdowns / date range are worked
// out from the rows themselves (a `status`, `type`, `currency`, ... field with a
// handful of distinct values becomes a dropdown; a `timestamp` / `date` field
// becomes a from-to range).

const SELECT_KEYS = [
  'status', 'type', 'currency', 'fromCurrency', 'toCurrency', 'branch', 'branchName', 'category', 'role', 'action',
  'level', 'kind', 'paymentMethod', 'vaultName', 'cashier', 'user', 'entityType', 'severity', 'result', 'state', 'isActive',
]
const DATE_KEYS = ['timestamp', 'date', 'createdAt', 'startDate', 'purchaseDate', 'openedAt', 'requestedAt', 'closedAt', 'time', 'loginAt', 'expiryDate', 'dueDate']

const KEY_LABELS: Record<string, string> = {
  status: 'الحالة', type: 'النوع', currency: 'العملة', fromCurrency: 'من عملة', toCurrency: 'إلى عملة', branch: 'الفرع', branchName: 'الفرع',
  category: 'الفئة', role: 'الدور', action: 'الإجراء', level: 'المستوى', kind: 'النوع', paymentMethod: 'طريقة الدفع', vaultName: 'الخزنة',
  cashier: 'الصراف', user: 'المستخدم', entityType: 'الكيان', severity: 'الخطورة', result: 'النتيجة', state: 'الحالة', isActive: 'الفعالية',
}

const VALUE_LABELS: Record<string, string> = {
  approved: 'معتمد', pending: 'قيد الانتظار', reversed: 'ملغي', rejected: 'مرفوض', paid: 'مسدد', unpaid: 'غير مسدد', partially_paid: 'مسدد جزئياً',
  active: 'نشط', inactive: 'غير نشط', open: 'مفتوح', closed: 'مقفل', cancelled: 'ملغي', completed: 'مكتمل', waiting: 'قيد الانتظار',
  in_progress: 'قيد التنفيذ', handed: 'تم التسليم', not_handed: 'لم يتم التسليم', pending_open: 'بانتظار الفتح', pending_close: 'بانتظار الإغلاق',
  buy: 'شراء', sell: 'بيع', exchange: 'تبديل', deposit: 'إيداع', withdraw: 'سحب', transfer: 'تحويل', cash: 'نقدي', bank: 'بنك',
  customer_account: 'حساب العميل', debt: 'دين', true: 'نعم', false: 'لا',
}

const label = (v: string) => VALUE_LABELS[v] ?? v

function flatten(value: unknown, depth = 0, out: unknown[] = []): unknown[] {
  if (value === null || value === undefined) return out
  if (typeof value === 'object') {
    if (depth >= 2) return out
    for (const v of Object.values(value as Record<string, unknown>)) flatten(v, depth + 1, out)
    return out
  }
  out.push(value)
  return out
}

interface Options {
  /** called whenever the filters change (use it to jump back to page 1) */
  onChange?: () => void
}

export function useTableFilters<T>(rows: T[], options: Options = {}): { filtered: T[]; filterBar: ReactNode; active: boolean } {
  const [query, setQuery] = useState('')
  const [selects, setSelects] = useState<Record<string, string>>({})
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const onChangeRef = useRef(options.onChange)
  onChangeRef.current = options.onChange

  // Which dropdowns / which date field this table has — from its own data.
  const { selectDefs, dateKey } = useMemo(() => {
    const sample = rows.slice(0, 200).filter((r) => r && typeof r === 'object') as Record<string, unknown>[]
    const defs: { key: string; values: string[] }[] = []
    if (sample.length > 0) {
      for (const key of SELECT_KEYS) {
        if (!(key in sample[0])) continue
        const distinct = new Set<string>()
        for (const r of rows as unknown as Record<string, unknown>[]) {
          const v = r?.[key]
          if (v !== null && v !== undefined && v !== '' && typeof v !== 'object') distinct.add(String(v))
        }
        if (distinct.size >= 2 && distinct.size <= 30) defs.push({ key, values: Array.from(distinct).sort() })
        if (defs.length >= 3) break
      }
    }
    const dk = sample.length > 0 ? DATE_KEYS.find((k) => k in sample[0] && typeof sample[0][k] === 'string') : undefined
    return { selectDefs: defs, dateKey: dk }
  }, [rows])

  const filtered = useMemo(() => {
    const active = query.trim() || Object.values(selects).some(Boolean) || dateFrom || dateTo
    if (!active) return rows
    return rows.filter((row) => {
      const r = row as unknown as Record<string, unknown>
      for (const [key, value] of Object.entries(selects)) {
        if (value && String(r?.[key]) !== value) return false
      }
      if (dateKey && (dateFrom || dateTo)) {
        const d = String(r?.[dateKey] ?? '').replace('T', ' ').slice(0, 10)
        if (dateFrom && d < dateFrom) return false
        if (dateTo && d > dateTo) return false
      }
      if (query.trim() && !matchesQuery(query, ...flatten(row))) return false
      return true
    })
  }, [rows, query, selects, dateFrom, dateTo, dateKey])

  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    onChangeRef.current?.()
  }, [query, selects, dateFrom, dateTo])

  const active = Boolean(query.trim() || Object.values(selects).some(Boolean) || dateFrom || dateTo)
  const reset = () => { setQuery(''); setSelects({}); setDateFrom(''); setDateTo('') }

  // Always shown once the table has data — even a 2-row table gets its filter bar, so
  // every table looks and behaves the same (a bar that appears only past N rows read as "missing").
  const filterBar: ReactNode = rows.length === 0 && !active ? null : (
    <div data-no-confirm className="flex w-full min-w-[300px] flex-wrap items-center gap-2 border-b border-border bg-secondary/20 px-4 py-2.5 text-right" dir="rtl">
      <div className="relative min-w-[180px] flex-1">
        <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث في الجدول..."
          className="w-full rounded-md border border-input bg-background py-1.5 pl-3 pr-8 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>
      {selectDefs.map((def) => (
        <select
          key={def.key}
          value={selects[def.key] || ''}
          onChange={(e) => setSelects((s) => ({ ...s, [def.key]: e.target.value }))}
          title={KEY_LABELS[def.key] || def.key}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">{KEY_LABELS[def.key] || def.key}: الكل</option>
          {def.values.map((v) => <option key={v} value={v}>{label(v)}</option>)}
        </select>
      ))}
      {dateKey && (
        <>
          <DateInput value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
          <span className="text-xs text-muted-foreground">إلى</span>
          <DateInput value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
        </>
      )}
      {active && (
        <button type="button" onClick={reset} className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
          <X className="h-3 w-3" /> مسح
        </button>
      )}
      <span className="text-xs text-muted-foreground">{filtered.length === rows.length ? `${rows.length} سجل` : `${filtered.length} من ${rows.length}`}</span>
    </div>
  )

  return { filtered, filterBar, active }
}
