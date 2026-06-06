import { useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { Building2, Plus, ChevronDown, ChevronUp, Edit3, Trash2, ToggleLeft, CheckCircle, X } from 'lucide-react';

interface Props { showToast: (type: ToastMessage['type'], message: string) => void; }

export default function BanksManagement({ showToast }: Props) {
  const {
    banks, bankBranches, bankAccounts, currencies, currentRole,
    addBank, editBank, disableBank, deleteBank,
    addBankBranch, editBankBranch, disableBankBranch, deleteBankBranch,
    addBankAccount, editBankAccount, disableBankAccount, deleteBankAccount,
  } = useSystem();
  const isAdmin = currentRole === 'مدير النظام';

  const [expandedBank, setExpandedBank] = useState<string | null>(banks[0]?.id || null);

  // Bank Modal
  const [showBankModal, setShowBankModal] = useState(false);
  const [editingBank, setEditingBank] = useState<any | null>(null);
  const [bankForm, setBankForm] = useState({ name: '', code: '', country: 'ليبيا', city: '', phone: '', notes: '' });

  // Branch Modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any | null>(null);
  const [branchForm, setBranchForm] = useState({ bankId: '', bankName: '', name: '', city: '', address: '', phone: '', manager: '' });

  // Account Modal
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [accForm, setAccForm] = useState({ bankId: '', branchId: '', accountName: '', accountNumber: '', currency: 'LYD', balance: '', notes: '' });

  // Bank Handlers
  const openAddBank = () => { setEditingBank(null); setBankForm({ name: '', code: '', country: 'ليبيا', city: '', phone: '', notes: '' }); setShowBankModal(true); };
  const openEditBank = (b: any) => { setEditingBank(b); setBankForm({ name: b.name, code: b.code, country: b.country, city: b.city, phone: b.phone, notes: b.notes || '' }); setShowBankModal(true); };
  const handleSaveBank = () => {
    if (!bankForm.name.trim() || !bankForm.code.trim()) { showToast('danger', 'يرجى تعبئة اسم البنك والرمز'); return; }
    if (editingBank) { editBank({ ...editingBank, ...bankForm }); showToast('success', `تم تحديث بيانات ${bankForm.name}`); }
    else { addBank(bankForm); showToast('success', `تمت إضافة ${bankForm.name} بنجاح`); }
    setShowBankModal(false);
  };
  const handleDeleteBank = (id: string, name: string) => {
    if (!deleteBank(id)) showToast('danger', `لا يمكن حذف ${name} — يحتوي على حسابات بنكية`);
    else showToast('success', `تم حذف ${name}`);
  };

  // Branch Handlers
  const openAddBranch = (bankId: string) => {
    const b = banks.find(b => b.id === bankId);
    setEditingBranch(null);
    setBranchForm({ bankId, bankName: b?.name || '', name: '', city: '', address: '', phone: '', manager: '' });
    setShowBranchModal(true);
  };
  const openEditBranch = (br: any) => { setEditingBranch(br); setBranchForm({ bankId: br.bankId, bankName: br.bankName, name: br.name, city: br.city, address: br.address, phone: br.phone, manager: br.manager }); setShowBranchModal(true); };
  const handleSaveBranch = () => {
    if (!branchForm.name.trim()) { showToast('danger', 'يرجى إدخال اسم الفرع'); return; }
    if (editingBranch) { editBankBranch({ ...editingBranch, ...branchForm }); showToast('success', 'تم تحديث بيانات الفرع'); }
    else { addBankBranch(branchForm); showToast('success', 'تمت إضافة الفرع بنجاح'); }
    setShowBranchModal(false);
  };
  const handleDeleteBranch = (id: string, name: string) => {
    if (!deleteBankBranch(id)) showToast('danger', `لا يمكن حذف ${name} — يحتوي على حسابات`);
    else showToast('success', `تم حذف ${name}`);
  };

  // Account Handlers
  const openAddAccount = (bankId?: string) => {
    setEditingAccount(null);
    setAccForm({ bankId: bankId || banks[0]?.id || '', branchId: '', accountName: '', accountNumber: '', currency: 'LYD', balance: '', notes: '' });
    setShowAccountModal(true);
  };
  const openEditAccount = (acc: any) => { setEditingAccount(acc); setAccForm({ bankId: acc.bankId, branchId: acc.branchId || '', accountName: acc.accountName, accountNumber: acc.accountNumber, currency: acc.currency, balance: String(acc.balance), notes: acc.notes || '' }); setShowAccountModal(true); };
  const handleSaveAccount = () => {
    if (!accForm.accountName.trim() || !accForm.accountNumber.trim()) { showToast('danger', 'يرجى تعبئة اسم الحساب ورقمه'); return; }
    const bankName = banks.find(b => b.id === accForm.bankId)?.name || '';
    const branchName = bankBranches.find(b => b.id === accForm.branchId)?.name || '';
    const payload = { ...accForm, bankName, branchName, balance: parseFloat(accForm.balance) || 0 };
    if (editingAccount) { editBankAccount({ ...editingAccount, ...payload }); showToast('success', 'تم تحديث بيانات الحساب'); }
    else { addBankAccount(payload); showToast('success', 'تمت إضافة الحساب البنكي بنجاح'); }
    setShowAccountModal(false);
  };
  const handleDeleteAccount = (id: string) => {
    if (!deleteBankAccount(id)) showToast('danger', 'لا يمكن حذف هذا الحساب — مرتبط بحركات مالية');
    else showToast('success', 'تم حذف الحساب البنكي');
  };

  const totalByBank = banks.map(bank => {
    const accounts = bankAccounts.filter(a => a.bankId === bank.id);
    const totalLYD = accounts.filter(a => a.currency === 'LYD').reduce((s, a) => s + a.balance, 0);
    const totalUSD = accounts.filter(a => a.currency === 'USD').reduce((s, a) => s + a.balance, 0);
    return { bank, accounts, totalLYD, totalUSD };
  });

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>البنوك والحسابات البنكية</h1>
        {isAdmin && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={openAddBank}><Plus size={16} />إضافة مصرف</button>
            <button className="btn btn-secondary" onClick={() => openAddAccount()}><Plus size={16} />إضافة حساب</button>
          </div>
        )}
      </div>

      {/* Banks Accordion */}
      {totalByBank.map(({ bank, accounts, totalLYD, totalUSD }) => (
        <div key={bank.id} className="section-card">
          <div className="section-card-header" style={{ cursor: 'pointer' }}
            onClick={() => setExpandedBank(b => b === bank.id ? null : bank.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Building2 size={20} color="var(--accent)" />
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem' }}>{bank.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginTop: '0.15rem' }}>
                  {bank.code} — {bank.city} — {accounts.length} حساب
                  <span className={`badge ${bank.isActive ? 'active' : 'inactive'}`} style={{ marginRight: '0.5rem', fontSize: '0.68rem' }}>{bank.isActive ? 'نشط' : 'موقوف'}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                {totalLYD > 0 && <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>دينار ليبي</div>
                  <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{totalLYD.toLocaleString()}</div>
                </div>}
                {totalUSD > 0 && <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>دولار</div>
                  <div style={{ fontWeight: 700, color: 'var(--success)' }}>{totalUSD.toLocaleString()}</div>
                </div>}
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => openEditBank(bank)}>
                    <Edit3 size={13} />
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: bank.isActive ? 'var(--warning)' : 'var(--success)' }}
                    onClick={() => { disableBank(bank.id); showToast('info', `تم ${bank.isActive ? 'تعطيل' : 'تفعيل'} ${bank.name}`); }}>
                    <ToggleLeft size={13} />
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: 'var(--danger)' }}
                    onClick={() => handleDeleteBank(bank.id, bank.name)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
              {expandedBank === bank.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </div>

          {expandedBank === bank.id && (
            <div>
              {/* Bank Branches */}
              <div style={{ padding: '0.75rem 1.25rem', background: 'var(--sidebar-hover)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', fontWeight: 700 }}>فروع البنك:</div>
                  {isAdmin && (
                    <button className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }} onClick={() => openAddBranch(bank.id)}>
                      <Plus size={12} />إضافة فرع
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {bankBranches.filter(b => b.bankId === bank.id).length === 0
                    ? <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>لا توجد فروع مسجلة</span>
                    : bankBranches.filter(b => b.bankId === bank.id).map(br => (
                      <div key={br.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.2rem 0.6rem' }}>
                        <span style={{ fontSize: '0.78rem' }}>{br.name} — {br.city}</span>
                        <span className={`badge ${br.isActive ? 'active' : 'inactive'}`} style={{ fontSize: '0.65rem' }}>{br.isActive ? 'نشط' : 'موقوف'}</span>
                        {isAdmin && (
                          <>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: '0 2px' }} onClick={() => openEditBranch(br)}><Edit3 size={12} /></button>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: br.isActive ? 'var(--warning)' : 'var(--success)', padding: '0 2px' }}
                              onClick={() => { disableBankBranch(br.id); showToast('info', `تم ${br.isActive ? 'تعطيل' : 'تفعيل'} الفرع`); }}><ToggleLeft size={12} /></button>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0 2px' }}
                              onClick={() => handleDeleteBranch(br.id, br.name)}><Trash2 size={12} /></button>
                          </>
                        )}
                      </div>
                    ))
                  }
                </div>
              </div>

              {/* Accounts Table */}
              <table className="financial-table">
                <thead>
                  <tr>
                    <th>اسم الحساب</th><th>رقم الحساب</th><th>العملة</th><th>الرصيد</th><th>الحالة</th>
                    {isAdmin && <th>إجراءات</th>}
                  </tr>
                </thead>
                <tbody>
                  {accounts.length === 0 ? (
                    <tr><td colSpan={isAdmin ? 6 : 5}><div className="empty-state">لا توجد حسابات لهذا البنك</div></td></tr>
                  ) : accounts.map(acc => (
                    <tr key={acc.id}>
                      <td style={{ fontWeight: 700 }}>{acc.accountName}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{acc.accountNumber}</td>
                      <td>{acc.currency}</td>
                      <td style={{ fontWeight: 700, color: acc.balance < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {acc.balance.toLocaleString('ar-LY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td><span className={`badge ${acc.isActive ? 'active' : 'inactive'}`}>{acc.isActive ? 'نشط' : 'موقوف'}</span></td>
                      {isAdmin && (
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem' }} onClick={() => openEditAccount(acc)}>
                              <Edit3 size={12} />تعديل
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', color: acc.isActive ? 'var(--warning)' : 'var(--success)' }}
                              onClick={() => { disableBankAccount(acc.id); showToast('info', `تم ${acc.isActive ? 'تعطيل' : 'تفعيل'} الحساب`); }}>
                              <ToggleLeft size={12} />
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', color: 'var(--danger)' }}
                              onClick={() => handleDeleteAccount(acc.id)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {isAdmin && (
                <div style={{ padding: '0.75rem 1.25rem' }}>
                  <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => openAddAccount(bank.id)}>
                    <Plus size={14} />إضافة حساب لـ {bank.name}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* === BANK MODAL === */}
      {isAdmin && showBankModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="section-card" style={{ width: '100%', maxWidth: 480, border: '2px solid var(--accent)' }}>
            <div className="section-card-header">
              <div className="section-card-title">{editingBank ? 'تعديل بيانات المصرف' : 'إضافة مصرف جديد'}</div>
              <button onClick={() => setShowBankModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}><X size={20} /></button>
            </div>
            <div className="section-card-body">
              <div className="form-group-grid">
                {[{ key: 'name', label: 'اسم المصرف *', ph: 'مصرف الجمهورية' }, { key: 'code', label: 'الرمز (SWIFT/اختصار) *', ph: 'JUMH' }, { key: 'country', label: 'الدولة', ph: 'ليبيا' }, { key: 'city', label: 'المدينة', ph: 'طرابلس' }, { key: 'phone', label: 'الهاتف', ph: '021-xxxxxxx' }].map(f => (
                  <div className="form-group" key={f.key}>
                    <label className="form-label">{f.label}</label>
                    <input className="form-input" type="text" placeholder={f.ph} value={(bankForm as any)[f.key]} onChange={e => setBankForm(bf => ({ ...bf, [f.key]: e.target.value }))} />
                  </div>
                ))}
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">ملاحظات</label>
                  <input className="form-input" type="text" placeholder="اختياري" value={bankForm.notes} onChange={e => setBankForm(bf => ({ ...bf, notes: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="btn btn-success" onClick={handleSaveBank}><CheckCircle size={16} />{editingBank ? 'حفظ' : 'إضافة'}</button>
                <button className="btn btn-secondary" onClick={() => setShowBankModal(false)}><X size={16} />إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === BRANCH MODAL === */}
      {isAdmin && showBranchModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="section-card" style={{ width: '100%', maxWidth: 480, border: '2px solid var(--accent)' }}>
            <div className="section-card-header">
              <div className="section-card-title">{editingBranch ? 'تعديل فرع البنك' : `إضافة فرع لـ ${branchForm.bankName}`}</div>
              <button onClick={() => setShowBranchModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}><X size={20} /></button>
            </div>
            <div className="section-card-body">
              <div className="form-group-grid">
                {!editingBranch && (
                  <div className="form-group">
                    <label className="form-label">البنك</label>
                    <select className="form-select" value={branchForm.bankId} onChange={e => { const b = banks.find(b => b.id === e.target.value); setBranchForm(f => ({ ...f, bankId: e.target.value, bankName: b?.name || '' })); }}>
                      {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}
                {[{ key: 'name', label: 'اسم الفرع *', ph: 'فرع المركز' }, { key: 'city', label: 'المدينة', ph: 'طرابلس' }, { key: 'address', label: 'العنوان', ph: 'شارع...' }, { key: 'phone', label: 'الهاتف', ph: '091-xxxxxxx' }, { key: 'manager', label: 'المدير', ph: 'اسم المدير' }].map(f => (
                  <div className="form-group" key={f.key}>
                    <label className="form-label">{f.label}</label>
                    <input className="form-input" type="text" placeholder={f.ph} value={(branchForm as any)[f.key]} onChange={e => setBranchForm(bf => ({ ...bf, [f.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="btn btn-success" onClick={handleSaveBranch}><CheckCircle size={16} />{editingBranch ? 'حفظ' : 'إضافة'}</button>
                <button className="btn btn-secondary" onClick={() => setShowBranchModal(false)}><X size={16} />إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === ACCOUNT MODAL === */}
      {isAdmin && showAccountModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="section-card" style={{ width: '100%', maxWidth: 520, border: '2px solid var(--accent)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="section-card-header">
              <div className="section-card-title">{editingAccount ? 'تعديل الحساب البنكي' : 'إضافة حساب بنكي جديد'}</div>
              <button onClick={() => setShowAccountModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}><X size={20} /></button>
            </div>
            <div className="section-card-body">
              <div className="form-group-grid">
                <div className="form-group">
                  <label className="form-label">البنك</label>
                  <select className="form-select" value={accForm.bankId} onChange={e => setAccForm(f => ({ ...f, bankId: e.target.value, branchId: '' }))}>
                    {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">فرع البنك</label>
                  <select className="form-select" value={accForm.branchId} onChange={e => setAccForm(f => ({ ...f, branchId: e.target.value }))}>
                    <option value="">— بدون فرع محدد —</option>
                    {bankBranches.filter(b => b.bankId === accForm.bankId).map(b => <option key={b.id} value={b.id}>{b.name} — {b.city}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">اسم الحساب *</label>
                  <input className="form-input" type="text" placeholder="مثال: الحساب الرئيسي" value={accForm.accountName} onChange={e => setAccForm(f => ({ ...f, accountName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">رقم الحساب / IBAN *</label>
                  <input className="form-input" type="text" placeholder="LY..." value={accForm.accountNumber} onChange={e => setAccForm(f => ({ ...f, accountNumber: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">العملة</label>
                  <select className="form-select" value={accForm.currency} onChange={e => setAccForm(f => ({ ...f, currency: e.target.value }))}>
                    {currencies.filter(c => c.isActive).map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">الرصيد الافتتاحي</label>
                  <input className="form-input" type="number" placeholder="0.00" value={accForm.balance} onChange={e => setAccForm(f => ({ ...f, balance: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">ملاحظات</label>
                  <input className="form-input" type="text" placeholder="اختياري" value={accForm.notes} onChange={e => setAccForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="btn btn-success" onClick={handleSaveAccount}><CheckCircle size={16} />{editingAccount ? 'حفظ' : 'إضافة'}</button>
                <button className="btn btn-secondary" onClick={() => setShowAccountModal(false)}><X size={16} />إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
