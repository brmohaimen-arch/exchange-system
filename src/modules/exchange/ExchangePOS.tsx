import React, { useState, useMemo } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { ArrowLeftRight, TrendingUp, TrendingDown, RefreshCw, Printer, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Calculator as CalculatorIcon, X } from 'lucide-react';
import { showFeedback } from '../../components/feedback/showFeedback';
import { computeExchangeQuote } from '../../utils/exchangeMath';
import QuickCalculator from './Calculator';

interface Props { showToast: (type: ToastMessage['type'], message: string) => void; }
type OpType = 'buy' | 'sell' | 'exchange';

export default function ExchangePOS({ showToast: _showToast }: Props) {
  const { vaults, customers, currencies, rates, bankAccounts, executePOSOperation, currentVaultId, transactions, shifts, settings } = useSystem();

  const [step, setStep] = useState(1);
  const [opType, setOpType] = useState<OpType>('buy');
  const [vaultId, setVaultId] = useState(currentVaultId || vaults[0]?.id || '');
  const [customerId, setCustomerId] = useState(customers[0]?.id || '');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('LYD');
  const [amount, setAmount] = useState('');
  const [rateVal, setRateVal] = useState('');
  const [commission, setCommission] = useState('5');
  const [payMethod, setPayMethod] = useState<string>('cash');
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [validationError, setValidationError] = useState('');
  const [showCalc, setShowCalc] = useState(false);

  const activeVault = vaults.find(v => v.id === vaultId);
  const selectedCustomer = customers.find(c => c.id === customerId);
  const activeShift = shifts.find(s => s.vaultId === vaultId && s.status === 'open');

  const matchedRate = useMemo(() => rates.find(r =>
    r.fromCurrency === fromCurrency && r.toCurrency === toCurrency && r.isActive
  ), [rates, fromCurrency, toCurrency]);

  const displayRate = parseFloat(rateVal) || (opType === 'buy' ? matchedRate?.buyRate : matchedRate?.sellRate) || 0;
  const amt = parseFloat(amount) || 0;
  const comm = parseFloat(commission) || 0;

  const calc = useMemo(() => {
    const quote = computeExchangeQuote({ type: opType, amount: amt, rate: displayRate, commission: comm, standingRate: matchedRate });
    if (!quote) return null;
    const fromCur = quote.payCurrencyRole === 'from' ? fromCurrency : toCurrency;
    const toCur = quote.payCurrencyRole === 'from' ? toCurrency : fromCurrency;
    return {
      customerPays: quote.customerPays,
      customerReceives: quote.customerReceives,
      fromCur, toCur,
      profit: quote.backendExpectedProfit
    };
  }, [opType, amt, displayRate, comm, fromCurrency, toCurrency, matchedRate]);

  const validateStep = (s: number) => {
    if (s === 2) {
      if (!vaultId) { setValidationError('الرجاء اختيار الخزنة.'); return false; }
      if (!customerId) { setValidationError('الرجاء اختيار العميل.'); return false; }
      if (!activeShift && activeVault?.type === 'cashier') {
        setValidationError('يجب فتح صندوق الصراف قبل تنفيذ العمليات');
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

  const nextStep = () => {
    if (validateStep(step)) setStep(s => s + 1);
  };
  const prevStep = () => setStep(s => s - 1);

  const handleExecute = async () => {
    if (!validateStep(3)) return;

    const result = await executePOSOperation(
      opType, vaultId, customerId, fromCurrency, toCurrency,
      amt, displayRate, comm, payMethod as any,
      payMethod === 'bank_account' ? bankAccountId : undefined,
      notes || undefined
    );

    if (result.success) {
      showFeedback('SUCCESS', 'success');
      setLastReceipt({ opType, customer: selectedCustomer?.name, amount: amt, rate: displayRate, commission: comm, calc, txId: result.txId, timestamp: new Date().toLocaleString('ar-LY') });
      setStep(5); // Confirmation step
      setAmount(''); setNotes('');
    } else {
      setValidationError(result.error || 'حدث خطأ غير متوقع');
      showFeedback('SERVER_ERROR', 'error');
    }
  };

  const tabLabel: Record<OpType, string> = { buy: 'شراء عملة', sell: 'بيع عملة', exchange: 'تبديل عملة' };
  const tabIcon: Record<OpType, React.ReactNode> = {
    buy: <TrendingDown size={16} />, sell: <TrendingUp size={16} />, exchange: <ArrowLeftRight size={16} />
  };

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>عملية صرافة جديدة</h1>
        <button className="btn btn-secondary" style={{ flex: 'none', fontSize: '0.85rem' }} onClick={() => setShowCalc(s => !s)}>
          {showCalc ? <X size={15} /> : <CalculatorIcon size={15} />}
          {showCalc ? 'إغلاق الحاسبة' : 'حاسبة سريعة'}
        </button>
      </div>

      {showCalc && (
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title"><CalculatorIcon size={17} color="var(--accent)" />حاسبة سريعة — بدون تنفيذ عملية</div>
          </div>
          <div className="section-card-body">
            <QuickCalculator />
          </div>
        </div>
      )}

      <div className="pos-container">
        {/* Left: Wizard Form */}
        <div className="pos-panel">
          <div className="section-card">
            <div className="section-card-header">
              <div className="section-card-title">الخطوة {step} من 4</div>
            </div>
            <div className="section-card-body">
              {validationError && (
                <div className="validation-warning" style={{ marginBottom: '1rem' }}><AlertTriangle size={16} />{validationError}</div>
              )}

              {step === 1 && (
                <div>
                  <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>اختر نوع العملية</h2>
                  <div className="pos-tabs-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {(['buy', 'sell', 'exchange'] as OpType[]).map(t => (
                      <button key={t} className={`pos-tab-btn${opType === t ? ' active' : ''}`} style={{ width: '100%', padding: '1rem', justifyContent: 'flex-start' }} onClick={() => { setOpType(t); nextStep(); }}>
                        {tabIcon[t]} <span style={{ marginRight: '0.5rem' }}>{tabLabel[t]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>اختر الخزنة والعميل</h2>
                  <div className="form-group-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="form-group">
                      <label className="form-label">الخزنة / صندوق الصراف</label>
                      <select className="form-select" value={vaultId} onChange={e => setVaultId(e.target.value)}>
                        {vaults.filter(v => v.isActive).map(v => (
                          <option key={v.id} value={v.id}>{v.name} ({v.type === 'main' ? 'رئيسية' : v.type === 'branch' ? 'فرع' : 'صراف'})</option>
                        ))}
                      </select>
                      <small style={{ color: 'var(--gray)', fontSize: '0.75rem', marginTop: '0.25rem' }}>الصندوق الذي سيتم سحب/إيداع المبالغ فيه.</small>
                    </div>
                    <div className="form-group">
                      <label className="form-label">العميل</label>
                      <select className="form-select" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                        {customers.filter(c => c.isActive).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>أدخل المبلغ والسعر</h2>
                  <div className="form-group-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                      <label className="form-label">{opType === 'buy' ? 'العملة المشتراة' : 'من عملة'}</label>
                      <select className="form-select" value={fromCurrency} onChange={e => setFromCurrency(e.target.value)}>
                        {currencies.filter(c => c.isActive).map(c => (
                          <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.nameAr}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">{opType === 'sell' ? 'العملة المستلمة' : 'إلى عملة'}</label>
                      <select className="form-select" value={toCurrency} onChange={e => setToCurrency(e.target.value)}>
                        {currencies.filter(c => c.isActive).map(c => (
                          <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.nameAr}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">المبلغ</label>
                      <input className="form-input" type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">
                        سعر الصرف
                      </label>
                      <input
                        className="form-input" type="number"
                        placeholder={matchedRate ? `${opType === 'buy' ? matchedRate.buyRate : matchedRate.sellRate}` : '0.000'}
                        value={rateVal} onChange={e => setRateVal(e.target.value)}
                      />
                      <small style={{ color: 'var(--gray)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        اكتب السعر المستخدم لهذه العملية. سيتم حفظ هذا السعر داخل العملية ولن يتغير لاحقاً.
                      </small>
                    </div>
                    <div className="form-group">
                      <label className="form-label">العمولة (د.ل)</label>
                      <input className="form-input" type="number" placeholder="5" value={commission} onChange={e => setCommission(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">طريقة الدفع</label>
                      <select className="form-select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                        <option value="cash">نقدي</option>
                        <option value="customer_account">حساب العميل</option>
                        <option value="bank_account">حساب بنكي</option>
                        <option value="debt">دين مؤجل</option>
                      </select>
                      {payMethod === 'debt' && <small style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>إذا لم يدفع العميل الآن، يمكن حفظ العملية كدين.</small>}
                    </div>
                  </div>
                  {payMethod === 'bank_account' && (
                    <div className="form-group" style={{ marginTop: '1rem' }}>
                      <label className="form-label">الحساب البنكي</label>
                      <select className="form-select" value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}>
                        {bankAccounts.filter(b => b.isActive).map(b => (
                          <option key={b.id} value={b.id}>{b.bankName} — {b.accountName} ({b.currency})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label className="form-label">ملاحظات</label>
                    <input className="form-input" type="text" placeholder="ملاحظات اختيارية" value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div>
                  <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>راجع الملخص وتأكيد العملية</h2>
                  {calc && (
                    <div style={{ background: 'var(--bg)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>ملخص العملية</h3>
                      <div className="auto-calc-row"><span className="calc-label">العملية:</span><span className="calc-value">{tabLabel[opType]}</span></div>
                      <div className="auto-calc-row"><span className="calc-label">الخزنة:</span><span className="calc-value">{activeVault?.name}</span></div>
                      <div className="auto-calc-row"><span className="calc-label">العميل يدفع:</span><span className="calc-value">{calc.customerPays.toFixed(3)} {calc.fromCur}</span></div>
                      <div className="auto-calc-row"><span className="calc-label">العميل يستلم:</span><span className="calc-value" style={{ color: '#64FFDA' }}>{calc.customerReceives.toFixed(3)} {calc.toCur}</span></div>
                      <div className="auto-calc-row"><span className="calc-label">سعر الصرف:</span><span className="calc-value">{displayRate}</span></div>
                      
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>الرصيد بعد العملية (تقريبي):</div>
                        {activeVault && Object.entries(activeVault.balances).map(([cur, bal]) => (
                          <div key={cur} className="auto-calc-row" style={{ fontSize: '0.82rem' }}>
                            <span className="calc-label">{cur}:</span>
                            <span className="calc-value" style={{ color: (bal as number) > 0 ? '#64FFDA' : '#FF6B6B' }}>{(bal as number).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 5 && lastReceipt && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 1rem' }} />
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)', marginBottom: '0.5rem' }}>تم تنفيذ العملية بنجاح</h2>
                  <p style={{ color: 'var(--gray)', marginBottom: '1.5rem' }}>رقم العملية: {lastReceipt.txId}</p>
                  
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button className="btn btn-primary" onClick={() => { setStep(1); setLastReceipt(null); }}>
                      <RefreshCw size={16} /> عملية جديدة
                    </button>
                    <button className="btn btn-secondary" onClick={() => window.print()}>
                      <Printer size={16} /> طباعة الإيصال
                    </button>
                  </div>
                </div>
              )}

              {/* Wizard Nav */}
              {step < 5 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-secondary" disabled={step === 1} onClick={prevStep}>
                    <ChevronRight size={16} /> السابق
                  </button>
                  {step < 4 ? (
                    <button className="btn btn-primary" onClick={nextStep}>
                      التالي <ChevronLeft size={16} />
                    </button>
                  ) : (
                    <button className="btn btn-success" onClick={handleExecute}>
                      <CheckCircle size={16} /> تأكيد العملية
                    </button>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Right: Receipt + Recent */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Receipt */}
          {lastReceipt && step === 5 && (
            <div className="section-card">
              <div className="section-card-header">
                <div className="section-card-title"><Printer size={16} />معاينة الإيصال</div>
              </div>
              <div className="section-card-body">
                <div className="receipt-paper">
                  <div className="receipt-header">
                    <div className="receipt-title">{settings?.companyName || 'نظام الصرافة والخزنات'}</div>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>إيصال عملية صرافة</div>
                  </div>
                  <div className="receipt-row"><span>رقم العملية:</span><span>{lastReceipt.txId}</span></div>
                  <div className="receipt-row"><span>الوقت:</span><span>{lastReceipt.timestamp}</span></div>
                  <div className="receipt-row"><span>العميل:</span><span>{lastReceipt.customer}</span></div>
                  <div className="receipt-divider" />
                  <div className="receipt-row"><span>نوع العملية:</span><span>{lastReceipt.opType === 'buy' ? 'شراء عملة' : lastReceipt.opType === 'sell' ? 'بيع عملة' : 'تبديل عملة'}</span></div>
                  <div className="receipt-row"><span>يدفع:</span><span>{lastReceipt.calc?.customerPays?.toFixed(3)} {lastReceipt.calc?.fromCur}</span></div>
                  <div className="receipt-row"><span>يستلم:</span><span>{lastReceipt.calc?.customerReceives?.toFixed(3)} {lastReceipt.calc?.toCur}</span></div>
                  <div className="receipt-row"><span>سعر الصرف:</span><span>{lastReceipt.rate}</span></div>
                  <div className="receipt-row"><span>العمولة:</span><span>{lastReceipt.commission} د.ل</span></div>
                  <div className="receipt-divider" />
                  <div className="receipt-total-box">الإجمالي: {lastReceipt.calc?.customerReceives?.toFixed(2)} {lastReceipt.calc?.toCur}</div>
                </div>
              </div>
            </div>
          )}

          {/* Recent Ops */}
          <div className="section-card">
            <div className="section-card-header">
              <div className="section-card-title">آخر عمليات الصرافة</div>
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {transactions.filter(t => ['buy', 'sell', 'exchange'].includes(t.type)).length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--gray)' }}>
                  <p>لا توجد عمليات صرافة اليوم.</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>يمكنك بدء عملية جديدة من الخطوات الجانبية.</p>
                </div>
              ) : (
                <table className="financial-table">
                  <thead><tr><th>الوقت</th><th>النوع</th><th>المبلغ</th><th>الحالة</th></tr></thead>
                  <tbody>
                    {transactions.filter(t => ['buy', 'sell', 'exchange'].includes(t.type)).slice(0, 15).map(t => (
                      <tr key={t.id}>
                        <td style={{ fontSize: '0.75rem' }}>{t.timestamp.substring(11, 16)}</td>
                        <td><span className={`badge ${t.type === 'buy' ? 'active' : t.type === 'sell' ? 'inactive' : 'pending'}`}>{t.type === 'buy' ? 'شراء' : t.type === 'sell' ? 'بيع' : 'تبديل'}</span></td>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.82rem' }}>{t.amount.toLocaleString()} {t.fromCurrency}</td>
                        <td><span className={`badge ${t.status === 'approved' ? 'active' : 'inactive'}`}>{t.status === 'approved' ? 'منفَّذة' : 'ملغاة'}</span></td>
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
