import { useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { Plus, Search, AlertTriangle, CheckCircle, X, Edit3, Trash2, ToggleLeft } from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';

interface Props { showToast: (type: ToastMessage['type'], message: string) => void; }

export default function CustomersManagement({ showToast }: Props) {
  const {
    customers, debts, currentRole,
    addCustomer, editCustomer, disableCustomer, deleteCustomer,
    payDebt
  } = useSystem();
  const isAdmin = currentRole === 'مدير النظام';

  const [search, setSearch] = useState('');
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Edit Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', type: 'individual' as any, idNumber: '', address: '', debtLimit: '', notes: '', profitPct: '0' });

  // Confirmation Modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmCustomerId, setConfirmCustomerId] = useState('');
  const [confirmCustomerName, setConfirmCustomerName] = useState('');

  // Add Customer
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newType, setNewType] = useState<'individual' | 'company'>('individual');
  const [newNationalId, setNewNationalId] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newDebtLimit, setNewDebtLimit] = useState('1000');
  const [newProfitPct, setNewProfitPct] = useState('0');

  const handleAddCustomer = () => {
    if (!newName.trim()) { showToast('danger', 'يرجى إدخال اسم العميل'); return; }
    addCustomer({
      name: newName.trim(), phone: newPhone.trim(), type: newType,
      idNumber: newNationalId.trim(), address: newAddress.trim(),
      debtLimit: parseFloat(newDebtLimit) || 1000,
      profitPct: parseFloat(newProfitPct) || 0
    });
    showToast('success', `تمت إضافة العميل "${newName}" بنجاح`);
    setNewName(''); setNewPhone(''); setNewNationalId(''); setNewAddress(''); setNewProfitPct('0'); setShowAddCustomer(false);
  };

  const openEditCustomer = (c: any) => {
    setEditingCustomer(c);
    setEditForm({
      name: c.name, phone: c.phone, type: c.type,
      idNumber: c.idNumber || '', address: c.address || '',
      debtLimit: String(c.debtLimit), notes: c.notes || '',
      profitPct: String(c.profitPct || 0)
    });
    setShowEditModal(true);
  };

  const handleEditCustomer = () => {
    if (!editForm.name.trim()) { showToast('danger', 'يرجى إدخال اسم العميل'); return; }
    editCustomer({ ...editingCustomer, ...editForm, debtLimit: parseFloat(editForm.debtLimit) || 0, profitPct: parseFloat(editForm.profitPct) || 0 });
    showToast('success', `تم تحديث بيانات ${editForm.name}`);
    setShowEditModal(false);
  };

  const triggerDelete = (id: string, name: string) => {
    setConfirmCustomerId(id);
    setConfirmCustomerName(name);
    setShowConfirm(true);
  };

  const handleConfirmDelete = async () => {
    setShowConfirm(false);
    const ok = await deleteCustomer(confirmCustomerId);
    if (ok) {
      showToast('success', `تم حذف العميل "${confirmCustomerName}" بنجاح`);
    } else {
      showToast('danger', `لا يمكن حذف العميل "${confirmCustomerName}" لأنه مرتبط بعمليات سابقة أو ديون بالنظام. يُنصح بتعطيل حساب العميل بدلاً من الحذف لضمان سلامة الأرصدة وسجل الحركات.`);
    }
  };

  const handleSettleDebt = async (debtId: string) => {
    const d = debts.find(x => x.id === debtId);
    if (!d) return;
    const res = await payDebt(debtId, d.remainingAmount);
    if (res.success) {
      showToast('success', 'تم تسديد الدين بالكامل');
    } else {
      showToast('danger', res.error || 'فشل تسديد الدين');
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.includes(search) || c.phone.includes(search) || (c.idNumber || '').includes(search)
  );

  const selectedCustomerDebts = debts.filter(d => d.customerId === selectedCustomerId);

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>إدارة ملفات العملاء</h1>
        {isAdmin && (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-primary" onClick={() => { setShowAddCustomer(s => !s); }}>
              <Plus size={16} />إضافة عميل جديد
            </button>
          </div>
        )}
      </div>

      {/* Add Customer Form */}
      {isAdmin && showAddCustomer && (
        <div className="section-card" style={{ border: '2px solid var(--accent)' }}>
          <div className="section-card-header"><div className="section-card-title">إضافة عميل جديد</div></div>
          <div className="section-card-body">
            <div className="form-group-grid">
              <div className="form-group">
                <label className="form-label">الاسم الكامل *</label>
                <input className="form-input" type="text" placeholder="الاسم" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">رقم الهاتف</label>
                <input className="form-input" type="text" placeholder="09XXXXXXXX" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">النوع</label>
                <select className="form-select" value={newType} onChange={e => setNewType(e.target.value as any)}>
                  <option value="individual">فرد</option>
                  <option value="company">شركة</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">رقم الهوية الوطنية</label>
                <input className="form-input" type="text" placeholder="اختياري" value={newNationalId} onChange={e => setNewNationalId(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">العنوان</label>
                <input className="form-input" type="text" placeholder="اختياري" value={newAddress} onChange={e => setNewAddress(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">حد الدين المسموح (د.ل)</label>
                <input className="form-input" type="number" placeholder="1000" value={newDebtLimit} onChange={e => setNewDebtLimit(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
              <button className="btn btn-success" onClick={handleAddCustomer}><CheckCircle size={16} />إضافة</button>
              <button className="btn btn-secondary" onClick={() => setShowAddCustomer(false)}><X size={16} />إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Search and List */}
      <div style={{ position: 'relative', maxWidth: 400, marginBottom: '1.25rem', marginTop: '1.25rem' }}>
        <Search size={16} style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)' }} />
        <input className="form-input" type="text" placeholder="بحث بالاسم أو الهاتف أو الهوية..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingRight: '2.5rem' }} />
      </div>

      <div className="section-card">
        <div className="table-responsive">
          <table className="financial-table">
            <thead>
              <tr>
                <th>الاسم</th><th>الهاتف</th><th>النوع</th>
                <th>الرصيد (LYD)</th><th>الرصيد (USD)</th>
                <th>حد الدين</th><th>الحالة</th>
                {isAdmin && <th>إجراءات</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(c => (
                <tr key={c.id} style={{ background: selectedCustomerId === c.id ? 'var(--sidebar-hover)' : 'transparent' }}>
                  <td style={{ fontWeight: 700 }}>{c.name}</td>
                  <td>{c.phone}</td>
                  <td><span className="badge pending">{c.type === 'individual' ? 'فرد' : 'شركة'}</span></td>
                  <td style={{ fontWeight: 700, color: (c.balances['LYD'] || 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {(c.balances['LYD'] || 0).toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 700, color: (c.balances['USD'] || 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {(c.balances['USD'] || 0).toLocaleString()}
                  </td>
                  <td>{c.debtLimit.toLocaleString()}</td>
                  <td><span className={`badge ${c.isActive ? 'active' : 'inactive'}`}>{c.isActive ? 'نشط' : 'موقوف'}</span></td>
                  {isAdmin && (
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem' }} onClick={() => openEditCustomer(c)}>
                          <Edit3 size={12} />
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', color: c.isActive ? 'var(--warning)' : 'var(--success)' }}
                          onClick={() => { disableCustomer(c.id); showToast('info', `تم ${c.isActive ? 'تعطيل' : 'تفعيل'} ${c.name}`); }}>
                          <ToggleLeft size={12} />
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', color: 'var(--danger)' }}
                          onClick={() => triggerDelete(c.id, c.name)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  )}
                  <td style={{ fontSize: '0.75rem', color: 'var(--accent)', cursor: 'pointer' }}
                    onClick={() => setSelectedCustomerId(id => id === c.id ? null : c.id)}>
                    {selectedCustomerId === c.id ? '▲ إخفاء' : '▼ تفاصيل'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Debts Panel */}
      {selectedCustomerId && (
        <div className="section-card" style={{ border: '1px solid var(--warning)' }}>
          <div className="section-card-header">
            <div className="section-card-title" style={{ color: 'var(--warning)' }}>
              <AlertTriangle size={18} />ديون العميل: {customers.find(c => c.id === selectedCustomerId)?.name}
            </div>
          </div>
          <div>
            {selectedCustomerDebts.length === 0 ? (
              <div className="empty-state"><CheckCircle size={32} color="var(--success)" /><span>لا توجد ديون لهذا العميل</span></div>
            ) : (
              <table className="financial-table">
                <thead><tr><th>المبلغ الأصلي</th><th>المتبقي</th><th>العملة</th><th>الاستحقاق</th><th>الحالة</th>{isAdmin && <th>إجراء</th>}</tr></thead>
                <tbody>
                  {selectedCustomerDebts.map(d => (
                    <tr key={d.id}>
                      <td>{d.amount.toLocaleString()}</td>
                      <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{d.remainingAmount.toLocaleString()}</td>
                      <td>{d.currency}</td>
                      <td style={{ fontSize: '0.8rem' }}>{d.dueDate || '—'}</td>
                      <td><span className={`badge ${d.status === 'paid' ? 'active' : d.status === 'partially_paid' ? 'pending' : 'inactive'}`}>{d.status === 'paid' ? 'مسدد' : d.status === 'partially_paid' ? 'جزئي' : 'مفتوح'}</span></td>
                      {isAdmin && (
                        <td>
                          {d.status !== 'paid' && (
                            <button className="btn btn-success" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleSettleDebt(d.id)}>
                              تسديد كامل
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {isAdmin && showEditModal && editingCustomer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="section-card" style={{ width: '100%', maxWidth: 520, border: '2px solid var(--accent)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="section-card-header">
              <div className="section-card-title">تعديل بيانات العميل</div>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}><X size={20} /></button>
            </div>
            <div className="section-card-body">
              <div className="form-group-grid">
                <div className="form-group">
                  <label className="form-label">الاسم الكامل *</label>
                  <input className="form-input" type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">رقم الهاتف</label>
                  <input className="form-input" type="text" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">النوع</label>
                  <select className="form-select" value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="individual">فرد</option>
                    <option value="company">شركة</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">رقم الهوية</label>
                  <input className="form-input" type="text" value={editForm.idNumber} onChange={e => setEditForm(f => ({ ...f, idNumber: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">العنوان</label>
                  <input className="form-input" type="text" value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">حد الدين (د.ل)</label>
                  <input className="form-input" type="number" value={editForm.debtLimit} onChange={e => setEditForm(f => ({ ...f, debtLimit: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">ملاحظات</label>
                  <input className="form-input" type="text" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="btn btn-success" onClick={handleEditCustomer}><CheckCircle size={16} />حفظ التعديلات</button>
                <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}><X size={16} />إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Reusable Deletion ConfirmModal */}
      <ConfirmModal
        isOpen={showConfirm}
        title="تأكيد حذف ملف العميل"
        message={`هل أنت متأكد من رغبتك في حذف ملف العميل "${confirmCustomerName}" نهائياً من النظام؟ سيتم مسح كافة البيانات الشخصية والملفات التابعة له.`}
        confirmLabel="تأكيد الحذف"
        cancelLabel="إلغاء"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
