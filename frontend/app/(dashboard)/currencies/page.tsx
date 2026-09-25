'use client'

import { Suspense, useEffect, useMemo, useState, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Pencil, Edit, Trash2, X, Loader2, Coins, TrendingUp, History } from 'lucide-react'
import { api, newId, Currency, ExchangeRate, RateHistory } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'
import { TablePagination, paginate } from '@/components/TablePagination'
import { useConfirm } from '@/components/ConfirmProvider'
import { CurrencyFlag } from '@/components/ui/currency-flag'
import { NumberInput } from '@/components/ui/number-input'

const tabs = [
  { key: 'currencies', label: 'العملات', icon: Coins },
  { key: 'rates', label: 'أسعار الصرف', icon: TrendingUp },
] as const
type TabKey = typeof tabs[number]['key']

function emptyCurrencyForm() {
  return { code: '', nameAr: '', nameEn: '', symbol: '', country: '', flag: '', decimalPlaces: '2', isActive: true }
}

function emptyRateForm() {
  return { fromCurrency: '', toCurrency: 'LYD', buyRate: '', sellRate: '', minRate: '', maxRate: '' }
}

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ')
}

export default function CurrenciesPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>}>
      <CurrenciesPageInner />
    </Suspense>
  )
}

function CurrenciesPageInner() {
  const { user, hasPermission } = useAuth()
  const confirmDialog = useConfirm()
  const canManageCurrencies = hasPermission('إدارة العملات')
  const canEditRates = hasPermission('تعديل أسعار الصرف')

  const searchParams = useSearchParams()
  const router = useRouter()
  const requestedTab = searchParams.get('tab') as TabKey | null
  const [tab, setTabState] = useState<TabKey>(requestedTab && tabs.some((t) => t.key === requestedTab) ? requestedTab : 'currencies')
  const setTab = (next: TabKey) => {
    setTabState(next)
    router.replace(`/currencies?tab=${next}`, { scroll: false })
  }

  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [history, setHistory] = useState<RateHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const [c, r, h] = await Promise.all([
        api.get<Currency[]>('/currencies'),
        api.get<ExchangeRate[]>('/currencies/rates'),
        api.get<RateHistory[]>('/currencies/rate_histories'),
      ])
      setCurrencies(c)
      setRates(r)
      setHistory(h)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات العملات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ---------------- Currencies tab ----------------
  const [showCurrencyModal, setShowCurrencyModal] = useState(false)
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null)
  const [currencyForm, setCurrencyForm] = useState(emptyCurrencyForm())
  const [savingCurrency, setSavingCurrency] = useState(false)
  const [currencyFormError, setCurrencyFormError] = useState('')

  const openCreateCurrency = () => {
    setEditingCurrency(null)
    setCurrencyForm(emptyCurrencyForm())
    setCurrencyFormError('')
    setShowCurrencyModal(true)
  }

  const openEditCurrency = (c: Currency) => {
    setEditingCurrency(c)
    setCurrencyForm({
      code: c.code, nameAr: c.nameAr, nameEn: c.nameEn, symbol: c.symbol,
      country: c.country, flag: c.flag, decimalPlaces: String(c.decimalPlaces), isActive: c.isActive,
    })
    setCurrencyFormError('')
    setShowCurrencyModal(true)
  }

  const submitCurrency = async (e: FormEvent) => {
    e.preventDefault()
    setCurrencyFormError('')
    if (!currencyForm.code.trim() || !currencyForm.nameAr.trim() || !currencyForm.symbol.trim()) {
      setCurrencyFormError('رمز العملة والاسم والرمز المختصر حقول مطلوبة')
      return
    }
    setSavingCurrency(true)
    const payload = {
      code: currencyForm.code.trim().toUpperCase(),
      nameAr: currencyForm.nameAr.trim(),
      nameEn: currencyForm.nameEn.trim() || currencyForm.nameAr.trim(),
      symbol: currencyForm.symbol.trim(),
      country: currencyForm.country.trim(),
      flag: currencyForm.flag.trim() || '🌐',
      decimalPlaces: parseInt(currencyForm.decimalPlaces) || 2,
      isActive: currencyForm.isActive,
      lastUpdated: nowStamp(),
    }
    try {
      if (editingCurrency) {
        await api.put(`/currencies/${editingCurrency.code}`, payload)
      } else {
        await api.post('/currencies', payload)
      }
      setShowCurrencyModal(false)
      await load()
    } catch (err) {
      setCurrencyFormError(err instanceof ApiError ? err.message : 'تعذر حفظ العملة')
    } finally {
      setSavingCurrency(false)
    }
  }

  const deleteCurrency = async (c: Currency) => {
    if (!(await confirmDialog(`هل تريد حذف عملة ${c.nameAr}؟`, { requireTypedWord: true }))) return
    try {
      await api.delete(`/currencies/${c.code}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف العملة')
    }
  }

  // ---------------- Rates tab ----------------
  const [showRateModal, setShowRateModal] = useState(false)
  const [editingRate, setEditingRate] = useState<ExchangeRate | null>(null)
  const [rateForm, setRateForm] = useState(emptyRateForm())
  const [savingRate, setSavingRate] = useState(false)
  const [rateFormError, setRateFormError] = useState('')

  const [ratesPage, setRatesPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)

  const pagedRates = paginate(rates, ratesPage)
  const sortedHistory = useMemo(() => [...history].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)), [history])
  const pagedHistory = paginate(sortedHistory, historyPage)

  const currencyName = (code: string) => {
    const c = currencies.find((x) => x.code === code)
    return c ? `${c.nameAr} (${c.code})` : code
  }

  const openCreateRate = () => {
    setEditingRate(null)
    setRateForm(emptyRateForm())
    setRateFormError('')
    setShowRateModal(true)
  }

  const openEditRate = (r: ExchangeRate) => {
    setEditingRate(r)
    setRateForm({
      fromCurrency: r.fromCurrency, toCurrency: r.toCurrency,
      buyRate: String(r.buyRate), sellRate: String(r.sellRate),
      minRate: String(r.minRate), maxRate: String(r.maxRate),
    })
    setRateFormError('')
    setShowRateModal(true)
  }

  const deleteRate = async (r: ExchangeRate) => {
    if (!(await confirmDialog(`هل تريد حذف سعر صرف ${r.fromCurrency}/${r.toCurrency} نهائياً؟`))) return
    try {
      await api.delete(`/currencies/rates/${r.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف سعر الصرف')
    }
  }

  const submitRate = async (e: FormEvent) => {
    e.preventDefault()
    setRateFormError('')
    const buy = parseFloat(rateForm.buyRate)
    const sell = parseFloat(rateForm.sellRate)
    if (!rateForm.fromCurrency || !buy || !sell) {
      setRateFormError('العملة وسعري الشراء والبيع مطلوبة')
      return
    }
    setSavingRate(true)
    const payload = {
      id: editingRate?.id || newId(`rate_${rateForm.fromCurrency.toLowerCase()}_${rateForm.toCurrency.toLowerCase()}`),
      fromCurrency: rateForm.fromCurrency,
      toCurrency: rateForm.toCurrency,
      buyRate: buy,
      sellRate: sell,
      minRate: parseFloat(rateForm.minRate) || 0,
      maxRate: parseFloat(rateForm.maxRate) || sell * 1.5,
      validFrom: editingRate?.validFrom || nowStamp(),
      validTo: editingRate?.validTo || nowStamp(),
      isActive: true,
      lastUpdated: nowStamp(),
      updatedBy: user?.name || '',
    }
    try {
      if (editingRate) {
        await api.put(`/currencies/rates/${editingRate.id}`, payload)
      } else {
        await api.post('/currencies/rates', payload)
      }
      setShowRateModal(false)
      await load()
    } catch (err) {
      setRateFormError(err instanceof ApiError ? err.message : 'تعذر حفظ سعر الصرف')
    } finally {
      setSavingRate(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">العملات وأسعار الصرف</h2>
        <div className="flex items-center gap-2">
          {tab === 'currencies' && canManageCurrencies && (
            <button onClick={openCreateCurrency} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus className="h-4 w-4" /> إضافة عملة جديدة
            </button>
          )}
          {tab === 'rates' && canEditRates && (
            <button onClick={openCreateRate} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus className="h-4 w-4" /> إضافة سعر جديد
            </button>
          )}
        </div>
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

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

      {tab === 'currencies' && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <p className="text-muted-foreground text-sm">جاري التحميل...</p>
          ) : currencies.length === 0 ? (
            <p className="text-muted-foreground text-sm">لا توجد عملات مسجلة</p>
          ) : currencies.map((c) => (
            <div key={c.code} className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary text-lg">
                    {c.flag ? <CurrencyFlag code={c.code} flag={c.flag} className="h-6 w-8" /> : <Coins className="h-5 w-5" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{c.nameAr} ({c.code})</h3>
                    <span className="text-xs text-muted-foreground">{c.country}</span>
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                  ${c.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                  {c.isActive ? 'نشطة' : 'غير نشطة'}
                </span>
              </div>
              <div className="pt-4 space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">الرمز</span>
                  <span className="font-bold text-foreground">{c.symbol}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">الاسم بالإنجليزية</span>
                  <span className="font-medium text-foreground">{c.nameEn}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">الخانات العشرية</span>
                  <span className="font-medium text-foreground">{c.decimalPlaces}</span>
                </div>
              </div>
              {canManageCurrencies && (
                <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                  <button onClick={() => openEditCurrency(c)} className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors text-xs font-medium">
                    <Pencil className="h-3.5 w-3.5" />
                    تعديل
                  </button>
                  <button onClick={() => deleteCurrency(c)} className="flex items-center gap-1 text-danger hover:text-danger/80 transition-colors text-xs font-medium">
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'rates' && (
        <>
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">العملة</th>
                    <th className="px-6 py-4 font-medium">سعر الشراء</th>
                    <th className="px-6 py-4 font-medium">سعر البيع</th>
                    <th className="px-6 py-4 font-medium">النطاق المسموح</th>
                    <th className="px-6 py-4 font-medium">الحالة</th>
                    <th className="px-6 py-4 font-medium">آخر تحديث</th>
                    {canEditRates && <th className="px-6 py-4 font-medium">إجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">جاري التحميل...</td></tr>
                  ) : rates.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">لا توجد أسعار صرف مسجلة</td></tr>
                  ) : pagedRates.map((rate) => (
                    <tr key={rate.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">
                        {currencyName(rate.fromCurrency)} / {rate.toCurrency}
                      </td>
                      <td className="px-6 py-4 text-success font-medium">{rate.buyRate}</td>
                      <td className="px-6 py-4 text-danger font-medium">{rate.sellRate}</td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">{rate.minRate} - {rate.maxRate}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                          ${rate.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                          {rate.isActive ? 'نشط' : 'غير نشط'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{rate.lastUpdated}</td>
                      {canEditRates && (
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditRate(rate)} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
                              <Edit className="h-3.5 w-3.5" /> تعديل
                            </button>
                            <button onClick={() => deleteRate(rate)} className="flex items-center gap-1.5 rounded-md border border-danger/30 px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" /> حذف
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={ratesPage} totalItems={rates.length} onPageChange={setRatesPage} />
          </div>

          {/* Rate change history */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4 bg-secondary/30 flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">سجل تغييرات الأسعار</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">الزوج</th>
                    <th className="px-6 py-4 font-medium">الشراء (قبل ← بعد)</th>
                    <th className="px-6 py-4 font-medium">البيع (قبل ← بعد)</th>
                    <th className="px-6 py-4 font-medium">بواسطة</th>
                    <th className="px-6 py-4 font-medium">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">لا توجد تغييرات مسجلة بعد</td></tr>
                  ) : pagedHistory.map((h) => (
                    <tr key={h.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground" dir="ltr">{h.pair}</td>
                      <td className="px-6 py-4">
                        <span className={h.newBuy > h.oldBuy ? 'text-success' : h.newBuy < h.oldBuy ? 'text-danger' : ''}>
                          {h.oldBuy} ← {h.newBuy}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={h.newSell > h.oldSell ? 'text-success' : h.newSell < h.oldSell ? 'text-danger' : ''}>
                          {h.oldSell} ← {h.newSell}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{h.user}</td>
                      <td className="px-6 py-4 text-muted-foreground">{h.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={historyPage} totalItems={sortedHistory.length} onPageChange={setHistoryPage} />
          </div>
        </>
      )}

      {showCurrencyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editingCurrency ? 'تعديل العملة' : 'إضافة عملة جديدة'}</h3>
              <button onClick={() => setShowCurrencyModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitCurrency} className="space-y-4 p-6 text-right">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رمز العملة (ISO) *</label>
                  <input
                    value={currencyForm.code}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, code: e.target.value })}
                    disabled={!!editingCurrency}
                    placeholder="USD"
                    dir="ltr"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-muted"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الرمز المختصر *</label>
                  <input
                    value={currencyForm.symbol}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, symbol: e.target.value })}
                    placeholder="$"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الاسم بالعربية *</label>
                  <input
                    value={currencyForm.nameAr}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, nameAr: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الاسم بالإنجليزية</label>
                  <input
                    value={currencyForm.nameEn}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, nameEn: e.target.value })}
                    dir="ltr"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الدولة</label>
                  <input
                    value={currencyForm.country}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, country: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">العلم (إيموجي)</label>
                  <input
                    value={currencyForm.flag}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, flag: e.target.value })}
                    placeholder="🇺🇸"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الخانات العشرية</label>
                  <NumberInput
                    min={0}
                    max={4}
                    value={currencyForm.decimalPlaces}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, decimalPlaces: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={currencyForm.isActive}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                عملة نشطة
              </label>

              {currencyFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{currencyFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCurrencyModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingCurrency}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {savingCurrency && <Loader2 className="h-4 w-4 animate-spin" />}
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editingRate ? 'تعديل سعر الصرف' : 'إضافة سعر صرف جديد'}</h3>
              <button onClick={() => setShowRateModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitRate} className="space-y-4 p-6 text-right">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">من عملة *</label>
                  <select
                    value={rateForm.fromCurrency}
                    onChange={(e) => setRateForm({ ...rateForm, fromCurrency: e.target.value })}
                    disabled={!!editingRate}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-muted"
                  >
                    <option value="">اختر عملة</option>
                    {currencies.filter((c) => c.code !== 'LYD').map((c) => (
                      <option key={c.code} value={c.code}>{c.nameAr} ({c.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">إلى عملة</label>
                  <input value={rateForm.toCurrency} disabled dir="ltr" className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-right" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">سعر الشراء *</label>
                  <NumberInput
                    step="0.001"
                    value={rateForm.buyRate}
                    onChange={(e) => setRateForm({ ...rateForm, buyRate: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">سعر البيع *</label>
                  <NumberInput
                    step="0.001"
                    value={rateForm.sellRate}
                    onChange={(e) => setRateForm({ ...rateForm, sellRate: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الحد الأدنى المسموح</label>
                  <NumberInput
                    step="0.001"
                    value={rateForm.minRate}
                    onChange={(e) => setRateForm({ ...rateForm, minRate: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الحد الأقصى المسموح</label>
                  <NumberInput
                    step="0.001"
                    value={rateForm.maxRate}
                    onChange={(e) => setRateForm({ ...rateForm, maxRate: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              {rateFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{rateFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRateModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingRate}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {savingRate && <Loader2 className="h-4 w-4 animate-spin" />}
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
