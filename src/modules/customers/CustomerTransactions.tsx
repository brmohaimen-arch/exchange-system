import { useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { ArrowDownCircle, ArrowUpCircle, CheckCircle, AlertTriangle } from 'lucide-react';

interface Props { showToast: (type: ToastMessage['type'], message: string) => void; }

export default function CustomerTransactions({ showToast }: Props) {
  const { customers, currencies, vaults, bankAccounts, executeCustomerOperation, transactions } = useSystem();

  const [opType, setOpType] = useState<'deposit' | 'withdraw'>('deposit');
  const [customerId, setCustomerId] = useState(customers[0]?.id || '');
  const [currency, setCurrency] = useState('LYD');
  const [amount, setAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'vault' | 'bank_account'>('vault');
  const [sourceId, setSourceId] = useState(vaults[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const selectedCustomer = customers.find(c => c.id === customerId);
  const custTxs = transactions.filter(t => t.customerId === customerId && ['deposit', 'withdraw'].includes(t.type));

  const handleExecute = () => {
    if (!customerId) { showToast('danger', 'يرجى اختيار العميل'); return; }
    if (!parseFloat(amount) || parseFloat(amount) <= 0) { showToast('danger', 'يرجى إدخال مبلغ صحيح'); return; }
    if (!sourceId) { showToast('danger', 'يرجى اختيار مصدر الأموال'); return; }

    const result = executeCustomerOperation(opType, customerId, currency, parseFloat(amount), payMethod, sourceId, notes || undefined);
    if (result.success) {
      showToast('success', `تم تنفيذ عملية ${opType === 'deposit' ? 'الإيداع' : 'السحب'} بنجاح`);
      setAmount(''); setNotes(''); setError('');
    } else {
      setError(result.error || 'حدث خطأ');
      showToast('danger', result.error || 'حدث خطأ');
    }
  };

  return (
    <div className="page-content">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>إيداع وسحب العملاء</h1>
      <div className="pos-container">
        <div className="pos-panel">
          <div className="section-card">
            <div className="section-card-header"><div className="section-card-title">تنفيذ عملية</div></div>
            <div className="section-card-body">
              <div className="pos-tabs-row" style={{ marginBottom: '1.5rem' }}>
                <button className={`pos-tab-btn${opType === 'deposit' ? ' active' : ''}`} onClick={() => setOpType('deposit')}>
                  <ArrowDownCircle size={16} /> إيداع في حساب العميل
                </button>
                <button className={`pos-tab-btn${opType === 'withdraw' ? ' active' : ''}`} onClick={() => setOpType('withdraw')}>
                  <ArrowUpCircle size={16} /> سحب من حساب العميل
                </button>
              </div>

              <div className="form-group-grid">
                <div className="form-group">
                  <label className="form-label">العميل</label>
                  <select className="form-select" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                    {customers.filter(c => c.isActive).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">العملة</label>
                  <select className="form-select" value={currency} onChange={e => setCurrency(e.target.value)}>
                    {currencies.filter(c => c.isActive).map(c => <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.nameAr}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">المبلغ</label>
                  <input className="form-input" type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">طريقة {opType === 'deposit' ? 'الإيداع' : 'السحب'}</label>
                  <select className="form-select" value={payMethod} onChange={e => setPayMethod(e.target.value as any)}>
                    <option value="vault">نقدي (من/إلى خزنة)</option>
                    <option value="bank_account">بنكي (من/إلى حساب بنكي)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{payMethod === 'vault' ? 'الخزنة' : 'الحساب البنكي'}</label>
                  {payMethod === 'vault' ? (
                    <select className="form-select" value={sourceId} onChange={e => setSourceId(e.target.value)}>
                      {vaults.filter(v => v.isActive).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  ) : (
                    <select className="form-select" value={sourceId} onChange={e => setSourceId(e.target.value)}>
                      {bankAccounts.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.bankName} — {b.accountName} ({b.currency})</option>)}
                    </select>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">ملاحظات</label>
                  <input className="form-input" type="text" placeholder="اختياري" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>

              {error && <div className="validation-warning"><AlertTriangle size={16} />{error}</div>}

              <button className="btn btn-primary" onClick={handleExecute} style={{ width: '100%', marginTop: '1rem', padding: '0.85rem' }}>
                <CheckCircle size={18} />
                تنفيذ عملية {opType === 'deposit' ? 'الإيداع' : 'السحب'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {selectedCustomer && (
            <div className="section-card">
              <div className="section-card-header">
                <div className="section-card-title">بيانات العميل</div>
                <span className={`badge ${selectedCustomer.isActive ? 'active' : 'inactive'}`}>{selectedCustomer.isActive ? 'نشط' : 'موقوف'}</span>
              </div>
              <div className="section-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  { label: 'الاسم', value: selectedCustomer.name },
                  { label: 'الهاتف', value: selectedCustomer.phone },
                  { label: 'النوع', value: selectedCustomer.type === 'individual' ? 'فرد' : 'شركة' },
                  { label: 'حد الدين', value: `${selectedCustomer.debtLimit.toLocaleString()} د.ل` },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--gray)' }}>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.5rem', fontWeight: 700 }}>أرصدة العميل</div>
                  {Object.entries(selectedCustomer.balances).map(([cur, bal]) => (
                    <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                      <span>{cur}</span>
                      <span style={{ fontWeight: 700, color: (bal as number) < 0 ? 'var(--danger)' : (bal as number) > 0 ? 'var(--success)' : 'var(--gray)' }}>
                        {(bal as number).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="section-card">
            <div className="section-card-header"><div className="section-card-title">سجل عمليات العميل</div></div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              <table className="financial-table">
                <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>العملة</th></tr></thead>
                <tbody>
                  {custTxs.length === 0 ? (
                    <tr><td colSpan={4}><div className="empty-state">لا يوجد عمليات إيداع/سحب</div></td></tr>
                  ) : custTxs.slice(0, 15).map(t => (
                    <tr key={t.id}>
                      <td style={{ fontSize: '0.78rem' }}>{t.timestamp.substring(0, 16)}</td>
                      <td><span className={`badge ${t.type === 'deposit' ? 'active' : 'inactive'}`}>{t.type === 'deposit' ? 'إيداع' : 'سحب'}</span></td>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{t.amount.toLocaleString()}</td>
                      <td>{t.fromCurrency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
