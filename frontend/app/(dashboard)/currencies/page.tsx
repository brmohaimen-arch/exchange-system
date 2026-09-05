'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Plus, Pencil, Trash2, X, Loader2, Coins } from 'lucide-react'
import { api, Currency } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'

function emptyForm() {
  return { code: '', nameAr: '', nameEn: '', symbol: '', country: '', flag: '', decimalPlaces: '2', isActive: true }
}

export default function CurrenciesPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('إدارة العملات')

  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Currency | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = async () => {
    try {
      const data = await api.get<Currency[]>('/currencies')
      setCurrencies(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل العملات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (c: Currency) => {
    setEditing(c)
    setForm({
      code: c.code, nameAr: c.nameAr, nameEn: c.nameEn, symbol: c.symbol,
      country: c.country, flag: c.flag, decimalPlaces: String(c.decimalPlaces), isActive: c.isActive,
    })
    setFormError('')
    setShowModal(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!form.code.trim() || !form.nameAr.trim() || !form.symbol.trim()) {
      setFormError('رمز العملة والاسم والرمز المختصر حقول مطلوبة')
      return
    }
    setSaving(true)
    const payload = {
      code: form.code.trim().toUpperCase(),
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim() || form.nameAr.trim(),
      symbol: form.symbol.trim(),
      country: form.country.trim(),
      flag: form.flag.trim() || '🌐',
      decimalPlaces: parseInt(form.decimalPlaces) || 2,
      isActive: form.isActive,
      lastUpdated: new Date().toISOString().slice(0, 16).replace('T', ' '),
    }
    try {
      if (editing) {
        await api.put(`/currencies/${editing.code}`, payload)
      } else {
        await api.post('/currencies', payload)
      }
      setShowModal(false)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذر حفظ العملة')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: Currency) => {
    if (!confirm(`هل تريد حذف عملة ${c.nameAr}؟`)) return
    try {
      await api.delete(`/currencies/${c.code}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف العملة')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">العملات</h2>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            إضافة عملة جديدة
          </button>
        )}
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

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
                  {c.flag || <Coins className="h-5 w-5" />}
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
            {canManage && (
              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                <button onClick={() => openEdit(c)} className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors text-xs font-medium">
                  <Pencil className="h-3.5 w-3.5" />
                  تعديل
                </button>
                <button onClick={() => handleDelete(c)} className="flex items-center gap-1 text-danger hover:text-danger/80 transition-colors text-xs font-medium">
                  <Trash2 className="h-3.5 w-3.5" />
                  حذف
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editing ? 'تعديل العملة' : 'إضافة عملة جديدة'}</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-6 text-right">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رمز العملة (ISO) *</label>
                  <input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    disabled={!!editing}
                    placeholder="USD"
                    dir="ltr"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-muted"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الرمز المختصر *</label>
                  <input
                    value={form.symbol}
                    onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                    placeholder="$"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الاسم بالعربية *</label>
                  <input
                    value={form.nameAr}
                    onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الاسم بالإنجليزية</label>
                  <input
                    value={form.nameEn}
                    onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                    dir="ltr"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الدولة</label>
                  <input
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">العلم (إيموجي)</label>
                  <input
                    value={form.flag}
                    onChange={(e) => setForm({ ...form, flag: e.target.value })}
                    placeholder="🇺🇸"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الخانات العشرية</label>
                  <input
                    type="number"
                    min={0}
                    max={4}
                    value={form.decimalPlaces}
                    onChange={(e) => setForm({ ...form, decimalPlaces: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                عملة نشطة
              </label>

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
