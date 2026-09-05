'use client'

import { useEffect, useMemo, useState, FormEvent } from 'react'
import { ArrowRightLeft, DollarSign, Repeat, Loader2, Lock, Clock, PlayCircle, X } from 'lucide-react'
import { api, newId, Currency, Customer, ExchangeRate, Vault, Transaction, Shift } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'

const paymentMethodLabels: Record<string, string> = {
  cash: 'نقداً', customer_account: 'حساب العميل', bank_account: 'حساب بنكي', debt: 'دين (آجل)',
}
const typeLabel: Record<string, string> = { buy: 'شراء', sell: 'بيع', exchange: 'تبديل' }
const statusLabel: Record<string, { label: string; className: string }> = {
  approved: { label: 'مكتمل', className: 'bg-success/10 text-success' },
  pending: { label: 'قيد المعالجة', className: 'bg-warning/10 text-warning' },
  reversed: { label: 'ملغي', className: 'bg-danger/10 text-danger' },
}

interface OpForm {
  customerId: string
  currency: string
  amount: string
  rate: string
  commission: string
  paymentMethod: string
}

interface ExchangeForm {
  customerId: string
  fromCurrency: string
  toCurrency: string
  amount: string
  rate: string
  commission: string
  paymentMethod: string
}

function emptyOpForm(rate = ''): OpForm {
  return { customerId: '', currency: '', amount: '', rate, commission: '0', paymentMethod: 'cash' }
}

function emptyExchangeForm(): ExchangeForm {
  return { customerId: '', fromCurrency: '', toCurrency: '', amount: '', rate: '', commission: '0', paymentMethod: 'cash' }
}

export default function TransactionsPage() {
  const { user, hasPermission } = useAuth()
  const canBuy = hasPermission('تنفيذ شراء عملة')
  const canSell = hasPermission('تنفيذ بيع عملة')

  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [vaults, setVaults] = useState<Vault[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [openingShift, setOpeningShift] = useState(false)
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false)
  const [closeBalances, setCloseBalances] = useState<Record<string, string>>({})
  const [closingShift, setClosingShift] = useState(false)
  const [closeError, setCloseError] = useState('')

  const [buyForm, setBuyForm] = useState<OpForm>(emptyOpForm())
  const [sellForm, setSellForm] = useState<OpForm>(emptyOpForm())
  const [exchangeForm, setExchangeForm] = useState<ExchangeForm>(emptyExchangeForm())
  const [buySaving, setBuySaving] = useState(false)
  const [sellSaving, setSellSaving] = useState(false)
  const [exchangeSaving, setExchangeSaving] = useState(false)
  const [buyError, setBuyError] = useState('')
  const [sellError, setSellError] = useState('')
  const [exchangeError, setExchangeError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const load = async () => {
    try {
      const [c, cust, r, v, tx, sh] = await Promise.all([
        api.get<Currency[]>('/currencies'),
        api.get<Customer[]>('/customers'),
        api.get<ExchangeRate[]>('/currencies/rates'),
        api.get<Vault[]>('/vaults'),
        api.get<Transaction[]>('/transactions'),
        api.get<Shift[]>('/shifts'),
      ])
      setCurrencies(c.filter((x) => x.code !== 'LYD' && x.isActive))
      setCustomers(cust)
      setRates(r)
      setVaults(v)
      setTransactions(tx)
      setShifts(sh)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات العمليات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const vault = useMemo(
    () => vaults.find((v) => v.id === user?.allowedVaultId) || vaults[0],
    [vaults, user]
  )

  const myShift = shifts.find((s) => s.vaultId === vault?.id && s.status === 'open')
  const pendingShift = shifts.find((s) => s.vaultId === vault?.id && s.status === 'pending_open')
  const requiresShift = canBuy || canSell

  const startShift = async () => {
    if (!vault) return
    setOpeningShift(true)
    setError('')
    try {
      await api.post('/shifts/open', {
        id: newId('shift'),
        cashier: user?.name || '',
        branch: vault.branch,
        vault_id: vault.id,
        vault_name: vault.name,
        opening_balances: vault.balances,
        notes: null,
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر فتح الوردية')
    } finally {
      setOpeningShift(false)
    }
  }

  const openCloseShiftModal = () => {
    if (!vault) return
    const initial: Record<string, string> = {}
    Object.keys(vault.balances).forEach((ccy) => { initial[ccy] = String(vault.balances[ccy] ?? 0) })
    setCloseBalances(initial)
    setCloseError('')
    setShowCloseShiftModal(true)
  }

  const submitCloseShift = async (e: FormEvent) => {
    e.preventDefault()
    if (!myShift) return
    setCloseError('')
    setClosingShift(true)
    const actualBalances: Record<string, number> = {}
    Object.entries(closeBalances).forEach(([ccy, val]) => { actualBalances[ccy] = parseFloat(val) || 0 })
    try {
      await api.post(`/shifts/${myShift.id}/close`, {
        actual_balances: actualBalances,
        notes: null,
        denomination_breakdown: {},
      })
      setShowCloseShiftModal(false)
      await load()
    } catch (err) {
      setCloseError(err instanceof ApiError ? err.message : 'تعذر إقفال الوردية')
    } finally {
      setClosingShift(false)
    }
  }

  const rateFor = (currency: string) => rates.find((r) => r.fromCurrency === currency && r.toCurrency === 'LYD')

  const onCurrencyChange = (form: OpForm, setForm: (f: OpForm) => void, currency: string, field: 'buyRate' | 'sellRate') => {
    const standing = rateFor(currency)
    setForm({ ...form, currency, rate: standing ? String(standing[field]) : '' })
  }

  // Suggested cross-rate for a from→to swap that doesn't pass through LYD:
  // the office buys `from` at its buy rate and effectively sells `to` at its sell rate.
  const suggestExchangeRate = (from: string, to: string) => {
    const fromRate = rateFor(from)
    const toRate = rateFor(to)
    if (!fromRate || !toRate || !toRate.sellRate) return ''
    return (fromRate.buyRate / toRate.sellRate).toFixed(4)
  }

  const onExchangeCurrencyChange = (patch: Partial<ExchangeForm>) => {
    const next = { ...exchangeForm, ...patch }
    if (next.fromCurrency && next.toCurrency && next.fromCurrency !== next.toCurrency) {
      next.rate = suggestExchangeRate(next.fromCurrency, next.toCurrency)
    }
    setExchangeForm(next)
  }

  const total = (form: OpForm) => (parseFloat(form.amount) || 0) * (parseFloat(form.rate) || 0)
  const exchangeTotal = (parseFloat(exchangeForm.amount) || 0) * (parseFloat(exchangeForm.rate) || 0)

  const submitOp = async (
    type: 'buy' | 'sell',
    form: OpForm,
    setSaving: (b: boolean) => void,
    setFormError: (s: string) => void,
  ) => {
    setFormError('')
    setSuccessMsg('')
    const amount = parseFloat(form.amount)
    const rate = parseFloat(form.rate)
    if (!vault) { setFormError('لا توجد خزنة متاحة لهذا المستخدم'); return }
    if (!form.customerId) { setFormError('اختر عميلاً'); return }
    if (!form.currency) { setFormError('اختر عملة'); return }
    if (!amount || amount <= 0) { setFormError('أدخل مبلغاً صحيحاً'); return }
    if (!rate || rate <= 0) { setFormError('السعر غير صالح'); return }

    setSaving(true)
    try {
      const isBuy = type === 'buy'
      await api.post('/exchange/pos', {
        type,
        vaultId: vault.id,
        customerId: form.customerId,
        fromCurrency: isBuy ? form.currency : 'LYD',
        toCurrency: isBuy ? 'LYD' : form.currency,
        amount,
        rate,
        commission: parseFloat(form.commission) || 0,
        paymentMethod: form.paymentMethod,
        id: newId('tx'),
      })
      setSuccessMsg(`تم تنفيذ عملية ${isBuy ? 'الشراء' : 'البيع'} بنجاح`)
      if (isBuy) setBuyForm(emptyOpForm()); else setSellForm(emptyOpForm())
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذر تنفيذ العملية')
    } finally {
      setSaving(false)
    }
  }

  const submitExchange = async (e: FormEvent) => {
    e.preventDefault()
    setExchangeError('')
    setSuccessMsg('')
    const amount = parseFloat(exchangeForm.amount)
    const rate = parseFloat(exchangeForm.rate)
    if (!vault) { setExchangeError('لا توجد خزنة متاحة لهذا المستخدم'); return }
    if (!exchangeForm.customerId) { setExchangeError('اختر عميلاً'); return }
    if (!exchangeForm.fromCurrency || !exchangeForm.toCurrency) { setExchangeError('اختر عملتي التبديل'); return }
    if (exchangeForm.fromCurrency === exchangeForm.toCurrency) { setExchangeError('يجب أن تكون العملتان مختلفتين'); return }
    if (!amount || amount <= 0) { setExchangeError('أدخل مبلغاً صحيحاً'); return }
    if (!rate || rate <= 0) { setExchangeError('السعر غير صالح'); return }

    setExchangeSaving(true)
    try {
      await api.post('/exchange/pos', {
        type: 'exchange',
        vaultId: vault.id,
        customerId: exchangeForm.customerId,
        fromCurrency: exchangeForm.fromCurrency,
        toCurrency: exchangeForm.toCurrency,
        amount,
        rate,
        commission: parseFloat(exchangeForm.commission) || 0,
        paymentMethod: exchangeForm.paymentMethod,
        id: newId('tx'),
      })
      setSuccessMsg('تم تنفيذ عملية تبديل العملة بنجاح')
      setExchangeForm(emptyExchangeForm())
      await load()
    } catch (err) {
      setExchangeError(err instanceof ApiError ? err.message : 'تعذر تنفيذ عملية التبديل')
    } finally {
      setExchangeSaving(false)
    }
  }

  const recent = [...transactions].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">العمليات (بيع وشراء وتبديل)</h2>
        {vault && <span className="text-sm text-muted-foreground">الخزنة النشطة: {vault.name}</span>}
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}
      {successMsg && <p className="rounded-md bg-success/10 px-4 py-2 text-sm text-success">{successMsg}</p>}

      {/* Shift status bar — only relevant once there is an open shift to close */}
      {requiresShift && vault && myShift && (
        <div className="flex items-center justify-between rounded-xl border border-success/30 bg-success/5 px-6 py-3">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Clock className="h-4 w-4 text-success" />
            الوردية مفتوحة منذ {myShift.startTime}
          </div>
          <button
            onClick={openCloseShiftModal}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            <Lock className="h-3.5 w-3.5" /> إنهاء الوردية
          </button>
        </div>
      )}

      {requiresShift && vault && !myShift && pendingShift ? (
        /* Requested but not yet accepted by a manager */
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-info/30 bg-info/5 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-info/10 text-info">
            <Clock className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">طلب فتح الوردية بانتظار موافقة المدير</h3>
            <p className="text-sm text-muted-foreground mt-1">تم إرسال الطلب الساعة {pendingShift.requestedAt} — لا يمكنك تنفيذ عمليات حتى تتم الموافقة</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            تحديث الحالة
          </button>
        </div>
      ) : requiresShift && vault && !myShift ? (
        /* Cashier "start of session" gate: no operations until a shift is requested and approved */
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-warning/30 bg-warning/5 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
            <Lock className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">لا توجد وردية مفتوحة على {vault.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">يجب طلب فتح وردية جديدة وموافقة المدير عليها قبل تنفيذ أي عملية بيع أو شراء أو تبديل</p>
          </div>
          <button
            onClick={startShift}
            disabled={openingShift}
            className="flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {openingShift ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            طلب فتح الوردية
          </button>
        </div>
      ) : (
      <>
      <div className="grid gap-6 md:grid-cols-2">
        {/* Buy Form */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="rounded-full bg-success/10 p-2 text-success">
              <DollarSign className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">شراء عملة من العميل</h3>
          </div>

          <form
            className="space-y-4 text-right"
            onSubmit={(e: FormEvent) => { e.preventDefault(); submitOp('buy', buyForm, setBuySaving, setBuyError) }}
          >
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">العميل</label>
              <select
                value={buyForm.customerId}
                onChange={(e) => setBuyForm({ ...buyForm, customerId: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">اختر عميلاً</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} (رقم: {c.id})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
                <select
                  value={buyForm.currency}
                  onChange={(e) => onCurrencyChange(buyForm, setBuyForm, e.target.value, 'buyRate')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">اختر</option>
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} - {c.nameAr}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">المبلغ (أجنبي)</label>
                <input
                  type="number" placeholder="1000"
                  value={buyForm.amount}
                  onChange={(e) => setBuyForm({ ...buyForm, amount: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">سعر الشراء المطبق</label>
                <input
                  type="number" step="0.001"
                  value={buyForm.rate}
                  onChange={(e) => setBuyForm({ ...buyForm, rate: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">طريقة الدفع</label>
                <select
                  value={buyForm.paymentMethod}
                  onChange={(e) => setBuyForm({ ...buyForm, paymentMethod: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {Object.entries(paymentMethodLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>

            {buyError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{buyError}</p>}

            <div className="pt-4 border-t border-border flex justify-between items-center">
              <span className="font-bold text-foreground text-lg">الإجمالي (د.ل): {total(buyForm).toLocaleString()}</span>
              <button
                type="submit"
                disabled={buySaving || !canBuy}
                title={!canBuy ? 'لا تملك صلاحية تنفيذ شراء عملة' : undefined}
                className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {buySaving && <Loader2 className="h-4 w-4 animate-spin" />}
                تنفيذ الشراء
              </button>
            </div>
          </form>
        </div>

        {/* Sell Form */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="rounded-full bg-danger/10 p-2 text-danger">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">بيع عملة للعميل</h3>
          </div>

          <form
            className="space-y-4 text-right"
            onSubmit={(e: FormEvent) => { e.preventDefault(); submitOp('sell', sellForm, setSellSaving, setSellError) }}
          >
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">العميل</label>
              <select
                value={sellForm.customerId}
                onChange={(e) => setSellForm({ ...sellForm, customerId: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">اختر عميلاً</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} (رقم: {c.id})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
                <select
                  value={sellForm.currency}
                  onChange={(e) => onCurrencyChange(sellForm, setSellForm, e.target.value, 'sellRate')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">اختر</option>
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} - {c.nameAr}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">المبلغ (أجنبي)</label>
                <input
                  type="number" placeholder="500"
                  value={sellForm.amount}
                  onChange={(e) => setSellForm({ ...sellForm, amount: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">سعر البيع المطبق</label>
                <input
                  type="number" step="0.001"
                  value={sellForm.rate}
                  onChange={(e) => setSellForm({ ...sellForm, rate: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">طريقة الدفع</label>
                <select
                  value={sellForm.paymentMethod}
                  onChange={(e) => setSellForm({ ...sellForm, paymentMethod: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {Object.entries(paymentMethodLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>

            {sellError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{sellError}</p>}

            <div className="pt-4 border-t border-border flex justify-between items-center">
              <span className="font-bold text-foreground text-lg">الإجمالي (د.ل): {total(sellForm).toLocaleString()}</span>
              <button
                type="submit"
                disabled={sellSaving || !canSell}
                title={!canSell ? 'لا تملك صلاحية تنفيذ بيع عملة' : undefined}
                className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {sellSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                تنفيذ البيع
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Exchange (currency-to-currency swap) Form */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="rounded-full bg-info/10 p-2 text-info">
            <Repeat className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">تبديل عملة بعملة أخرى</h3>
        </div>

        <form onSubmit={submitExchange} className="space-y-4 text-right">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">العميل</label>
              <select
                value={exchangeForm.customerId}
                onChange={(e) => setExchangeForm({ ...exchangeForm, customerId: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">اختر عميلاً</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} (رقم: {c.id})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">من عملة (يدفعها العميل)</label>
                <select
                  value={exchangeForm.fromCurrency}
                  onChange={(e) => onExchangeCurrencyChange({ fromCurrency: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">اختر</option>
                  {[...currencies, { code: 'LYD', nameAr: 'دينار ليبي' } as Currency].map((c) => (
                    <option key={c.code} value={c.code} disabled={c.code === exchangeForm.toCurrency}>{c.code} - {c.nameAr}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">إلى عملة (يستلمها العميل)</label>
                <select
                  value={exchangeForm.toCurrency}
                  onChange={(e) => onExchangeCurrencyChange({ toCurrency: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">اختر</option>
                  {[...currencies, { code: 'LYD', nameAr: 'دينار ليبي' } as Currency].map((c) => (
                    <option key={c.code} value={c.code} disabled={c.code === exchangeForm.fromCurrency}>{c.code} - {c.nameAr}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">المبلغ (من العملة الأولى)</label>
              <input
                type="number" placeholder="100"
                value={exchangeForm.amount}
                onChange={(e) => setExchangeForm({ ...exchangeForm, amount: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">سعر التبديل المطبق</label>
              <input
                type="number" step="0.0001"
                value={exchangeForm.rate}
                onChange={(e) => setExchangeForm({ ...exchangeForm, rate: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">طريقة الدفع</label>
              <select
                value={exchangeForm.paymentMethod}
                onChange={(e) => setExchangeForm({ ...exchangeForm, paymentMethod: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {Object.entries(paymentMethodLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          {exchangeError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{exchangeError}</p>}

          <div className="pt-4 border-t border-border flex justify-between items-center">
            <span className="font-bold text-foreground text-lg">
              يستلم العميل: {exchangeTotal.toLocaleString()} {exchangeForm.toCurrency || ''}
            </span>
            <button
              type="submit"
              disabled={exchangeSaving}
              className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {exchangeSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              تنفيذ التبديل
            </button>
          </div>
        </form>
      </div>
      </>
      )}

      {/* History */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border px-6 py-4 bg-secondary/30">
          <h3 className="text-lg font-semibold text-foreground">آخر العمليات</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">رقم العملية</th>
                <th className="px-6 py-4 font-medium">النوع</th>
                <th className="px-6 py-4 font-medium">العميل</th>
                <th className="px-6 py-4 font-medium">الخزنة</th>
                <th className="px-6 py-4 font-medium">المبلغ</th>
                <th className="px-6 py-4 font-medium">السعر</th>
                <th className="px-6 py-4 font-medium">الإجمالي</th>
                <th className="px-6 py-4 font-medium">طريقة الدفع</th>
                <th className="px-6 py-4 font-medium">الحالة</th>
                <th className="px-6 py-4 font-medium">بواسطة</th>
                <th className="px-6 py-4 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={11} className="px-6 py-10 text-center text-muted-foreground">جاري التحميل...</td></tr>
              ) : recent.length === 0 ? (
                <tr><td colSpan={11} className="px-6 py-10 text-center text-muted-foreground">لا توجد عمليات بعد</td></tr>
              ) : recent.map((tx) => {
                const st = statusLabel[tx.status] || statusLabel.approved
                return (
                  <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{tx.id}</td>
                    <td className="px-6 py-4">{typeLabel[tx.type] || tx.type}</td>
                    <td className="px-6 py-4">{tx.customerName || '—'}</td>
                    <td className="px-6 py-4 text-muted-foreground">{tx.vaultName}</td>
                    <td className="px-6 py-4">{tx.amount.toLocaleString()} {tx.type === 'sell' ? tx.toCurrency : tx.fromCurrency}</td>
                    <td className="px-6 py-4">{tx.rate}</td>
                    <td className="px-6 py-4 font-medium">{tx.totalAmount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-muted-foreground">{paymentMethodLabels[tx.paymentMethod] || tx.paymentMethod}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{tx.user}</td>
                    <td className="px-6 py-4 text-muted-foreground">{tx.timestamp}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Close Shift Modal */}
      {showCloseShiftModal && myShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">إنهاء الوردية</h3>
              <button onClick={() => setShowCloseShiftModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitCloseShift} className="space-y-4 p-6 text-right">
              <p className="text-xs text-muted-foreground">أدخل الرصيد الفعلي المعدود لكل عملة. أي فرق عن الرصيد المتوقع سيُرسل تلقائياً لاعتماد المدير.</p>
              {Object.keys(closeBalances).length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد أرصدة لهذه الخزنة</p>
              ) : Object.entries(closeBalances).map(([ccy, val]) => (
                <div key={ccy} className="flex items-center gap-2">
                  <span className="w-16 text-sm font-medium text-foreground">{ccy}</span>
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => setCloseBalances({ ...closeBalances, [ccy]: e.target.value })}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              ))}

              {closeError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{closeError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCloseShiftModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={closingShift} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {closingShift && <Loader2 className="h-4 w-4 animate-spin" />} إقفال الوردية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
