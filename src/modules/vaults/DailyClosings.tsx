import { useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { Play, Square, CheckCircle, Clock, AlertTriangle, Package } from 'lucide-react';

interface Props { showToast: (type: ToastMessage['type'], message: string) => void; }

export default function DailyClosings({ showToast }: Props) {
  const { vaults, shifts, openShift, closeShift, submitInventoryCount } = useSystem();
  const [selectedVaultId, setSelectedVaultId] = useState(vaults[0]?.id || '');
  const [cashierName, setCashierName] = useState('');
  const [tab, setTab] = useState<'shifts' | 'inventory'>('shifts');

  // Active shift actual balances state for closing
  const [actualBalances, setActualBalances] = useState<Record<string, string>>({});

  // Inventory count form
  const [invVaultId, setInvVaultId] = useState(vaults[0]?.id || '');
  const [invCounts, setInvCounts] = useState<Record<string, string>>({});

  const activeShift = shifts.find(s => s.vaultId === selectedVaultId && s.status === 'open');

  const handleOpenShift = () => {
    if (!selectedVaultId) { showToast('danger', 'يرجى اختيار الخزنة'); return; }
    if (!cashierName.trim()) { showToast('danger', 'يرجى إدخال اسم الصراف'); return; }
    openShift(selectedVaultId, {}, cashierName.trim());
    showToast('success', `تم فتح الصندوق للخزنة "${vaults.find(v => v.id === selectedVaultId)?.name}" — صراف: ${cashierName}`);
    setCashierName('');
  };

  const handleCloseShift = () => {
    if (!activeShift) return;
    const vault = vaults.find(v => v.id === activeShift.vaultId);
    if (!vault) return;

    const balancesToSubmit: Record<string, number> = {};
    let isAllFilled = true;

    Object.keys(vault.balances).forEach(cur => {
      const val = actualBalances[cur];
      if (val === undefined || val === '') {
        isAllFilled = false;
      } else {
        balancesToSubmit[cur] = parseFloat(val) || 0;
      }
    });

    if (!isAllFilled) {
      showToast('danger', 'يرجى إدخال الرصيد الفعلي لجميع العملات لإتمام عملية الإقفال');
      return;
    }

    closeShift(activeShift.id, balancesToSubmit);
    showToast('info', 'تم إرسال طلب إقفال الصندوق بنجاح — في انتظار موافقة الإدارة العامة');
    setActualBalances({});
  };

  const handleSubmitInventory = () => {
    const vault = vaults.find(v => v.id === invVaultId);
    if (!vault) return;
    
    let hasCount = false;
    Object.entries(invCounts).forEach(([cur, val]) => {
      if (val) {
        hasCount = true;
        const actual = parseFloat(val) || 0;
        const sys = (vault.balances[cur] as number) || 0;
        submitInventoryCount(invVaultId, cur, sys, actual, 'counting_error', 'جرد دوري');
      }
    });

    if (!hasCount) { showToast('danger', 'يرجى إدخال مبالغ الجرد'); return; }
    showToast('success', 'تم إرسال نتيجة الجرد — في انتظار موافقة المدير');
    setInvCounts({});
  };

  const invVault = vaults.find(v => v.id === invVaultId);

  return (
    <div className="page-content">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>صناديق الصرافين والإقفال اليومي</h1>

      <div className="pos-tabs-row" style={{ maxWidth: 400 }}>
        <button className={`pos-tab-btn${tab === 'shifts' ? ' active' : ''}`} onClick={() => setTab('shifts')}>
          <Clock size={16} />إدارة الصناديق
        </button>
        <button className={`pos-tab-btn${tab === 'inventory' ? ' active' : ''}`} onClick={() => setTab('inventory')}>
          <Package size={16} />جرد الخزنة
        </button>
      </div>

      {tab === 'shifts' && (
        <div className="pos-container">
          <div className="pos-panel">
            <div className="section-card">
              <div className="section-card-header"><div className="section-card-title">فتح / إقفال صندوق الصراف</div></div>
              <div className="section-card-body">
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">الخزنة / الصندوق</label>
                  <select className="form-select" value={selectedVaultId} onChange={e => setSelectedVaultId(e.target.value)}>
                    {vaults.filter(v => v.isActive).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>

                {activeShift ? (
                  <div>
                    <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--success)', animation: 'pulse 2s infinite' }} />
                        <span style={{ fontWeight: 700, color: 'var(--success)' }}>صندوق الصراف مفتوح</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--gray)' }}>اسم الصراف:</span>
                          <strong>{activeShift.cashier}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--gray)' }}>تاريخ ووقت الفتح:</span>
                          <span>{activeShift.startTime || '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>مطابقة الرصيد الفعلي للإقفال اليومي</h3>
                      
                      {(() => {
                        const vault = vaults.find(v => v.id === activeShift.vaultId);
                        return vault && Object.entries(vault.balances).map(([cur, expectedVal]) => {
                          const actualVal = actualBalances[cur] !== undefined && actualBalances[cur] !== '' ? parseFloat(actualBalances[cur]) : '';
                          const expected = (expectedVal as number) || 0;
                          const diff = actualVal !== '' ? (actualVal as number) - expected : 0;
                          
                          let statusBadge = null;
                          if (actualVal !== '') {
                            if (Math.abs(diff) < 0.001) statusBadge = <span className="badge active">مطابق</span>;
                            else if (diff < 0) statusBadge = <span className="badge inactive">عجز ({diff.toFixed(2)} {cur})</span>;
                            else statusBadge = <span className="badge pending">فائض (+{diff.toFixed(2)} {cur})</span>;
                          }

                          return (
                            <div key={cur} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'var(--input)', padding: '0.75rem', borderRadius: 8 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                <span>العملة: <strong>{cur}</strong></span>
                                <span style={{ color: 'var(--gray)' }}>الرصيد الدفتري المتوقع: {expected.toLocaleString()}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input
                                  className="form-input"
                                  style={{ flex: 1, padding: '0.4rem 0.6rem' }}
                                  type="number"
                                  placeholder={`أدخل الرصيد الفعلي لـ ${cur}`}
                                  value={actualBalances[cur] || ''}
                                  onChange={e => setActualBalances(p => ({ ...p, [cur]: e.target.value }))}
                                />
                                {statusBadge}
                              </div>
                            </div>
                          );
                        });
                      })()}

                      <button className="btn btn-danger" onClick={handleCloseShift} style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem' }}>
                        <Square size={18} />إقفال الصندوق وإرسال للمراجعة
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label className="form-label">اسم الصراف</label>
                      <input className="form-input" type="text" placeholder="أدخل اسم الصراف" value={cashierName} onChange={e => setCashierName(e.target.value)} />
                    </div>
                    <button className="btn btn-success" onClick={handleOpenShift} style={{ width: '100%', padding: '0.85rem' }}>
                      <Play size={18} />فتح الصندوق
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Shifts History */}
          <div>
            <div className="section-card">
              <div className="section-card-header">
                <div className="section-card-title"><Clock size={18} color="var(--accent)" />سجل الصناديق</div>
              </div>
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {shifts.length === 0 ? (
                  <div className="empty-state"><Clock size={32} /><span>لا توجد سجلات للصناديق</span></div>
                ) : shifts.map(s => (
                  <div key={s.id} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ fontWeight: 700 }}>{s.vaultName}</div>
                      <span className={`badge ${s.status === 'open' ? 'active' : s.status === 'pending_approval' ? 'pending' : 'inactive'}`}>
                        {s.status === 'open' ? 'مفتوحة' : s.status === 'pending_approval' ? 'بانتظار إقفال' : 'مقفلة'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray)', display: 'flex', gap: '1.5rem' }}>
                      <span>الصراف: {s.cashier}</span>
                      <span>فتح: {s.startTime?.substring(11, 16) || '—'}</span>
                      {s.endTime && <span>إغلاق: {s.endTime.substring(11, 16)}</span>}
                    </div>
                    {s.status === 'pending_approval' && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--warning)' }}>
                        <AlertTriangle size={14} />بانتظار موافقة المدير على الإقفال
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'inventory' && (
        <div className="pos-container">
          <div className="pos-panel">
            <div className="section-card">
              <div className="section-card-header"><div className="section-card-title"><Package size={18} />تقديم جرد الخزنة</div></div>
              <div className="section-card-body">
                <div style={{ background: 'var(--info-bg)', border: '1px solid var(--info)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: 'var(--info)' }}>
                  أدخل المبالغ الفعلية الموجودة في الخزنة بعد عدها يدوياً. سيتم مقارنتها بالأرصدة النظامية.
                </div>
                <div className="form-group">
                  <label className="form-label">الخزنة</label>
                  <select className="form-select" value={invVaultId} onChange={e => setInvVaultId(e.target.value)}>
                    {vaults.filter(v => v.isActive).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>

                {invVault && Object.entries(invVault.balances).map(([cur, sysVal]) => (
                  <div key={cur} style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>المبلغ الفعلي ({cur})</label>
                      <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>نظامي: {(sysVal as number).toLocaleString()}</span>
                    </div>
                    <input
                      className="form-input" type="number" placeholder={`الرصيد الفعلي من ${cur}`}
                      value={invCounts[cur] || ''}
                      onChange={e => setInvCounts(p => ({ ...p, [cur]: e.target.value }))}
                    />
                    {invCounts[cur] && (
                      <div style={{ fontSize: '0.78rem', marginTop: '0.35rem', color: Math.abs(parseFloat(invCounts[cur]) - (sysVal as number)) < 0.01 ? 'var(--success)' : 'var(--danger)' }}>
                        الفرق: {(parseFloat(invCounts[cur]) - (sysVal as number)).toFixed(2)} {cur}
                      </div>
                    )}
                  </div>
                ))}

                <button className="btn btn-primary" onClick={handleSubmitInventory} style={{ width: '100%', marginTop: '0.75rem', padding: '0.85rem' }}>
                  <CheckCircle size={18} />إرسال نتيجة الجرد
                </button>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-card-header">
              <div className="section-card-title">نظرة على الأرصدة الحالية</div>
            </div>
            <div className="section-card-body">
              {vaults.filter(v => v.isActive).map(v => (
                <div key={v.id} style={{ marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{v.name}</div>
                  {Object.entries(v.balances).map(([cur, bal]) => (
                    <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                      <span style={{ color: 'var(--gray)' }}>{cur}</span>
                      <strong style={{ color: (bal as number) < 0 ? 'var(--danger)' : 'var(--primary)' }}>
                        {(bal as number).toLocaleString()}
                      </strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
