import { useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { Send, CheckCircle, AlertTriangle, Clock, XCircle } from 'lucide-react';

interface Props { showToast: (type: ToastMessage['type'], message: string) => void; }

type TransferSourceType = 'vault' | 'bank';
type TransferDestType = 'vault' | 'bank';

export default function Transfers({ showToast }: Props) {
  const { vaults, bankAccounts, currencies, transfers, createTransfer } = useSystem();

  const [fromType, setFromType] = useState<TransferSourceType>('vault');
  const [toType, setToType] = useState<TransferDestType>('vault');
  const [fromId, setFromId] = useState(vaults[0]?.id || '');
  const [toId, setToId] = useState(vaults[1]?.id || vaults[0]?.id || '');
  const [currency, setCurrency] = useState('LYD');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTransfer = () => {
    if (!fromId || !toId) { showToast('danger', 'يرجى اختيار المصدر والوجهة'); return; }
    if (fromType === toType && fromId === toId) { showToast('danger', 'لا يمكن التحويل من وإلى نفس المصدر'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { showToast('danger', 'يرجى إدخال مبلغ صحيح'); return; }

    setLoading(true);
    setTimeout(() => {
      try {
        const srcType = fromType === 'bank' ? 'bank_account' : 'vault';
        const dstType = toType === 'bank' ? 'bank_account' : 'vault';
        createTransfer(srcType, fromId, dstType, toId, currency, amt, notes || undefined);
        setLoading(false);
        showToast('success', `تم إنشاء طلب التحويل بنجاح`);
        setAmount(''); setNotes(''); setError('');
      } catch (e: any) {
        setLoading(false);
        setError(e.message || 'حدث خطأ أثناء التحويل');
        showToast('danger', e.message || 'حدث خطأ أثناء التحويل');
      }
    }, 400);
  };

  const statusColor = (s: string) => s === 'approved' ? 'active' : s === 'pending' ? 'pending' : 'inactive';
  const statusLabel = (s: string) => s === 'approved' ? 'مُوافَق' : s === 'pending' ? 'معلق' : s === 'rejected' ? 'مرفوض' : 'ملغى';
  const statusIcon = (s: string) => {
    if (s === 'approved') return <CheckCircle size={14} color="var(--success)" />;
    if (s === 'pending') return <Clock size={14} color="var(--warning)" />;
    return <XCircle size={14} color="var(--danger)" />;
  };

  return (
    <div className="page-content">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>التحويلات بين الخزنات والبنوك</h1>

      <div className="pos-container">
        {/* Form */}
        <div className="pos-panel">
          <div className="section-card">
            <div className="section-card-header"><div className="section-card-title"><Send size={18} />إنشاء طلب تحويل</div></div>
            <div className="section-card-body">
              <div style={{ background: 'var(--info-bg)', border: '1px solid var(--info)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: 'var(--info)', display: 'flex', gap: '0.5rem' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <span>طلبات التحويل تحتاج موافقة مدير النظام أو مدير الخزنة قبل التنفيذ الفعلي.</span>
              </div>

              <div className="form-group-grid">
                <div className="form-group">
                  <label className="form-label">نوع المصدر</label>
                  <select className="form-select" value={fromType} onChange={e => { setFromType(e.target.value as any); setFromId(e.target.value === 'vault' ? vaults[0]?.id || '' : bankAccounts[0]?.id || ''); }}>
                    <option value="vault">خزنة</option>
                    <option value="bank">حساب بنكي</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">نوع الوجهة</label>
                  <select className="form-select" value={toType} onChange={e => { setToType(e.target.value as any); setToId(e.target.value === 'vault' ? vaults[0]?.id || '' : bankAccounts[0]?.id || ''); }}>
                    <option value="vault">خزنة</option>
                    <option value="bank">حساب بنكي</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">المصدر</label>
                  {fromType === 'vault' ? (
                    <select className="form-select" value={fromId} onChange={e => setFromId(e.target.value)}>
                      {vaults.filter(v => v.isActive).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  ) : (
                    <select className="form-select" value={fromId} onChange={e => setFromId(e.target.value)}>
                      {bankAccounts.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.bankName} — {b.accountName}</option>)}
                    </select>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">الوجهة</label>
                  {toType === 'vault' ? (
                    <select className="form-select" value={toId} onChange={e => setToId(e.target.value)}>
                      {vaults.filter(v => v.isActive).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  ) : (
                    <select className="form-select" value={toId} onChange={e => setToId(e.target.value)}>
                      {bankAccounts.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.bankName} — {b.accountName}</option>)}
                    </select>
                  )}
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
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">ملاحظات / سبب التحويل</label>
                <input className="form-input" type="text" placeholder="اختياري" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>

              {error && <div className="validation-warning"><AlertTriangle size={16} />{error}</div>}

              <button className="btn btn-primary" onClick={handleTransfer} disabled={loading} style={{ width: '100%', padding: '0.85rem' }}>
                <Send size={18} />{loading ? 'جاري الإنشاء...' : 'إنشاء طلب التحويل'}
              </button>
            </div>
          </div>
        </div>

        {/* Transfer List */}
        <div>
          <div className="section-card">
            <div className="section-card-header">
              <div className="section-card-title">سجل التحويلات</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className="badge pending">{transfers.filter(t => t.status === 'pending').length} معلق</span>
                <span className="badge active">{transfers.filter(t => t.status === 'approved').length} مُنفَّذ</span>
              </div>
            </div>
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {transfers.length === 0 ? (
                <div className="empty-state"><Send size={32} /><span>لا يوجد تحويلات</span></div>
              ) : transfers.map(t => (
                <div key={t.id} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {statusIcon(t.status)}
                      <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                        {t.fromName} → {t.toName}
                      </span>
                    </div>
                    <span className={`badge ${statusColor(t.status)}`}>{statusLabel(t.status)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.82rem', color: 'var(--gray)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.95rem' }}>{t.amount.toLocaleString()} {t.currency}</span>
                    <span>{t.timestamp.substring(0, 16)}</span>
                  </div>
                  {t.notes && <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '0.35rem' }}>{t.notes}</div>}
                  {t.status === 'approved' && t.approvedBy && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '0.35rem' }}>
                      وافق عليه: {t.approvedBy}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
