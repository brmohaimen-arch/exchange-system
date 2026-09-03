import { useEffect, useMemo, useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ArrowLeftRight, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { computeExchangeQuote, ExchangeOpType } from '../../utils/exchangeMath';

/**
 * Quick quoting panel — no transaction is created here. Cashiers quote a rate
 * to a walk-in customer many times before any sale is decided, so this lives
 * inline on the exchange screen (a collapsible panel, not its own sidebar
 * page) right next to the buy/sell/exchange operation it's quoting for. Uses
 * the same computeExchangeQuote math the POS wizard uses, so a quote given
 * here always matches what actually executing it would charge.
 */
export default function QuickCalculator() {
  const { currencies, rates, settings } = useSystem();

  const activeCurrencies = currencies.filter(c => c.isActive);
  const defaultLocal = settings?.defaultCurrency || 'LYD';

  const [opType, setOpType] = useState<ExchangeOpType>('sell');
  const [foreignCurrency, setForeignCurrency] = useState('');
  const [localCurrency, setLocalCurrency] = useState('');
  const [amount, setAmount] = useState('');
  const [rateOverride, setRateOverride] = useState('');
  const [commission, setCommission] = useState('0');

  useEffect(() => {
    if (!activeCurrencies.length) return;
    if (!localCurrency || !activeCurrencies.some(c => c.code === localCurrency)) {
      setLocalCurrency(activeCurrencies.some(c => c.code === defaultLocal) ? defaultLocal : activeCurrencies[0].code);
    }
    if (!foreignCurrency || !activeCurrencies.some(c => c.code === foreignCurrency)) {
      const firstForeign = activeCurrencies.find(c => c.code !== defaultLocal)?.code || activeCurrencies[0].code;
      setForeignCurrency(firstForeign);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCurrencies.length, defaultLocal]);

  const standingRate = useMemo(
    () => rates.find(r => r.fromCurrency === foreignCurrency && r.toCurrency === localCurrency && r.isActive),
    [rates, foreignCurrency, localCurrency]
  );

  const defaultRate = opType === 'buy' ? standingRate?.buyRate : standingRate?.sellRate;
  const rate = parseFloat(rateOverride) || defaultRate || 0;
  const amt = parseFloat(amount) || 0;
  const comm = parseFloat(commission) || 0;

  const quote = useMemo(
    () => computeExchangeQuote({ type: opType, amount: amt, rate, commission: comm, standingRate }),
    [opType, amt, rate, comm, standingRate]
  );

  const payLabel = quote?.payCurrencyRole === 'from' ? foreignCurrency : localCurrency;
  const receiveLabel = quote?.payCurrencyRole === 'from' ? localCurrency : foreignCurrency;

  return (
    <div>
      <div className="form-group-grid">
        <div className="form-group">
          <label className="form-label">نوع العملية</label>
          <select className="form-select" value={opType} onChange={e => setOpType(e.target.value as ExchangeOpType)}>
            <option value="buy">شراء عملة (المكتب يشتري من العميل)</option>
            <option value="sell">بيع عملة (المكتب يبيع للعميل)</option>
            <option value="exchange">تبديل عملة</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">العملة الأجنبية</label>
          <select className="form-select" value={foreignCurrency} onChange={e => setForeignCurrency(e.target.value)}>
            {activeCurrencies.map(c => (
              <option key={c.code} value={c.code}>{c.flag} {c.nameAr} ({c.code})</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">العملة المحلية</label>
          <select className="form-select" value={localCurrency} onChange={e => setLocalCurrency(e.target.value)}>
            {activeCurrencies.map(c => (
              <option key={c.code} value={c.code}>{c.flag} {c.nameAr} ({c.code})</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">المبلغ ({foreignCurrency})</label>
          <input className="form-input" type="number" min="0" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">
            السعر {standingRate ? `(المعلن: ${opType === 'buy' ? standingRate.buyRate : standingRate.sellRate})` : '(لا يوجد سعر نشط)'}
          </label>
          <input className="form-input" type="number" step="0.0001" placeholder={defaultRate ? String(defaultRate) : '0.0000'} value={rateOverride} onChange={e => setRateOverride(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">عمولة إضافية ({localCurrency})</label>
          <input className="form-input" type="number" min="0" placeholder="0" value={commission} onChange={e => setCommission(e.target.value)} />
        </div>
      </div>

      {quote?.isRateOutOfBounds && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.9rem', borderRadius: 8, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
          <AlertTriangle size={16} />
          السعر خارج النطاق المسموح ({standingRate?.minRate} - {standingRate?.maxRate}) — سيُرفض عند التنفيذ الفعلي بدون صلاحية تعديل الأسعار.
        </div>
      )}

      {quote && (
        <div style={{ padding: '1.1rem', borderRadius: 10, background: 'var(--input)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--gray)', marginBottom: '0.75rem' }}>
            <ArrowLeftRight size={14} /> نتيجة الحساب
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', fontSize: '0.85rem' }}>
            <div>يدفع العميل: <strong>{quote.customerPays.toFixed(3)} {payLabel}</strong></div>
            <div>يستلم العميل: <strong>{quote.customerReceives.toFixed(3)} {receiveLabel}</strong></div>
            {comm > 0 && <div>العمولة: <strong>{quote.commission.toFixed(3)} {localCurrency}</strong></div>}
            <div style={{ color: 'var(--accent)', fontWeight: 700 }}>
              إجمالي ربح المكتب: <strong>{quote.totalProfit.toFixed(3)} {localCurrency}</strong>
            </div>
          </div>
        </div>
      )}

      {!quote && (amount || rateOverride) && (
        <div style={{ color: 'var(--gray)', fontSize: '0.82rem', textAlign: 'center', padding: '0.5rem' }}>
          أدخل مبلغاً وسعراً صالحين (أكبر من صفر) لعرض النتيجة.
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.9rem', fontSize: '0.78rem', color: 'var(--gray)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><TrendingDown size={13} color="var(--success)" /> سعر الشراء: {standingRate?.buyRate ?? '—'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><TrendingUp size={13} color="var(--danger)" /> سعر البيع: {standingRate?.sellRate ?? '—'}</div>
      </div>
    </div>
  );
}
