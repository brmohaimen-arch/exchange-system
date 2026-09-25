'use client'

import { useEffect, useMemo, useState, FormEvent } from 'react'
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { LineChart as LineChartIcon, Loader2, Trash2, Save } from 'lucide-react'
import { api, Currency, CurrencyPriceLog } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'
import { useConfirm } from '@/components/ConfirmProvider'
import { CurrencyFlag } from '@/components/ui/currency-flag'
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart'
import { DateInput } from '@/components/ui/date-input'
import { NumberInput } from '@/components/ui/number-input'
import { useTableFilters } from '@/components/TableFilters'

function today() {
  return new Date().toISOString().slice(0, 10)
}

const chartConfig: ChartConfig = {
  buyRate: { label: 'سعر الشراء', color: '#2563eb' },
  sellRate: { label: 'سعر البيع', color: '#16a34a' },
}

export default function CurrencyHistoryPage() {
  const { hasPermission } = useAuth()
  const confirmDialog = useConfirm()
  const canEdit = hasPermission('إدارة سجل أسعار العملات')

  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [currency, setCurrency] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [entries, setEntries] = useState<CurrencyPriceLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({ date: today(), buyRate: '', sellRate: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    api.get<Currency[]>('/currencies').then((res) => {
      setCurrencies(res)
      if (!currency && res.length) setCurrency(res.find((c) => c.code !== 'LYD')?.code || res[0].code)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = async () => {
    if (!currency) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ currency })
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      const res = await api.get<CurrencyPriceLog[]>(`/currency_price_log?${params.toString()}`)
      setEntries(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل السجل')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [currency, dateFrom, dateTo])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    const buyRate = parseFloat(form.buyRate)
    const sellRate = parseFloat(form.sellRate)
    if (!currency) { setFormError('اختر عملة أولاً'); return }
    if (!form.date || !(buyRate > 0) || !(sellRate > 0)) {
      setFormError('التاريخ وسعر الشراء وسعر البيع حقول مطلوبة ويجب أن تكون الأسعار أكبر من صفر')
      return
    }
    setSaving(true)
    try {
      await api.post('/currency_price_log', { currency, date: form.date, buy_rate: buyRate, sell_rate: sellRate, notes: form.notes.trim() || null })
      setForm({ date: today(), buyRate: '', sellRate: '', notes: '' })
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذر حفظ السعر')
    } finally {
      setSaving(false)
    }
  }

  const removeEntry = async (row: CurrencyPriceLog) => {
    if (!(await confirmDialog(`هل تريد حذف سعر يوم ${row.date}؟`))) return
    setError('')
    try {
      await api.delete(`/currency_price_log/${row.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف السجل')
    }
  }

  const chartData = useMemo(
    () => [...entries].sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => ({ date: e.date, buyRate: e.buyRate, sellRate: e.sellRate })),
    [entries]
  )
  const sortedEntries = useMemo(() => [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)), [entries])
  const fEntries = useTableFilters(sortedEntries)
  const currencyFlag = (code: string) => currencies.find((c) => c.code === code)?.flag || ''

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><LineChartIcon className="h-6 w-6 text-primary" /> سجل أسعار العملات</h2>
        <p className="text-xs text-muted-foreground mt-1">سجل يومي يُدخل يدوياً لسعر كل عملة — يتيح الرجوع لاحقاً (بعد شهور أو سنة) لمراجعة تغيّر الأسعار يوماً بيوم مع رسم بياني.</p>
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              {currencies.map((c) => <option key={c.code} value={c.code}>{c.nameAr} ({c.code})</option>)}
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
      </div>

      {canEdit && (
        <form onSubmit={submit} className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <CurrencyFlag code={currency} flag={currencyFlag(currency)} />
            <h3 className="text-sm font-semibold text-foreground">تسجيل سعر يوم جديد لـ {currency}</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">التاريخ</label>
              <DateInput value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">سعر الشراء</label>
              <NumberInput step="any" value={form.buyRate} onChange={(e) => setForm({ ...form, buyRate: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">سعر البيع</label>
              <NumberInput step="any" value={form.sellRate} onChange={(e) => setForm({ ...form, sellRate: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          {formError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ السعر
            </button>
          </div>
          <p className="text-xs text-muted-foreground">تسجيل سعر لنفس اليوم مرة أخرى يحدّث القيمة بدلاً من تكرارها.</p>
        </form>
      )}

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">تغيّر السعر عبر الزمن — {currency}</h3>
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-12">جاري التحميل...</p>
        ) : chartData.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">لا توجد بيانات مسجلة لهذه العملة في هذه الفترة بعد</p>
        ) : (
          <ChartContainer config={chartConfig} className="h-72 w-full">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} domain={['auto', 'auto']} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="buyRate" stroke="var(--color-buyRate)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="sellRate" stroke="var(--color-sellRate)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border px-6 py-4 bg-secondary/30">
          <h3 className="text-sm font-semibold text-foreground">سجل الإدخالات</h3>
        </div>
        {fEntries.filterBar}
        {sortedEntries.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">لا توجد إدخالات بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                  <th className="px-4 py-3 font-medium">سعر الشراء</th>
                  <th className="px-4 py-3 font-medium">سعر البيع</th>
                  <th className="px-4 py-3 font-medium">ملاحظات</th>
                  <th className="px-4 py-3 font-medium">بواسطة</th>
                  {canEdit && <th className="px-4 py-3 font-medium">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fEntries.filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-medium">{row.date}</td>
                    <td className="px-4 py-3" dir="ltr">{row.buyRate.toLocaleString()}</td>
                    <td className="px-4 py-3" dir="ltr">{row.sellRate.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.notes || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.enteredBy}</td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <button onClick={() => removeEntry(row)} className="text-muted-foreground hover:text-danger" title="حذف">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
