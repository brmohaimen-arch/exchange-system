'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Plus, Edit, X, Loader2, History } from 'lucide-react'
import { api, newId, Currency, ExchangeRate, RateHistory } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'

function emptyForm() {
  return { fromCurrency: '', toCurrency: 'LYD', buyRate: '', sellRate: '', minRate: '', maxRate: '' }
}

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ')
}

export default function ExchangeRatesPage() {
  const { user, hasPermission } = useAuth()
  const canEdit = hasPermission('تعديل أسعار الصرف')

  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [history, setHistory] = useState<RateHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ExchangeRate | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = async () => {
    try {
      const [r, c, h] = await Promise.all([
        api.get<ExchangeRate[]>('/currencies/rates'),
        api.get<Currency[]>('/currencies'),
        api.get<RateHistory[]>('/currencies/rate_histories'),
      ])
      setRates(r)
      setCurrencies(c)
      setHistory(h)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل أسعار الصرف')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const currencyName = (code: string) => {
    const c = currencies.find((x) => x.code === code)
    return c ? `${c.nameAr} (${c.code})` : code
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (r: ExchangeRate) => {
    setEditing(r)
    setForm({
      fromCurrency: r.fromCurrency, toCurrency: r.toCurrency,
      buyRate: String(r.buyRate), sellRate: String(r.sellRate),
      minRate: String(r.minRate), maxRate: String(r.maxRate),
    })
    setFormError('')
    setShowModal(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    const buy = parseFloat(form.buyRate)
    const sell = parseFloat(form.sellRate)
    if (!form.fromCurrency || !buy || !sell) {
      setFormError('العملة وسعري الشراء والبيع مطلوبة')
      return
    }
    setSaving(true)
    const payload = {
      id: editing?.id || newId(`rate_${form.fromCurrency.toLowerCase()}_${form.toCurrency.toLowerCase()}`),
      fromCurrency: form.fromCurrency,
      toCurrency: form.toCurrency,
      buyRate: buy,
      sellRate: sell,
      minRate: parseFloat(form.minRate) || 0,
      maxRate: parseFloat(form.maxRate) || sell * 1.5,
      validFrom: editing?.validFrom || nowStamp(),
      validTo: editing?.validTo || nowStamp(),
      isActive: true,
      lastUpdated: nowStamp(),
      updatedBy: user?.name || '',
    }
    try {
      if (editing) {
        await api.put(`/currencies/rates/${editing.id}`, payload)
      } else {
        await api.post('/currencies/rates', payload)
      }
      setShowModal(false)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذر حفظ سعر الصرف')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">أسعار الصرف</h2>
        {canEdit && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            إضافة سعر جديد
          </button>
        )}
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

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
                {canEdit && <th className="px-6 py-4 font-medium">إجراءات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">جاري التحميل...</td></tr>
              ) : rates.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">لا توجد أسعار صرف مسجلة</td></tr>
              ) : rates.map((rate) => (
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
                  {canEdit && (
                    <td className="px-6 py-4">
                      <button onClick={() => openEdit(rate)} className="text-primary hover:text-primary/80 transition-colors p-1">
                        <Edit className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              ) : history.slice(0, 100).map((h) => (
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
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editing ? 'تعديل سعر الصرف' : 'إضافة سعر صرف جديد'}</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-6 text-right">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">من عملة *</label>
                  <select
                    value={form.fromCurrency}
                    onChange={(e) => setForm({ ...form, fromCurrency: e.target.value })}
                    disabled={!!editing}
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
                  <input value={form.toCurrency} disabled dir="ltr" className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-right" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">سعر الشراء *</label>
                  <input
                    type="number" step="0.001"
                    value={form.buyRate}
                    onChange={(e) => setForm({ ...form, buyRate: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">سعر البيع *</label>
                  <input
                    type="number" step="0.001"
                    value={form.sellRate}
                    onChange={(e) => setForm({ ...form, sellRate: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الحد الأدنى المسموح</label>
                  <input
                    type="number" step="0.001"
                    value={form.minRate}
                    onChange={(e) => setForm({ ...form, minRate: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الحد الأقصى المسموح</label>
                  <input
                    type="number" step="0.001"
                    value={form.maxRate}
                    onChange={(e) => setForm({ ...form, maxRate: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              {formError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
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
