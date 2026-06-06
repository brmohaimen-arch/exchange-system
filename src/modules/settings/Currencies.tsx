import { useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { TrendingUp, Plus, Edit3, CheckCircle, RefreshCw, Trash2, ToggleLeft, X, Globe } from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';

interface Props { showToast: (type: ToastMessage['type'], message: string) => void; }

const EMPTY_CURRENCY = { code: '', nameAr: '', nameEn: '', symbol: '', country: '', flag: '🌐', decimalPlaces: 2 };

export default function Currencies({ showToast }: Props) {
  const { currencies, rates, currentRole, addCurrency, editCurrency, disableCurrency, deleteCurrency, addRate, updateRate, disableExchangeRate } = useSystem();
  const isAdmin = currentRole === 'مدير النظام';

  const [tab, setTab] = useState<'currencies' | 'rates'>('rates');

  // Exchange Rate state
  const [showAddRate, setShowAddRate] = useState(false);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [newFrom, setNewFrom] = useState('USD');
  const [newTo, setNewTo] = useState('LYD');
  const [newBuy, setNewBuy] = useState('');
  const [newSell, setNewSell] = useState('');
  const [editBuy, setEditBuy] = useState('');
  const [editSell, setEditSell] = useState('');

  // Currency CRUD state
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<any | null>(null);
  const [currencyForm, setCurrencyForm] = useState({ ...EMPTY_CURRENCY });

  // Confirmation Modal state
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');

  const handleAddRate = async () => {
    if (!parseFloat(newBuy) || !parseFloat(newSell)) { showToast('danger', 'يرجى إدخال أسعار الشراء والبيع'); return; }
    const res = await addRate({ fromCurrency: newFrom, toCurrency: newTo, buyRate: parseFloat(newBuy), sellRate: parseFloat(newSell) });
    if (res.success) {
      showToast('success', `تم إضافة سعر صرف ${newFrom}/${newTo} بنجاح`);
      setNewBuy(''); setNewSell(''); setShowAddRate(false);
    } else {
      showToast('danger', res.error || 'فشل إضافة سعر الصرف');
    }
  };

  const handleUpdateRate = async (rateId: string) => {
    if (!parseFloat(editBuy) || !parseFloat(editSell)) { showToast('danger', 'يرجى إدخال الأسعار'); return; }
    const res = await updateRate(rateId, parseFloat(editBuy), parseFloat(editSell));
    if (res.success) {
      showToast('success', 'تم تحديث سعر الصرف بنجاح');
      setEditingRateId(null);
    } else {
      showToast('danger', res.error || 'فشل تحديث سعر الصرف');
    }
  };

  const openAddCurrency = () => {
    setEditingCurrency(null);
    setCurrencyForm({ ...EMPTY_CURRENCY });
    setShowCurrencyModal(true);
  };

  const openEditCurrency = (c: any) => {
    setEditingCurrency(c);
    setCurrencyForm({ code: c.code, nameAr: c.nameAr, nameEn: c.nameEn, symbol: c.symbol, country: c.country, flag: c.flag, decimalPlaces: c.decimalPlaces });
    setShowCurrencyModal(true);
  };

  const handleSaveCurrency = () => {
    if (!currencyForm.code.trim() || !currencyForm.nameAr.trim()) { showToast('danger', 'يرجى تعبئة الحقول المطلوبة (الرمز والاسم العربي)'); return; }
    if (editingCurrency) {
      editCurrency({ ...editingCurrency, ...currencyForm, lastUpdated: new Date().toISOString().substring(0, 16).replace('T', ' ') });
      showToast('success', `تم تحديث بيانات العملة ${currencyForm.code}`);
    } else {
      const exists = currencies.find(c => c.code === currencyForm.code.toUpperCase());
      if (exists) { showToast('danger', `العملة ${currencyForm.code} موجودة بالفعل`); return; }
      addCurrency({ ...currencyForm, code: currencyForm.code.toUpperCase(), isActive: true, lastUpdated: new Date().toISOString().substring(0, 16).replace('T', ' ') });
      showToast('success', `تمت إضافة العملة ${currencyForm.code.toUpperCase()} بنجاح`);
    }
    setShowCurrencyModal(false);
  };

  const triggerDelete = (code: string) => {
    setConfirmCode(code);
    setShowConfirm(true);
  };

  const handleConfirmDelete = async () => {
    setShowConfirm(false);
    const ok = await deleteCurrency(confirmCode);
    if (ok) {
      showToast('success', `تم حذف العملة ${confirmCode} بنجاح`);
    } else {
      showToast('danger', `لا يمكن حذف العملة ${confirmCode} لأنها مسجلة كحركات مالية أو أرصدة سابقة بالنظام. يُقترح تعطيل العملة (إيقاف نشاطها) بدلاً من الحذف لضمان سلامة العمليات.`);
    }
  };

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>العملات وأسعار الصرف</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {isAdmin && tab === 'rates' && (
            <button className="btn btn-primary" onClick={() => setShowAddRate(s => !s)}>
              <Plus size={16} />{showAddRate ? 'إلغاء' : 'إضافة سعر صرف'}
            </button>
          )}
          {isAdmin && tab === 'currencies' && (
            <button className="btn btn-primary" onClick={openAddCurrency}>
              <Plus size={16} />إضافة عملة جديدة
            </button>
          )}
        </div>
      </div>

      <div className="pos-tabs-row" style={{ maxWidth: 350 }}>
        <button className={`pos-tab-btn${tab === 'rates' ? ' active' : ''}`} onClick={() => setTab('rates')}>
          <TrendingUp size={16} />أسعار الصرف
        </button>
        <button className={`pos-tab-btn${tab === 'currencies' ? ' active' : ''}`} onClick={() => setTab('currencies')}>
          <RefreshCw size={16} />العملات
        </button>
      </div>

      {/* === RATES TAB === */}
      {tab === 'rates' && (
        <>
          {isAdmin && showAddRate && (
            <div className="section-card" style={{ border: '2px solid var(--accent)' }}>
              <div className="section-card-header"><div className="section-card-title">إضافة سعر صرف جديد</div></div>
              <div className="section-card-body">
                <div className="form-group-grid">
                  <div className="form-group">
                    <label className="form-label">العملة المصدر</label>
                    <select className="form-select" value={newFrom} onChange={e => setNewFrom(e.target.value)}>
                      {currencies.filter(c => c.isActive).map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">العملة الهدف</label>
                    <select className="form-select" value={newTo} onChange={e => setNewTo(e.target.value)}>
                      {currencies.filter(c => c.isActive).map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">سعر الشراء</label>
                    <input className="form-input" type="number" step="0.001" placeholder="0.000" value={newBuy} onChange={e => setNewBuy(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">سعر البيع</label>
                    <input className="form-input" type="number" step="0.001" placeholder="0.000" value={newSell} onChange={e => setNewSell(e.target.value)} />
                  </div>
                </div>
                <button className="btn btn-success" onClick={handleAddRate} style={{ marginTop: '0.75rem' }}>
                  <CheckCircle size={16} />إضافة
                </button>
              </div>
            </div>
          )}

          <div className="section-card">
            <div className="section-card-header">
              <div className="section-card-title"><TrendingUp size={18} color="var(--accent)" />جدول أسعار الصرف</div>
              <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>آخر تحديث: {new Date().toLocaleTimeString('ar-LY')}</span>
            </div>
            <table className="financial-table">
              <thead>
                <tr><th>الزوج</th><th>سعر الشراء</th><th>سعر البيع</th><th>الفارق</th><th>آخر تحديث</th><th>الحالة</th>{isAdmin && <th>إجراءات</th>}</tr>
              </thead>
              <tbody>
                {rates.map(r => (
                  <>
                    <tr key={r.id} style={{ background: editingRateId === r.id ? 'var(--sidebar-hover)' : 'transparent' }}>
                      <td>
                        <strong style={{ fontSize: '1rem' }}>
                          {currencies.find(c => c.code === r.fromCurrency)?.flag} {r.fromCurrency}
                        </strong>
                        <span style={{ color: 'var(--gray)', margin: '0 0.4rem' }}>/</span>
                        {currencies.find(c => c.code === r.toCurrency)?.flag} {r.toCurrency}
                      </td>
                      <td style={{ fontWeight: 800, color: 'var(--success)', fontSize: '1rem' }}>{r.buyRate}</td>
                      <td style={{ fontWeight: 800, color: 'var(--danger)', fontSize: '1rem' }}>{r.sellRate}</td>
                      <td style={{ color: 'var(--warning)', fontWeight: 700 }}>{(r.sellRate - r.buyRate).toFixed(3)}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>{r.lastUpdated?.substring(11, 16) || '—'}</td>
                      <td><span className={`badge ${r.isActive ? 'active' : 'inactive'}`}>{r.isActive ? 'نشط' : 'موقوف'}</span></td>
                      {isAdmin && (
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                              onClick={() => { if (editingRateId === r.id) { setEditingRateId(null); } else { setEditingRateId(r.id); setEditBuy(String(r.buyRate)); setEditSell(String(r.sellRate)); } }}>
                              <Edit3 size={13} />{editingRateId === r.id ? 'إلغاء' : 'تعديل'}
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: r.isActive ? 'var(--warning)' : 'var(--success)' }}
                              onClick={() => { disableExchangeRate(r.id); showToast('info', `تم ${r.isActive ? 'تعطيل' : 'تفعيل'} سعر الصرف`); }}>
                              <ToggleLeft size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isAdmin && editingRateId === r.id && (
                      <tr>
                        <td colSpan={isAdmin ? 7 : 6} style={{ background: 'var(--sidebar-hover)', padding: '0.75rem 1.25rem' }}>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">سعر الشراء الجديد</label>
                              <input className="form-input" style={{ width: 150 }} type="number" step="0.001" value={editBuy} onChange={e => setEditBuy(e.target.value)} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">سعر البيع الجديد</label>
                              <input className="form-input" style={{ width: 150 }} type="number" step="0.001" value={editSell} onChange={e => setEditSell(e.target.value)} />
                            </div>
                            <button className="btn btn-success" onClick={() => handleUpdateRate(r.id)}>
                              <CheckCircle size={16} />تحديث السعر
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* === CURRENCIES TAB === */}
      {tab === 'currencies' && (
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title"><Globe size={18} color="var(--accent)" />العملات المتاحة في النظام</div>
            <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>{currencies.length} عملة مسجلة</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', padding: '1.25rem' }}>
            {currencies.map(c => (
              <div key={c.code} style={{
                background: c.isActive ? 'var(--sidebar-hover)' : 'var(--input)',
                border: `1px solid ${c.isActive ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 12, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
                opacity: c.isActive ? 1 : 0.6, position: 'relative', transition: 'var(--transition)'
              }}>
                <div style={{ fontSize: '2.2rem' }}>{c.flag}</div>
                <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{c.code}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{c.nameAr}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{c.nameEn} · {c.symbol}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>{c.country}</div>
                <span className={`badge ${c.isActive ? 'active' : 'inactive'}`} style={{ alignSelf: 'flex-start', marginTop: '0.25rem' }}>
                  {c.isActive ? 'نشطة' : 'غير نشطة'}
                </span>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', flex: 1 }}
                      onClick={() => openEditCurrency(c)}>
                      <Edit3 size={12} />تعديل
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', color: c.isActive ? 'var(--warning)' : 'var(--success)', flex: 1 }}
                      onClick={() => { disableCurrency(c.code); showToast('info', `تم ${c.isActive ? 'تعطيل' : 'تفعيل'} العملة ${c.code}`); }}>
                      <ToggleLeft size={12} />{c.isActive ? 'تعطيل' : 'تفعيل'}
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', color: 'var(--danger)', flex: 1 }}
                      onClick={() => triggerDelete(c.code)}>
                      <Trash2 size={12} />حذف
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === CURRENCY MODAL === */}
      {isAdmin && showCurrencyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="section-card" style={{ width: '100%', maxWidth: 520, border: '2px solid var(--accent)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="section-card-header">
              <div className="section-card-title">{editingCurrency ? `تعديل العملة — ${editingCurrency.code}` : 'إضافة عملة جديدة'}</div>
              <button onClick={() => setShowCurrencyModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}><X size={20} /></button>
            </div>
            <div className="section-card-body">
              <div className="form-group-grid">
                <div className="form-group">
                  <label className="form-label">رمز العملة (مثال: USD) *</label>
                  <input className="form-input" type="text" maxLength={5} placeholder="USD" value={currencyForm.code}
                    onChange={e => setCurrencyForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    disabled={!!editingCurrency} />
                </div>
                <div className="form-group">
                  <label className="form-label">الرمز (مثال: $)</label>
                  <input className="form-input" type="text" maxLength={5} placeholder="$" value={currencyForm.symbol}
                    onChange={e => setCurrencyForm(f => ({ ...f, symbol: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">الاسم بالعربية *</label>
                  <input className="form-input" type="text" placeholder="دولار أمريكي" value={currencyForm.nameAr}
                    onChange={e => setCurrencyForm(f => ({ ...f, nameAr: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">الاسم بالإنجليزية</label>
                  <input className="form-input" type="text" placeholder="US Dollar" value={currencyForm.nameEn}
                    onChange={e => setCurrencyForm(f => ({ ...f, nameEn: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">الدولة</label>
                  <input className="form-input" type="text" placeholder="الولايات المتحدة" value={currencyForm.country}
                    onChange={e => setCurrencyForm(f => ({ ...f, country: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">علم (Emoji)</label>
                  <input className="form-input" type="text" maxLength={4} placeholder="🇺🇸" value={currencyForm.flag}
                    onChange={e => setCurrencyForm(f => ({ ...f, flag: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">خانات الكسر العشري</label>
                  <select className="form-select" value={currencyForm.decimalPlaces} onChange={e => setCurrencyForm(f => ({ ...f, decimalPlaces: parseInt(e.target.value) }))}>
                    <option value={0}>0</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="btn btn-success" onClick={handleSaveCurrency}><CheckCircle size={16} />{editingCurrency ? 'حفظ التعديلات' : 'إضافة العملة'}</button>
                <button className="btn btn-secondary" onClick={() => setShowCurrencyModal(false)}><X size={16} />إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Reusable Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirm}
        title="تأكيد حذف العملة"
        message={`هل أنت متأكد من رغبتك في حذف العملة ${confirmCode} نهائياً من النظام؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="تأكيد الحذف"
        cancelLabel="إلغاء"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
