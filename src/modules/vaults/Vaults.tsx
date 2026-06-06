import { useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { Banknote, Plus, X, CheckCircle, Edit3, ToggleLeft } from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';

interface Props { showToast: (type: ToastMessage['type'], message: string) => void; }

export default function Vaults({ showToast }: Props) {
  const { vaults, currencies, currentRole, addVault, editVault, disableVault, updateVaultBalance } = useSystem();
  const isAdmin = currentRole === 'مدير النظام';

  const [showAdd, setShowAdd] = useState(false);
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const [editingVault, setEditingVault] = useState<any | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Confirm Modal state
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmVaultId, setConfirmVaultId] = useState('');
  const [confirmVaultName, setConfirmVaultName] = useState('');

  // Add vault form
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'main' | 'branch' | 'cashier'>('branch');
  const [newBranch, setNewBranch] = useState('');

  // Edit vault form
  const [editForm, setEditForm] = useState<{ name: string; type: 'main' | 'branch' | 'cashier'; branch: string; manager: string; balances: Record<string, number> }>({
    name: '', type: 'branch', branch: '', manager: '', balances: {}
  });

  // Adjustment form
  const [adjCurrency, setAdjCurrency] = useState('LYD');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjType, setAdjType] = useState<'add' | 'subtract'>('add');
  const [adjNote, setAdjNote] = useState('');

  const selectedVault = vaults.find(v => v.id === selectedVaultId);

  const handleAddVault = () => {
    if (!newName.trim()) { showToast('danger', 'يرجى إدخال اسم الخزنة'); return; }
    addVault({ name: newName.trim(), type: newType, branch: newBranch.trim() || 'الإدارة العامة' });
    showToast('success', `تمت إضافة الخزنة "${newName}" بنجاح`);
    setNewName(''); setNewBranch(''); setShowAdd(false);
  };

  const openEditVault = (vault: any) => {
    setEditingVault(vault);
    setEditForm({
      name: vault.name,
      type: vault.type,
      branch: vault.branch,
      manager: vault.manager || '',
      balances: { ...vault.balances }
    });
    setShowEditModal(true);
  };

  const handleEditVault = () => {
    if (!editForm.name.trim()) { showToast('danger', 'يرجى إدخال اسم الخزنة'); return; }
    editVault({ ...editingVault, ...editForm });
    showToast('success', `تم تحديث بيانات الخزنة "${editForm.name}"`);
    setShowEditModal(false);
  };

  const handleConfirmDisable = () => {
    setShowConfirm(false);
    disableVault(confirmVaultId);
    showToast('warning', `تم إيقاف وتعطيل نشاط الخزنة "${confirmVaultName}" بنجاح`);
  };

  const handleAdjustment = () => {
    if (!selectedVaultId) { showToast('danger', 'يرجى اختيار خزنة'); return; }
    const amt = parseFloat(adjAmount);
    if (!amt || amt <= 0) { showToast('danger', 'يرجى إدخال مبلغ صحيح'); return; }
    const finalAmt = adjType === 'subtract' ? -amt : amt;
    updateVaultBalance(selectedVaultId, adjCurrency, finalAmt);
    showToast('success', `تم ${adjType === 'add' ? 'إضافة' : 'خصم'} ${amt.toLocaleString()} ${adjCurrency} ${adjType === 'add' ? 'إلى' : 'من'} الخزنة`);
    setAdjAmount(''); setAdjNote('');
  };

  const vaultTypeLabel = { main: 'خزنة رئيسية', branch: 'خزنة فرع', cashier: 'صندوق صراف' };
  const totalByCurrency: Record<string, number> = {};
  vaults.forEach(v => {
    Object.entries(v.balances).forEach(([cur, bal]) => {
      totalByCurrency[cur] = (totalByCurrency[cur] || 0) + (bal as number);
    });
  });

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>إدارة الخزنات</h1>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowAdd(s => !s)}>
            <Plus size={16} />{showAdd ? 'إلغاء' : 'إضافة خزنة'}
          </button>
        )}
      </div>

      {/* Totals */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {Object.entries(totalByCurrency).map(([cur, total]) => (
          <div key={cur} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 140 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>إجمالي {cur}</span>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)' }}>{total.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Add Vault Form */}
      {isAdmin && showAdd && (
        <div className="section-card" style={{ border: '2px solid var(--accent)' }}>
          <div className="section-card-header"><div className="section-card-title"><Plus size={18} />إضافة خزنة جديدة</div></div>
          <div className="section-card-body">
            <div className="form-group-grid">
              <div className="form-group">
                <label className="form-label">اسم الخزنة</label>
                <input className="form-input" type="text" placeholder="مثال: خزنة مصراتة" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">النوع</label>
                <select className="form-select" value={newType} onChange={e => setNewType(e.target.value as any)}>
                  <option value="main">خزنة رئيسية</option>
                  <option value="branch">خزنة فرع</option>
                  <option value="cashier">صندوق صراف</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">الفرع</label>
                <input className="form-input" type="text" placeholder="اسم الفرع" value={newBranch} onChange={e => setNewBranch(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
              <button className="btn btn-success" onClick={handleAddVault}><CheckCircle size={16} />إضافة</button>
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}><X size={16} />إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Vaults Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {vaults.map(vault => (
          <div
            key={vault.id}
            className="section-card"
            style={{
              cursor: 'pointer',
              border: selectedVaultId === vault.id ? '2px solid var(--accent)' : '1px solid var(--border)',
              opacity: vault.isActive ? 1 : 0.65,
              transition: 'var(--transition)'
            }}
            onClick={() => isAdmin && setSelectedVaultId(v => v === vault.id ? null : vault.id)}
          >
            <div className="section-card-header">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div className="section-card-title"><Banknote size={18} color="var(--accent)" />{vault.name}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--gray)', paddingRight: '1.6rem' }}>{vaultTypeLabel[vault.type]} — {vault.branch}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className={`badge ${vault.isActive ? 'active' : 'inactive'}`}>{vault.isActive ? 'نشطة' : 'موقوفة'}</span>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '0.3rem' }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem' }}
                      onClick={() => openEditVault(vault)}><Edit3 size={12} /></button>
                    <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', color: vault.isActive ? 'var(--warning)' : 'var(--success)' }}
                      onClick={() => {
                        if (vault.isActive) {
                          setConfirmVaultId(vault.id);
                          setConfirmVaultName(vault.name);
                          setShowConfirm(true);
                        } else {
                          disableVault(vault.id);
                          showToast('success', `تم إعادة تفعيل نشاط الخزنة "${vault.name}"`);
                        }
                      }}>
                      <ToggleLeft size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="section-card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {Object.entries(vault.balances).map(([cur, bal]) => (
                  <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--gray)', fontWeight: 600 }}>{cur}</span>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: (bal as number) < 0 ? 'var(--danger)' : 'var(--primary)' }}>
                      {(bal as number).toLocaleString('ar-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Adjustment Panel (Admin Only) */}
      {isAdmin && selectedVault && (
        <div className="section-card" style={{ border: '2px solid var(--accent)' }}>
          <div className="section-card-header">
            <div className="section-card-title">تعديل رصيد — {selectedVault.name}</div>
            <button onClick={() => setSelectedVaultId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}>
              <X size={18} />
            </button>
          </div>
          <div className="section-card-body">
            <div className="form-group-grid">
              <div className="form-group">
                <label className="form-label">العملة</label>
                <select className="form-select" value={adjCurrency} onChange={e => setAdjCurrency(e.target.value)}>
                  {currencies.filter(c => c.isActive).map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">العملية</label>
                <select className="form-select" value={adjType} onChange={e => setAdjType(e.target.value as any)}>
                  <option value="add">إضافة رصيد</option>
                  <option value="subtract">خصم رصيد</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">المبلغ</label>
                <input className="form-input" type="number" placeholder="0.00" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">سبب التعديل</label>
                <input className="form-input" type="text" placeholder="اختياري" value={adjNote} onChange={e => setAdjNote(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleAdjustment} style={{ marginTop: '0.75rem' }}>
              <CheckCircle size={16} />تأكيد التعديل
            </button>
          </div>
        </div>
      )}

      {!isAdmin && (
        <div style={{ background: 'var(--info-bg)', border: '1px solid var(--info)', borderRadius: 10, padding: '1rem 1.25rem', fontSize: '0.85rem', color: 'var(--info)', textAlign: 'center' }}>
          ملاحظة: إدارة الخزنات وتعديل الأرصدة متاح لمدير النظام فقط.
        </div>
      )}

      {/* Edit Vault Modal */}
      {isAdmin && showEditModal && editingVault && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="section-card" style={{ width: '100%', maxWidth: 520, border: '2px solid var(--accent)' }}>
            <div className="section-card-header">
              <div className="section-card-title">تعديل بيانات الخزنة</div>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}><X size={20} /></button>
            </div>
            <div className="section-card-body">
              <div className="form-group-grid">
                <div className="form-group">
                  <label className="form-label">اسم الخزنة</label>
                  <input className="form-input" type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">النوع</label>
                  <select className="form-select" value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value as any }))}>
                    <option value="main">خزنة رئيسية</option>
                    <option value="branch">خزنة فرع</option>
                    <option value="cashier">صندوق صراف</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">الفرع</label>
                  <input className="form-input" type="text" value={editForm.branch} onChange={e => setEditForm(f => ({ ...f, branch: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">المدير المسؤول</label>
                  <input className="form-input" type="text" value={editForm.manager} onChange={e => setEditForm(f => ({ ...f, manager: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">العملات المفعلة بالخزنة</label>
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                    {currencies.filter(c => c.isActive).map(c => {
                      const isTracked = editForm.balances && editForm.balances.hasOwnProperty(c.code);
                      return (
                        <label key={c.code} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'var(--input)', padding: '0.25rem 0.5rem', borderRadius: '6px', cursor: 'pointer', border: isTracked ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
                          <input
                            type="checkbox"
                            checked={isTracked}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setEditForm(f => {
                                const updatedBalances = { ...f.balances };
                                if (checked) {
                                  updatedBalances[c.code] = updatedBalances[c.code] || 0.0;
                                } else {
                                  delete updatedBalances[c.code];
                                }
                                return { ...f, balances: updatedBalances };
                              });
                            }}
                          />
                          <span style={{ fontSize: '0.8rem' }}>{c.flag} {c.code}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="btn btn-success" onClick={handleEditVault}><CheckCircle size={16} />حفظ التعديلات</button>
                <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}><X size={16} />إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirm}
        title="تعطيل الخزنة المالية"
        message={`هل أنت متأكد من رغبتك في تعطيل الخزنة "${confirmVaultName}"؟ سيؤدي ذلك لإيقاف جميع عمليات الصرف والتحويل المعلقة عليها مؤقتاً.`}
        confirmLabel="تأكيد التعطيل"
        cancelLabel="إلغاء"
        danger
        onConfirm={handleConfirmDisable}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
