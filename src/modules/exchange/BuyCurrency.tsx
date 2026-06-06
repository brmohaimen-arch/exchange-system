import { useState, useMemo } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import {
  TrendingDown, CheckCircle, AlertTriangle, RefreshCw, Printer,
  ChevronLeft, ChevronRight, User, Banknote, Calculator, Info
} from 'lucide-react';

interface Props { showToast: (type: ToastMessage['type'], message: string) => void; }

export default function BuyCurrency({ showToast: _showToast }: Props) {
  const { vaults, customers, currencies, rates, bankAccounts, executePOSOperation, currentVaultId, shifts, transactions } = useSystem();

  const [step, setStep] = useState(1);
  const [vaultId, setVaultId] = useState(currentVaultId || vaults[0]?.id || '');
  const [customerId, setCustomerId] = useState(customers[0]?.id || '');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('LYD');
  const [amount, setAmount] = useState('');
  const [rateVal, setRateVal] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [validationError, setValidationError] = useState('');

  const activeVault = vaults.find(v => v.id === vaultId);
  const selectedCustomer = customers.find(c => c.id === customerId);
  const activeShift = shifts.find(s => s.vaultId === vaultId && s.status === 'open');

  const matchedRate = useMemo(() =>
    rates.find(r => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency && r.isActive),
    [rates, fromCurrency, toCurrency]
  );

  const globalBuyRate = matchedRate?.buyRate || 0;
  const displayRate = parseFloat(rateVal) || globalBuyRate;
  const amt = parseFloat(amount) || 0;

  // Customer-specific profit fee
  const profitPct = selectedCustomer?.profitPct || 0;

  const calc = useMemo(() => {
    if (!amt || !displayRate) return null;
    // Buy: office buys foreign currency FROM customer
    // Customer pays: amt (foreign currency)
    // Customer receives: amt × rate (local currency)
    const baseReceive = amt * displayRate;
    const feeAmount = baseReceive * (profitPct / 100);
    const customerReceives = baseReceive - feeAmount;
    const profit = (matchedRate ? amt * (matchedRate.sellRate - displayRate) : 0) + feeAmount;

    return {
      customerPays: amt,
      baseReceive,
      feeAmount,
      customerReceives,
      fromCur: fromCurrency,
      toCur: toCurrency,
      profit
    };
  }, [amt, displayRate, fromCurrency, toCurrency, matchedRate, profitPct]);

  const validateStep = (s: number) => {
    if (s === 2) {
      if (!vaultId) { setValidationError('الرجاء اختيار الخزنة.'); return false; }
      if (!customerId) { setValidationError('الرجاء اختيار العميل.'); return false; }
      if (!activeShift && activeVault?.type === 'cashier') {
        setValidationError('يجب فتح صندوق الصراف أولاً.');
        return false;
      }
    }
    if (s === 3) {
      if (!amt || amt <= 0) { setValidationError('الرجاء إدخال مبلغ أكبر من صفر.'); return false; }
      if (!displayRate || displayRate <= 0) { setValidationError('لا يوجد سعر صرف نشط لهذه العملة.'); return false; }
    }
    setValidationError('');
    return true;
  };

  const nextStep = () => { if (validateStep(step)) setStep(s => s + 1); };
  const prevStep = () => setStep(s => s - 1);

  const handleExecute = async () => {
    if (!validateStep(3)) return;
    // commission = feeAmount (in local currency)
    const commission = calc?.feeAmount || 0;
    const result = await executePOSOperation(
      'buy', vaultId, customerId, fromCurrency, toCurrency,
      amt, displayRate, commission, payMethod as any,
      payMethod === 'bank_account' ? bankAccountId : undefined,
      notes || undefined
    );

    if (result.success) {
      setLastReceipt({
        txId: result.txId,
        customer: selectedCustomer?.name,
        amount: amt, rate: displayRate, commission,
        calc, timestamp: new Date().toLocaleString('ar-LY'),
        profitPct
      });
      setStep(5);
      setAmount(''); setNotes('');
    } else {
      setValidationError(result.error || 'حدث خطأ غير متوقع');
    }
  };

  const recentBuys = transactions.filter(t => t.type === 'buy').slice(0, 12);

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'linear-gradient(135deg, #10B981, #059669)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(16,185,129,0.35)'
        }}>
          <TrendingDown size={24} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>شراء عملة</h1>
          <p style={{ color: 'var(--gray)', fontSize: '0.85rem', margin: 0 }}>
            المكتب يشتري العملة الأجنبية من العميل ويدفع له بالدينار الليبي
          </p>
        </div>
      </div>

      <div className="pos-container">
        {/* Left: Wizard */}
        <div className="pos-panel">
          <div className="section-card">
            {/* Step Indicator */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '1.25rem', overflowX: 'auto' }}>
              {['اختر الخزنة', 'العملات والمبلغ', 'راجع وأكد'].map((label, i) => (
                <div key={i} style={{
                  flex: 1, padding: '0.6rem 0.5rem', textAlign: 'center', fontSize: '0.75rem',
                  fontWeight: step === i + 2 ? 700 : 500,
                  color: step >= i + 2 ? 'var(--primary)' : 'var(--gray)',
                  borderBottom: step === i + 2 ? '2px solid var(--primary)' : '2px solid transparent',
                  transition: 'all 0.2s'
                }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: '50%', fontSize: '0.7rem', fontWeight: 800,
                    background: step > i + 1 ? 'var(--success)' : step === i + 2 ? 'var(--primary)' : 'var(--border)',
                    color: step >= i + 2 ? '#fff' : 'var(--gray)', marginBottom: '0.2rem',
                    marginLeft: 'auto', marginRight: 'auto'
                  }}>{step > i + 1 ? '✓' : i + 1}</span>
                  {label}
                </div>
              ))}
            </div>

            <div className="section-card-body">
              {validationError && (
                <div className="validation-warning" style={{ marginBottom: '1rem' }}>
                  <AlertTriangle size={16} />{validationError}
                </div>
              )}

              {/* Step 2: Vault & Customer */}
              {step === 2 && (
                <div>
                  <h2 style={{ fontSize: '1rem', marginBottom: '1.25rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <User size={18} /> اختر الخزنة والعميل
                  </h2>
                  <div className="form-group-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="form-group">
                      <label className="form-label">الخزنة / صندوق الصراف</label>
                      <select className="form-select" value={vaultId} onChange={e => setVaultId(e.target.value)}>
                        {vaults.filter(v => v.isActive).map(v => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">العميل</label>
                      <select className="form-select" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                        {customers.filter(c => c.isActive).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {selectedCustomer && (selectedCustomer.profitPct || 0) > 0 && (
                        <small style={{ color: 'var(--warning)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Info size={12} /> نسبة خدمة هذا العميل: {selectedCustomer.profitPct}%
                        </small>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Amount & Rate */}
              {step === 3 && (
                <div>
                  <h2 style={{ fontSize: '1rem', marginBottom: '1.25rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Banknote size={18} /> العملة والمبلغ
                  </h2>
                  <div className="form-group-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                      <label className="form-label">العملة الأجنبية (يدفعها العميل)</label>
                      <select className="form-select" value={fromCurrency} onChange={e => setFromCurrency(e.target.value)}>
                        {currencies.filter(c => c.isActive && c.code !== 'LYD').map(c => (
                          <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.nameAr}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">يُدفع للعميل بـ</label>
                      <select className="form-select" value={toCurrency} onChange={e => setToCurrency(e.target.value)}>
                        {currencies.filter(c => c.isActive).map(c => (
                          <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.nameAr}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">المبلغ ({fromCurrency})</label>
                      <input className="form-input" type="number" placeholder="0.000" value={amount}
                        onChange={e => setAmount(e.target.value)} autoFocus />
                    </div>
                    <div className="form-group">
                      <label className="form-label">سعر الشراء</label>
                      <input className="form-input" type="number"
                        placeholder={globalBuyRate ? `${globalBuyRate} (السعر الحالي)` : 'أدخل السعر'}
                        value={rateVal} onChange={e => setRateVal(e.target.value)} />
                      {matchedRate && (
                        <small style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>
                          السوق: شراء {matchedRate.buyRate} | بيع {matchedRate.sellRate}
                        </small>
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">طريقة الدفع للعميل</label>
                      <select className="form-select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                        <option value="cash">نقدي</option>
                        <option value="customer_account">حساب العميل</option>
                        <option value="bank_account">حساب بنكي</option>
                        <option value="debt">دين مؤجل</option>
                      </select>
                    </div>
                    {payMethod === 'bank_account' && (
                      <div className="form-group">
                        <label className="form-label">الحساب البنكي</label>
                        <select className="form-select" value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}>
                          {bankAccounts.filter(b => b.isActive).map(b => (
                            <option key={b.id} value={b.id}>{b.bankName} — {b.accountName}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">ملاحظات (اختياري)</label>
                    <input className="form-input" type="text" placeholder="ملاحظات..." value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>

                  {/* Live calc preview */}
                  {calc && (
                    <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Calculator size={13} /> حساب تلقائي
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.82rem' }}>
                        <div>يدفع العميل: <strong>{calc.customerPays.toFixed(3)} {fromCurrency}</strong></div>
                        <div>السعر المستخدم: <strong>{displayRate}</strong></div>
                        <div>القيمة الأساسية: <strong>{calc.baseReceive.toFixed(3)} {toCurrency}</strong></div>
                        {profitPct > 0 && <div style={{ color: 'var(--warning)' }}>رسوم خدمة ({profitPct}%): <strong>−{calc.feeAmount.toFixed(3)} {toCurrency}</strong></div>}
                        <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.88rem' }}>
                          يستلم العميل: <strong>{calc.customerReceives.toFixed(3)} {toCurrency}</strong>
                        </div>
                        <div style={{ color: 'var(--primary)', fontWeight: 700 }}>
                          ربح المكتب: <strong>{calc.profit.toFixed(3)} {toCurrency}</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Review */}
              {step === 4 && calc && (
                <div>
                  <h2 style={{ fontSize: '1rem', marginBottom: '1.25rem', color: 'var(--primary)' }}>مراجعة العملية وتأكيدها</h2>
                  <div style={{ background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.08)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <TrendingDown size={16} color="var(--success)" /> شراء عملة — ملخص العملية
                    </div>
                    <div style={{ padding: '1rem' }}>
                      {[
                        ['العميل', selectedCustomer?.name],
                        ['الخزنة', activeVault?.name],
                        ['العملة المشتراة', `${calc.customerPays.toFixed(3)} ${fromCurrency}`],
                        ['سعر الشراء', displayRate.toString()],
                        ['القيمة الأساسية', `${calc.baseReceive.toFixed(3)} ${toCurrency}`],
                        ...(profitPct > 0 ? [['رسوم الخدمة', `${calc.feeAmount.toFixed(3)} ${toCurrency} (${profitPct}%)`]] : []),
                        ['يستلم العميل', `${calc.customerReceives.toFixed(3)} ${toCurrency}`],
                        ['ربح المكتب', `${calc.profit.toFixed(3)} ${toCurrency}`],
                        ['طريقة الدفع', payMethod === 'cash' ? 'نقدي' : payMethod === 'customer_account' ? 'حساب العميل' : payMethod === 'bank_account' ? 'حساب بنكي' : 'دين مؤجل'],
                      ].map(([label, value], i) => (
                        <div key={i} className="auto-calc-row" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
                          <span className="calc-label" style={{ fontSize: '0.82rem' }}>{label}:</span>
                          <span className="calc-value" style={{ fontSize: '0.85rem', fontWeight: 700 }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Success */}
              {step === 5 && lastReceipt && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                  <CheckCircle size={52} color="var(--success)" style={{ margin: '0 auto 1rem' }} />
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--success)', marginBottom: '0.5rem' }}>تم شراء العملة بنجاح ✓</h2>
                  <p style={{ color: 'var(--gray)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>رقم العملية: <strong>{lastReceipt.txId}</strong></p>

                  {/* Receipt */}
                  <div className="receipt-paper" style={{ marginBottom: '1.5rem', textAlign: 'right' }}>
                    <div className="receipt-header">
                      <div className="receipt-title">إيصال شراء عملة</div>
                      <div style={{ fontSize: '0.78rem' }}>{lastReceipt.timestamp}</div>
                    </div>
                    <div className="receipt-row"><span>العميل:</span><span>{lastReceipt.customer}</span></div>
                    <div className="receipt-row"><span>دفع:</span><span>{lastReceipt.amount.toFixed(3)} {lastReceipt.calc.fromCur}</span></div>
                    <div className="receipt-row"><span>بسعر:</span><span>{lastReceipt.rate}</span></div>
                    {(lastReceipt.profitPct || 0) > 0 && (
                      <div className="receipt-row"><span>رسوم الخدمة ({lastReceipt.profitPct}%):</span><span>{lastReceipt.calc.feeAmount.toFixed(3)} {lastReceipt.calc.toCur}</span></div>
                    )}
                    <div className="receipt-divider" />
                    <div className="receipt-total-box">استلم: {lastReceipt.calc.customerReceives.toFixed(3)} {lastReceipt.calc.toCur}</div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => { setStep(2); setLastReceipt(null); }}>
                      <RefreshCw size={16} /> عملية شراء جديدة
                    </button>
                    <button className="btn btn-secondary" onClick={() => window.print()}>
                      <Printer size={16} /> طباعة
                    </button>
                  </div>
                </div>
              )}

              {/* Nav buttons */}
              {step < 5 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-secondary" disabled={step <= 2} onClick={prevStep}>
                    <ChevronRight size={16} /> السابق
                  </button>
                  {step < 4 ? (
                    <button className="btn btn-primary" onClick={nextStep}>
                      التالي <ChevronLeft size={16} />
                    </button>
                  ) : (
                    <button className="btn btn-success" onClick={handleExecute}>
                      <CheckCircle size={16} /> تأكيد الشراء
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Recent Buys */}
        <div>
          <div className="section-card">
            <div className="section-card-header">
              <div className="section-card-title"><TrendingDown size={16} /> آخر عمليات الشراء</div>
            </div>
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {recentBuys.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.85rem' }}>
                  لا توجد عمليات شراء مسجلة بعد
                </div>
              ) : (
                <table className="financial-table">
                  <thead><tr><th>الوقت</th><th>العميل</th><th>المبلغ</th><th>السعر</th></tr></thead>
                  <tbody>
                    {recentBuys.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{t.timestamp.substring(11, 16)}</td>
                        <td style={{ fontSize: '0.8rem' }}>{t.customerName || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 700 }}>{t.amount.toLocaleString()} {t.fromCurrency}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{t.rate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
