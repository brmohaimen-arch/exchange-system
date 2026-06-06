import { useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { CreditCard, Plus, Search, Calendar, FileText, CheckCircle, ArrowLeft, RefreshCw } from 'lucide-react';

interface Props { showToast: (type: ToastMessage['type'], message: string) => void; }

export default function DebtManagement({ showToast }: Props) {
  const {
    customers,
    debts,
    currencies,
    addDebt,
    payDebt
  } = useSystem();

  const [tab, setTab] = useState<'list' | 'add'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'partially_paid' | 'paid' | 'overdue'>('all');

  // Add Debt Form State
  const [formCustomerId, setFormCustomerId] = useState(customers[0]?.id || '');
  const [formCurrency, setFormCurrency] = useState('LYD');
  const [formAmount, setFormAmount] = useState('');
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().substring(0, 10));
  const [formDueDate, setFormDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10));
  const [formPaymentPeriod, setFormPaymentPeriod] = useState<'monthly' | 'daily' | 'none'>('monthly');
  const [formPaymentAmount, setFormPaymentAmount] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Inline Payment State
  const [payingDebtId, setPayingDebtId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [isPayingSubmitting, setIsPayingSubmitting] = useState(false);

  // Helper: check if a debt is overdue
  const isDebtOverdue = (d: typeof debts[0]) => {
    if (d.status === 'paid' || d.status === 'cancelled') return false;
    if (!d.dueDate) return false;
    const today = new Date().toISOString().substring(0, 10);
    return d.dueDate < today;
  };

  const handleAddDebtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(formAmount);
    if (!formCustomerId) { showToast('danger', 'يرجى اختيار العميل'); return; }
    if (!amt || amt <= 0) { showToast('danger', 'يرجى إدخال مبلغ دين صحيح'); return; }

    const cust = customers.find(c => c.id === formCustomerId);
    if (!cust) { showToast('danger', 'العميل المحدد غير موجود'); return; }

    const installAmt = parseFloat(formPaymentAmount) || 0;
    if (formPaymentPeriod !== 'none' && (installAmt <= 0 || installAmt > amt)) {
      showToast('danger', 'قيمة القسط يجب أن تكون أكبر من الصفر وأقل من إجمالي مبلغ الدين');
      return;
    }

    try {
      await addDebt({
        customerId: formCustomerId,
        customerName: cust.name,
        currency: formCurrency,
        amount: amt,
        startDate: formStartDate,
        dueDate: formDueDate,
        paymentPeriod: formPaymentPeriod,
        paymentAmount: formPaymentPeriod !== 'none' ? installAmt : 0,
        notes: formNotes.trim() || undefined
      });
      
      showToast('success', `تم تسجيل الدين للعميل ${cust.name} بنجاح`);
      // Reset form & switch tab
      setFormAmount('');
      setFormPaymentAmount('');
      setFormNotes('');
      setTab('list');
    } catch (err) {
      showToast('danger', 'حدث خطأ أثناء حفظ الدين في النظام');
    }
  };

  const handlePayInstallment = async (debtId: string) => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { showToast('danger', 'يرجى إدخال مبلغ سداد صحيح'); return; }

    setIsPayingSubmitting(true);
    try {
      const res = await payDebt(debtId, amt, payNotes.trim() || undefined);
      if (res.success) {
        showToast('success', `تم تسجيل سداد دفعة بقيمة ${amt} بنجاح`);
        setPayingDebtId(null);
        setPayAmount('');
        setPayNotes('');
      } else {
        showToast('danger', res.error || 'فشل سداد الدفعة');
      }
    } catch (err) {
      showToast('danger', 'خطأ في الاتصال بالخادم أثناء السداد');
    } finally {
      setIsPayingSubmitting(false);
    }
  };

  const startPaying = (d: typeof debts[0]) => {
    setPayingDebtId(d.id);
    // Suggest paymentAmount as default if configured, otherwise remainingAmount
    const defaultPay = d.paymentAmount && d.paymentAmount > 0 && d.paymentAmount < d.remainingAmount
      ? d.paymentAmount
      : d.remainingAmount;
    setPayAmount(String(defaultPay));
    setPayNotes('');
  };

  // Filter debts
  const filteredDebts = debts.filter(d => {
    const custMatches = d.customerName.toLowerCase().includes(search.toLowerCase()) || 
                        (d.notes || '').toLowerCase().includes(search.toLowerCase());
    
    if (!custMatches) return false;

    const overdue = isDebtOverdue(d);

    if (statusFilter === 'all') return true;
    if (statusFilter === 'overdue') return overdue;
    if (statusFilter === 'unpaid') return d.status === 'unpaid' && !overdue;
    if (statusFilter === 'partially_paid') return d.status === 'partially_paid' && !overdue;
    return d.status === statusFilter;
  });

  // Calculate stats for current filter selection
  const totalOriginal = filteredDebts.reduce((sum, d) => sum + d.amount, 0);
  const totalPaid = filteredDebts.reduce((sum, d) => sum + d.paidAmount, 0);
  const totalRemaining = filteredDebts.reduce((sum, d) => sum + d.remainingAmount, 0);

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CreditCard size={28} color="var(--accent)" />
            إدارة الديون والأقساط
          </h1>
          <p style={{ color: 'var(--gray)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
            متابعة ديون العملاء وجدولة الأقساط وتسجيل المدفوعات اليومية والشهرية.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {tab === 'list' ? (
            <button className="btn btn-primary" onClick={() => setTab('add')}>
              <Plus size={16} /> تسجيل دين جديد
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={() => setTab('list')}>
              <ArrowLeft size={16} /> العودة للقائمة
            </button>
          )}
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="pos-tabs-row" style={{ maxWidth: 420, marginBottom: '1.5rem' }}>
        <button className={`pos-tab-btn${tab === 'list' ? ' active' : ''}`} onClick={() => setTab('list')}>
          <FileText size={16} /> قائمة الديون ({debts.length})
        </button>
        <button className={`pos-tab-btn${tab === 'add' ? ' active' : ''}`} onClick={() => setTab('add')}>
          <Plus size={16} /> تسجيل دين جديد
        </button>
      </div>

      {tab === 'list' && (
        <>
          {/* Filters and Search */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 350 }}>
              <Search size={16} style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)' }} />
              <input
                className="form-input"
                type="text"
                placeholder="بحث باسم العميل أو البيان..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingRight: '2.5rem' }}
              />
            </div>

            {/* Status Select Filter */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'الكل' },
                { id: 'unpaid', label: 'غير مسدد' },
                { id: 'partially_paid', label: 'مسدد جزئياً' },
                { id: 'paid', label: 'مسدد بالكامل' },
                { id: 'overdue', label: 'متأخر عن السداد' }
              ].map(f => (
                <button
                  key={f.id}
                  className={`btn ${statusFilter === f.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
                  onClick={() => setStatusFilter(f.id as any)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>إجمالي الديون المسجلة</span>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary)' }}>
                {totalOriginal.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: '0.8rem' }}>إجمالي</span>
              </span>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>إجمالي المبالغ المدفوعة</span>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--success)' }}>
                {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: '0.8rem' }}>مدفوع</span>
              </span>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>المتبقي المستحق</span>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--danger)' }}>
                {totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: '0.8rem' }}>متبقي</span>
              </span>
            </div>
          </div>

          {/* Debt Cards Grid */}
          {filteredDebts.length === 0 ? (
            <div className="empty-state" style={{ background: 'var(--card)', padding: '3rem' }}>
              <CreditCard size={48} style={{ color: 'var(--gray)' }} />
              <p style={{ marginTop: '1rem', fontWeight: 600 }}>لا توجد ديون مطابقة لمعايير البحث والفلترة حالياً.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.25rem' }}>
              {filteredDebts.map(d => {
                const percent = d.amount > 0 ? Math.round((d.paidAmount / d.amount) * 100) : 0;
                const overdue = isDebtOverdue(d);
                
                // Status mapping
                let badgeClass = 'inactive';
                let statusLabel = 'غير مسدد';
                if (d.status === 'paid') {
                  badgeClass = 'active';
                  statusLabel = 'مسدد بالكامل';
                } else if (d.status === 'partially_paid') {
                  badgeClass = 'pending';
                  statusLabel = 'مسدد جزئياً';
                }
                if (overdue) {
                  badgeClass = 'inactive';
                  statusLabel = 'متأخر عن السداد';
                } else if (d.status === 'cancelled') {
                  badgeClass = 'inactive';
                  statusLabel = 'ملغي';
                }

                return (
                  <div
                    key={d.id}
                    className="section-card"
                    style={{
                      border: payingDebtId === d.id ? '2px solid var(--warning)' : overdue ? '1px solid var(--danger)' : '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative'
                    }}
                  >
                    <div>
                      {/* Top Row: Customer & Status */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>{d.customerName}</h3>
                          <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>رقم الدين: {d.id}</span>
                        </div>
                        <span className={`badge ${badgeClass}`} style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}>
                          {statusLabel}
                        </span>
                      </div>

                      {/* Amounts Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'var(--input)', padding: '0.75rem', borderRadius: 8, marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                        <div>
                          <div style={{ color: 'var(--gray)' }}>المبلغ الكلي</div>
                          <strong style={{ fontSize: '1.05rem' }}>{d.amount.toLocaleString()} {d.currency}</strong>
                        </div>
                        <div>
                          <div style={{ color: 'var(--gray)' }}>المبلغ المتبقي</div>
                          <strong style={{ fontSize: '1.05rem', color: d.remainingAmount > 0 ? 'var(--danger)' : 'var(--success)' }}>
                            {d.remainingAmount.toLocaleString()} {d.currency}
                          </strong>
                        </div>
                        <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.4rem', marginTop: '0.25rem' }}>
                          <span style={{ color: 'var(--gray)' }}>المدفوع:</span>
                          <strong>{d.paidAmount.toLocaleString()} {d.currency} ({percent}%)</strong>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: '0.75rem' }}>
                        <div style={{ width: `${percent}%`, height: '100%', background: percent === 100 ? 'var(--success)' : 'var(--accent)' }} />
                      </div>

                      {/* Schedule & Notes */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Calendar size={14} />
                          <span>تاريخ الاستحقاق: <strong style={{ color: overdue ? 'var(--danger)' : 'inherit' }}>{d.dueDate || '—'}</strong></span>
                        </div>
                        
                        {d.paymentPeriod && d.paymentPeriod !== 'none' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <RefreshCw size={14} />
                            <span>نظام السداد: <strong>{d.paymentPeriod === 'monthly' ? 'أقساط شهرية' : 'أقساط يومية'}</strong> بقيمة <strong>{d.paymentAmount?.toLocaleString()} {d.currency}</strong></span>
                          </div>
                        )}
                        
                        {d.notes && (
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.35rem', background: 'var(--body-bg)', padding: '0.4rem 0.6rem', borderRadius: 6, marginTop: '0.25rem' }}>
                            <FileText size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                            <span>{d.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions Panel */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: 'auto' }}>
                      {payingDebtId === d.id ? (
                        /* Inline Payment Form */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', background: 'var(--body-bg)', padding: '0.75rem', borderRadius: 8 }}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <div style={{ flex: 1 }}>
                              <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>مبلغ الدفعة ({d.currency})</label>
                              <input
                                className="form-input"
                                type="number"
                                style={{ padding: '0.35rem 0.5rem', fontSize: '0.88rem' }}
                                value={payAmount}
                                onChange={e => setPayAmount(e.target.value)}
                              />
                            </div>
                            <div style={{ flex: 2 }}>
                              <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>ملاحظات السداد</label>
                              <input
                                className="form-input"
                                type="text"
                                placeholder="اختياري"
                                style={{ padding: '0.35rem 0.5rem', fontSize: '0.88rem' }}
                                value={payNotes}
                                onChange={e => setPayNotes(e.target.value)}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                              onClick={() => setPayingDebtId(null)}
                              disabled={isPayingSubmitting}
                            >
                              إلغاء
                            </button>
                            <button
                              className="btn btn-success"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                              onClick={() => handlePayInstallment(d.id)}
                              disabled={isPayingSubmitting}
                            >
                              {isPayingSubmitting ? 'جاري السداد...' : 'تأكيد الدفع'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Standard Action Buttons */
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                            تاريخ التسجيل: {d.startDate || '—'}
                          </span>
                          
                          {d.status !== 'paid' && d.status !== 'cancelled' && (
                            <button
                              className="btn btn-success"
                              style={{ padding: '0.35rem 0.85rem', fontSize: '0.82rem' }}
                              onClick={() => startPaying(d)}
                            >
                              تسجيل دفعة سداد
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'add' && (
        <div className="section-card" style={{ maxWidth: 650, margin: '0 auto' }}>
          <div className="section-card-header">
            <div className="section-card-title">تسجيل دين جديد على عميل</div>
          </div>
          <div className="section-card-body">
            <form onSubmit={handleAddDebtSubmit}>
              <div className="form-group-grid">
                {/* Customer Select */}
                <div className="form-group">
                  <label className="form-label">العميل المدين *</label>
                  <select
                    className="form-select"
                    value={formCustomerId}
                    onChange={e => setFormCustomerId(e.target.value)}
                    required
                  >
                    <option value="">-- اختر العميل --</option>
                    {customers.filter(c => c.isActive).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Currency Select */}
                <div className="form-group">
                  <label className="form-label">عملة الدين *</label>
                  <select
                    className="form-select"
                    value={formCurrency}
                    onChange={e => setFormCurrency(e.target.value)}
                    required
                  >
                    {currencies.filter(c => c.isActive).map(c => (
                      <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                    ))}
                  </select>
                </div>

                {/* Original Amount */}
                <div className="form-group">
                  <label className="form-label">قيمة الدين (المبلغ الأصلي) *</label>
                  <input
                    className="form-input"
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value)}
                    required
                  />
                </div>

                {/* Start Date */}
                <div className="form-group">
                  <label className="form-label">تاريخ البداية</label>
                  <input
                    className="form-input"
                    type="date"
                    value={formStartDate}
                    onChange={e => setFormStartDate(e.target.value)}
                    required
                  />
                </div>

                {/* Due Date */}
                <div className="form-group">
                  <label className="form-label">تاريخ الاستحقاق النهائي *</label>
                  <input
                    className="form-input"
                    type="date"
                    value={formDueDate}
                    onChange={e => setFormDueDate(e.target.value)}
                    required
                  />
                </div>

                {/* Schedule Type / Period */}
                <div className="form-group">
                  <label className="form-label">طريقة السداد / الأقساط</label>
                  <select
                    className="form-select"
                    value={formPaymentPeriod}
                    onChange={e => setFormPaymentPeriod(e.target.value as any)}
                  >
                    <option value="none">دفعة واحدة عند تاريخ الاستحقاق</option>
                    <option value="monthly">تقسيط شهري منتظم</option>
                    <option value="daily">تقسيط يومي منتظم</option>
                  </select>
                </div>

                {/* Installment Amount */}
                {formPaymentPeriod !== 'none' && (
                  <div className="form-group">
                    <label className="form-label">قيمة القسط المستهدف ({formCurrency}) *</label>
                    <input
                      className="form-input"
                      type="number"
                      step="any"
                      placeholder="أدخل قيمة القسط"
                      value={formPaymentAmount}
                      onChange={e => setFormPaymentAmount(e.target.value)}
                      required
                    />
                  </div>
                )}

                {/* Notes */}
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">البيان / الوصف (ملاحظات الدين)</label>
                  <textarea
                    className="form-input"
                    style={{ minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                    placeholder="سبب الدين أو تفاصيل إضافية..."
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setTab('list')}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  <CheckCircle size={16} /> تسجيل الدين وجدولته
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
