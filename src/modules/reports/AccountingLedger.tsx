import { useState, useMemo } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { BookOpen, Filter, AlertTriangle, Check, X } from 'lucide-react';

interface Props { showToast: (type: ToastMessage['type'], message: string) => void; }

export default function AccountingLedger({ showToast }: Props) {
  const { journalEntries, requestReversal, currentRole } = useSystem();
  const [filterDate, setFilterDate] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCurrency, setFilterCurrency] = useState('all');

  const isAdmin = currentRole === 'مدير النظام';

  // Reversal state
  const [showReversalModal, setShowReversalModal] = useState(false);
  const [reversalEntryId, setReversalEntryId] = useState('');
  const [reversalDesc, setReversalDesc] = useState('');
  const [reversalReason, setReversalReason] = useState('');

  const openReversalModal = (id: string, desc: string) => {
    setReversalEntryId(id);
    setReversalDesc(desc);
    setReversalReason('');
    setShowReversalModal(true);
  };

  const handleReversalSubmit = () => {
    if (!reversalReason.trim()) {
      showToast('danger', 'يرجى إدخال سبب عكس القيد');
      return;
    }
    requestReversal(reversalEntryId, reversalReason.trim());
    showToast('success', 'تم تقديم طلب قيد عكسي بنجاح، بانتظار موافقة الإدارة العامة');
    setShowReversalModal(false);
  };

  const filtered = useMemo(() => {
    return journalEntries.filter(e => {
      if (filterDate && !e.date.startsWith(filterDate)) return false;
      if (filterType !== 'all' && e.txType !== filterType) return false;
      if (filterCurrency !== 'all' && !e.lines.some(l => l.currency === filterCurrency)) return false;
      return true;
    });
  }, [journalEntries, filterDate, filterType, filterCurrency]);

  const flatLines = useMemo(() => {
    return filtered.flatMap(e => 
      e.lines.map((l, index) => ({
        ...l,
        entryId: e.id,
        date: e.date,
        description: index === 0 ? e.description : '',
        txType: e.txType,
        uniqueId: `${e.id}_${index}`
      }))
    );
  }, [filtered]);

  const totalDebit = flatLines.reduce((s, line) => s + (line.debit || 0), 0);
  const totalCredit = flatLines.reduce((s, line) => s + (line.credit || 0), 0);

  const currencies = ['all', 'LYD', 'USD', 'EUR', 'TRY', 'EGP'];
  const txTypes = [
    { value: 'all', label: 'جميع الأنواع' },
    { value: 'buy', label: 'شراء عملة' },
    { value: 'sell', label: 'بيع عملة' },
    { value: 'exchange', label: 'تبديل' },
    { value: 'deposit', label: 'إيداع عميل' },
    { value: 'withdraw', label: 'سحب عميل' },
    { value: 'transfer', label: 'تحويل' },
    { value: 'adjustment', label: 'تسوية' },
  ];

  const txTypeLabel: Record<string, string> = {
    buy: 'شراء', sell: 'بيع', exchange: 'تبديل', deposit: 'إيداع',
    withdraw: 'سحب', transfer: 'تحويل', adjustment: 'تسوية', reversal: 'عكسي'
  };

  return (
    <div className="page-content" style={{ gap: '1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>القيود المحاسبية اليومية (دفتر اليومية)</h1>

      {/* CBS Deletion Warning Banner */}
      <div style={{ display: 'flex', gap: '0.75rem', background: 'var(--danger-bg)', border: '1px solid var(--danger)', padding: '1rem 1.25rem', borderRadius: 'var(--radius)', color: 'var(--danger)' }}>
        <AlertTriangle size={22} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <strong style={{ fontSize: '0.92rem' }}>تنبيه قانوني وتنظيمي هام</strong>
          <span style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
            وفقاً لتعليمات مصرف ليبيا المركزي ومعايير المحاسبة الدولية، لا يُسمح نهائياً بحذف أو تعديل أي قيد مالي تم ترحيله إلى اليومية العامة. في حال وجود خطأ بالرصيد أو مدخل خاطئ، يجب إنشاء طلب قيد عكسي لتصحيح الحسابات.
          </span>
        </div>
      </div>

      {/* Summary Row */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {[
          { label: 'إجمالي المدين', value: totalDebit, color: 'var(--danger)' },
          { label: 'إجمالي الدائن', value: totalCredit, color: 'var(--success)' },
          { label: 'الفارق', value: Math.abs(totalDebit - totalCredit), color: Math.abs(totalDebit - totalCredit) < 0.01 ? 'var(--success)' : 'var(--warning)' },
          { label: 'عدد القيود', value: filtered.length, color: 'var(--primary)', isCount: true },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem 1.25rem', minWidth: 160 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>{item.label}</div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: item.color, fontFamily: 'monospace' }}>
              {item.isCount ? item.value : item.value.toLocaleString('ar-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="section-card">
        <div className="section-card-header">
          <div className="section-card-title"><Filter size={18} />فلاتر البحث</div>
        </div>
        <div className="section-card-body">
          <div className="form-group-grid">
            <div className="form-group">
              <label className="form-label">التاريخ</label>
              <input className="form-input" type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">نوع العملية</label>
              <select className="form-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
                {txTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">العملة</label>
              <select className="form-select" value={filterCurrency} onChange={e => setFilterCurrency(e.target.value)}>
                {currencies.map(c => <option key={c} value={c}>{c === 'all' ? 'جميع العملات' : c}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Journal Table */}
      <div className="section-card">
        <div className="section-card-header">
          <div className="section-card-title"><BookOpen size={18} color="var(--accent)" />القيود المحاسبية</div>
          <span className="badge active">{filtered.length} قيد</span>
        </div>
        <div className="table-responsive">
          <table className="financial-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th colSpan={2}>الحساب</th>
                <th>البيان</th>
                <th>العملة</th>
                <th style={{ color: 'var(--danger)' }}>مدين</th>
                <th style={{ color: 'var(--success)' }}>دائن</th>
                <th>نوع العملية والإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {flatLines.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state"><BookOpen size={32} /><span>لا توجد قيود محاسبية للفلاتر المحددة</span></div></td></tr>
              ) : flatLines.map((e, index) => {
                const isNewEntry = index === 0 || flatLines[index - 1].entryId !== e.entryId;
                return (
                  <tr key={e.uniqueId} style={{ borderTop: isNewEntry ? '2px solid var(--border)' : 'none' }}>
                    <td style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>{isNewEntry ? e.date.substring(0, 16) : ''}</td>
                    <td colSpan={2} style={{ fontWeight: e.debit > 0 ? 700 : 500, fontSize: '0.83rem' }}>{e.accountName}</td>
                    <td style={{ fontSize: '0.78rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--gray)' }}>
                      {e.description}
                    </td>
                    <td><span className="badge pending" style={{ opacity: isNewEntry ? 1 : 0.5 }}>{e.currency}</span></td>
                    <td style={{ fontWeight: 700, color: 'var(--danger)', fontFamily: 'monospace' }}>
                      {e.debit > 0 ? e.debit.toLocaleString('ar-LY', { minimumFractionDigits: 2 }) : '—'}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--success)', fontFamily: 'monospace' }}>
                      {e.credit > 0 ? e.credit.toLocaleString('ar-LY', { minimumFractionDigits: 2 }) : '—'}
                    </td>
                    <td>
                      {isNewEntry && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span className="badge pending">{txTypeLabel[e.txType] || e.txType}</span>
                          {isAdmin && e.txType !== 'reversal' && (
                            <button
                              onClick={() => openReversalModal(e.entryId, e.description || '')}
                              className="btn btn-secondary"
                              style={{
                                padding: '0.2rem 0.5rem',
                                fontSize: '0.72rem',
                                color: 'var(--danger)',
                                borderColor: 'var(--danger)',
                                cursor: 'pointer'
                              }}
                            >
                              عكس القيد
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--sidebar-hover)', fontWeight: 800 }}>
                  <td colSpan={5} style={{ textAlign: 'center', fontSize: '0.85rem' }}>المجموع</td>
                  <td style={{ color: 'var(--danger)', fontFamily: 'monospace' }}>{totalDebit.toLocaleString('ar-LY', { minimumFractionDigits: 2 })}</td>
                  <td style={{ color: 'var(--success)', fontFamily: 'monospace' }}>{totalCredit.toLocaleString('ar-LY', { minimumFractionDigits: 2 })}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Reversal Entry Reason Modal */}
      {showReversalModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="section-card" style={{ width: '100%', maxWidth: 450, border: '2px solid var(--danger)', animation: 'scale-up 0.25s ease-out' }}>
            <div className="section-card-header" style={{ borderBottom: 'none', paddingBottom: '0.5rem' }}>
              <div className="section-card-title" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={20} color="var(--danger)" />
                <span>طلب عكس وقيد تسوية القيد المالي</span>
              </div>
              <button onClick={() => setShowReversalModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}><X size={20} /></button>
            </div>
            <div className="section-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.5rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--foreground)', lineHeight: 1.5 }}>
                سيقوم هذا الإجراء بإنشاء طلب قيد عكسي موازٍ لإلغاء وتعديل أرصدة القيد رقم: <strong>{reversalEntryId}</strong> ({reversalDesc || 'بدون بيان'}).
              </p>
              
              <div className="form-group">
                <label className="form-label">سبب وتفصيل عكس القيد *</label>
                <textarea
                  className="form-input"
                  placeholder="أدخل سبب عكس القيد بالتفصيل المحاسبي..."
                  rows={4}
                  value={reversalReason}
                  onChange={e => setReversalReason(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowReversalModal(false)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <X size={15} />إلغاء
                </button>
                <button className="btn btn-danger" onClick={handleReversalSubmit} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Check size={15} />تقديم طلب العكس
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

