import { useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import {
  ShieldCheck, Users, Clock, CheckCircle, XCircle,
  Activity, Plus, Edit3, Trash2, ToggleLeft, X, Building2
} from 'lucide-react';

interface Props {
  showToast: (type: ToastMessage['type'], message: string) => void;
  mode?: 'approvals' | 'settings';
}

const PERMISSION_GROUPS = [
  {
    title: 'العمليات المالية',
    permissions: ['تنفيذ بيع عملة', 'تنفيذ شراء عملة', 'تحويل بين الخزنات', 'الموافقة على التحويلات', 'إلغاء عملية', 'إنشاء عملية عكسية']
  },
  {
    title: 'العملاء والديون',
    permissions: ['إدارة العملاء', 'إدارة الديون']
  },
  {
    title: 'الخزنات والورديات',
    permissions: ['إدارة الخزنات', 'فتح وردية', 'إغلاق وردية', 'اعتماد الإقفالات']
  },
  {
    title: 'العملات والبنوك',
    permissions: ['إدارة العملات', 'تعديل أسعار الصرف', 'إدارة البنوك']
  },
  {
    title: 'التقارير وسجل العمليات',
    permissions: ['رؤية التقارير', 'رؤية سجل العمليات', 'رؤية الأرباح']
  },
  {
    title: 'الأصول الثابتة',
    permissions: ['إدارة الأصول']
  },
  {
    title: 'الإدارة والنظام',
    permissions: ['إدارة المستخدمين', 'إدارة الفروع', 'إدارة الإعدادات']
  }
];

const EMPTY_USER = { name: '', username: '', phone: '', email: '', role: 'صراف', branch: 'الإدارة العامة', allowedVaultId: '' };
const EMPTY_BRANCH = { id: '', name: '', city: '', address: '', phone: '', manager: '', notes: '' };

export default function AdminPanel({ showToast, mode }: Props) {
  const {
    approvals, auditLogs, users, branches, vaults, currentRole, loginLogs,
    approveReversal, rejectReversal, approveShift, approveInventoryCount, updateTransferStatus,
    addUser, editUser, disableUser, deleteUser,
    addBranch, editBranch, disableBranch, deleteBranch,
    rolesPermissions, updateRolePermissions
  } = useSystem();

  const isAdmin = currentRole === 'مدير النظام';

  const rolesList = Object.keys(rolesPermissions || {});
  const [selectedRole, setSelectedRole] = useState<string>(() => rolesList[1] || rolesList[0] || 'صراف');

  const handleTogglePermission = (roleName: string, permission: string, enabled: boolean) => {
    if (roleName === 'مدير النظام' && !enabled && (permission === 'إدارة المستخدمين' || permission === 'إدارة الإعدادات')) {
      showToast('danger', 'لا يمكن سحب صلاحية إدارة المستخدمين أو الإعدادات من مدير النظام لمنع الإغلاق الذاتي للأنظمة');
      return;
    }
    const currentPerms = rolesPermissions[roleName] || [];
    const updatedPerms = enabled
      ? [...currentPerms, permission]
      : currentPerms.filter(p => p !== permission);
    updateRolePermissions(roleName, updatedPerms);
    showToast('success', `تم تحديث صلاحيات الدور ${roleName}`);
  };

  const handleCreateRole = (roleName: string) => {
    if (!roleName.trim()) return;
    if (rolesPermissions[roleName]) {
      showToast('danger', 'هذا الدور موجود بالفعل');
      return;
    }
    updateRolePermissions(roleName, []);
    setSelectedRole(roleName);
    showToast('success', `تم إنشاء الدور ${roleName} بنجاح`);
  };

  const handleDeleteRole = (roleName: string) => {
    if (roleName === 'مدير النظام' || roleName === 'صراف') {
      showToast('danger', 'لا يمكن حذف الأدوار الافتراضية للنظام');
      return;
    }
    const isUsed = users.some(u => u.role === roleName);
    if (isUsed) {
      showToast('danger', 'لا يمكن حذف الدور لأنه معين لمستخدمين نشطين');
      return;
    }
    updateRolePermissions(roleName, null);
    const remaining = Object.keys(rolesPermissions).filter(r => r !== roleName);
    setSelectedRole(remaining[1] || remaining[0] || 'صراف');
    showToast('success', `تم حذف الدور ${roleName} بنجاح`);
  };

  // Tabs list including Branches and Login logs
  const availableTabs = mode === 'approvals'
    ? ['approvals']
    : (isAdmin
      ? ['users', 'branches', 'roles', 'audit', 'loginLogs']
      : []);

  const [tab, setTab] = useState<'approvals' | 'users' | 'branches' | 'roles' | 'audit' | 'loginLogs'>(
    mode === 'approvals' ? 'approvals' : 'users'
  );

  // User Modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [userForm, setUserForm] = useState({ ...EMPTY_USER, password: '' });

  // Branch Modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any | null>(null);
  const [branchForm, setBranchForm] = useState({ ...EMPTY_BRANCH });

  // Audit filters
  const [auditUserFilter, setAuditUserFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditDateFilter, setAuditDateFilter] = useState('');

  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const doneApprovals = approvals.filter(a => a.status !== 'pending');

  const handleApprove = (a: typeof approvals[0]) => {
    if (a.type === 'transfer') updateTransferStatus(a.referenceId, 'approve');
    else if (a.type === 'reversal') approveReversal(a.id);
    else if (a.type === 'shift_close') approveShift(a.referenceId);
    else if (a.type === 'inventory') approveInventoryCount(a.referenceId);
    showToast('success', 'تمت الموافقة بنجاح');
  };

  const handleReject = (a: typeof approvals[0]) => {
    if (a.type === 'transfer') updateTransferStatus(a.referenceId, 'reject');
    else if (a.type === 'reversal') rejectReversal(a.id);
    showToast('danger', 'تم الرفض');
  };

  const openAddUser = () => {
    setEditingUser(null);
    setUserForm({ ...EMPTY_USER, password: '' });
    setShowUserModal(true);
  };
  const openEditUser = (u: any) => {
    setEditingUser(u);
    setUserForm({ name: u.name, username: u.username, phone: u.phone || '', email: u.email || '', role: u.role, branch: u.branch, allowedVaultId: u.allowedVaultId || '', password: '' });
    setShowUserModal(true);
  };
  const handleSaveUser = () => {
    if (!userForm.name.trim() || !userForm.username.trim()) { showToast('danger', 'يرجى تعبئة الاسم ومعرف المستخدم'); return; }
    if (!editingUser && !userForm.password.trim()) { showToast('danger', 'يرجى تعيين كلمة مرور للمستخدم الجديد'); return; }
    if (!editingUser) {
      const exists = users.find(u => u.username === userForm.username.toLowerCase());
      if (exists) { showToast('danger', 'معرف المستخدم مستخدم بالفعل'); return; }
      addUser({ ...userForm, username: userForm.username.toLowerCase() });
      showToast('success', `تمت إضافة المستخدم ${userForm.name}`);
    } else {
      editUser({ ...editingUser, ...userForm, username: userForm.username.toLowerCase() });
      showToast('success', `تم تحديث بيانات ${userForm.name}`);
    }
    setShowUserModal(false);
  };
  const handleDeleteUser = (id: string, name: string) => {
    if (!deleteUser(id)) showToast('danger', `لا يمكن حذف ${name}`);
    else showToast('success', `تم حذف ${name}`);
  };

  const openAddBranch = () => {
    setEditingBranch(null);
    setBranchForm({ ...EMPTY_BRANCH });
    setShowBranchModal(true);
  };
  const openEditBranch = (b: any) => {
    setEditingBranch(b);
    setBranchForm({ id: b.id, name: b.name, city: b.city || '', address: b.address || '', phone: b.phone || '', manager: b.manager || '', notes: b.notes || '' });
    setShowBranchModal(true);
  };
  const handleSaveBranch = () => {
    if (!branchForm.name.trim() || !branchForm.city.trim()) { showToast('danger', 'يرجى تعبئة اسم الفرع والمدينة'); return; }
    if (!editingBranch) {
      const exists = branches.find(b => b.id === branchForm.name);
      if (exists) { showToast('danger', 'اسم الفرع موجود بالفعل'); return; }
      addBranch({ ...branchForm, id: branchForm.name, isActive: true });
      showToast('success', `تم إضافة الفرع ${branchForm.name} بنجاح`);
    } else {
      editBranch({ ...editingBranch, ...branchForm });
      showToast('success', `تم تحديث الفرع ${branchForm.name}`);
    }
    setShowBranchModal(false);
  };
  const handleDeleteBranch = (id: string, name: string) => {
    if (!deleteBranch(id)) showToast('danger', `لا يمكن حذف فرع ${name} لأنه مرتبط بسجلات بالنظام`);
    else showToast('success', `تم حذف فرع ${name} بنجاح`);
  };

  const typeLabel: Record<string, string> = {
    transfer: 'تحويل', reversal: 'عكس عملية', shift_close: 'إقفال وردية', inventory: 'جرد خزنة', reconciliation: 'تسوية مالية'
  };

  const ROLE_COLORS: Record<string, string> = {
    'مدير النظام': 'var(--danger)',
    'صراف': 'var(--success)'
  };

  return (
    <div className="page-content">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>الإدارة والصلاحيات</h1>

      {/* Role notice for non-admin */}
      {!isAdmin && (
        <div style={{ background: 'var(--info-bg)', border: '1px solid var(--info)', borderRadius: 10, padding: '0.75rem 1.25rem', fontSize: '0.85rem', color: 'var(--info)' }}>
          أنت مسجّل بصلاحية <strong>{currentRole}</strong> — يمكنك الاطلاع على الموافقات المعلقة فقط.
        </div>
      )}

      {/* Tabs */}
      {availableTabs.length > 1 && (
        <div className="pos-tabs-row" style={{ flexWrap: 'wrap' }}>
          {availableTabs.includes('approvals') && (
            <button className={`pos-tab-btn${tab === 'approvals' ? ' active' : ''}`} onClick={() => setTab('approvals')}>
              <Clock size={16} />الموافقات ({pendingApprovals.length})
            </button>
          )}
          {availableTabs.includes('users') && (
            <button className={`pos-tab-btn${tab === 'users' ? ' active' : ''}`} onClick={() => setTab('users')}>
              <Users size={16} />المستخدمون
            </button>
          )}
          {availableTabs.includes('branches') && (
            <button className={`pos-tab-btn${tab === 'branches' ? ' active' : ''}`} onClick={() => setTab('branches')}>
              <Building2 size={16} />الفروع
            </button>
          )}
          {availableTabs.includes('roles') && (
            <button className={`pos-tab-btn${tab === 'roles' ? ' active' : ''}`} onClick={() => setTab('roles')}>
              <ShieldCheck size={16} />الأدوار والصلاحيات
            </button>
          )}
          {availableTabs.includes('audit') && (
            <button className={`pos-tab-btn${tab === 'audit' ? ' active' : ''}`} onClick={() => setTab('audit')}>
              <Activity size={16} />سجل التدقيق
            </button>
          )}
          {availableTabs.includes('loginLogs') && (
            <button className={`pos-tab-btn${tab === 'loginLogs' ? ' active' : ''}`} onClick={() => setTab('loginLogs')}>
              <Clock size={16} />سجل الدخول
            </button>
          )}
        </div>
      )}

      {/* ========== APPROVALS TAB ========== */}
      {tab === 'approvals' && (
        <div className="pos-container">
          {/* Pending */}
          <div>
            <div className="section-card" style={{ border: pendingApprovals.length > 0 ? '1px solid var(--warning)' : '1px solid var(--border)' }}>
              <div className="section-card-header">
                <div className="section-card-title" style={{ color: pendingApprovals.length > 0 ? 'var(--warning)' : 'var(--primary)' }}>
                  <Clock size={18} />طلبات بانتظار الموافقة
                </div>
                <span className="badge pending">{pendingApprovals.length}</span>
              </div>
              {pendingApprovals.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <CheckCircle size={36} color="var(--success)" />
                  <span>لا توجد طلبات معلقة — كل شيء على ما يرام!</span>
                </div>
              ) : pendingApprovals.map(a => (
                <div key={a.id} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{a.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.2rem' }}>
                        <span className="badge pending" style={{ fontSize: '0.7rem' }}>{typeLabel[a.type] || a.type}</span>
                        <span style={{ marginRight: '0.5rem' }}>{a.timestamp.substring(0, 16)}</span>
                        <span style={{ marginRight: '0.5rem' }}>طلبه: {a.requestedBy}</span>
                      </div>
                    </div>
                    {a.amount && (
                      <div style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1rem' }}>
                        {a.amount.toLocaleString()} {a.currency}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                    {a.details}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-success" style={{ flex: 1, padding: '0.5rem' }} onClick={() => handleApprove(a)}>
                      <CheckCircle size={16} />موافقة
                    </button>
                    <button className="btn btn-danger" style={{ flex: 1, padding: '0.5rem' }} onClick={() => handleReject(a)}>
                      <XCircle size={16} />رفض
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Done */}
          <div>
            <div className="section-card">
              <div className="section-card-header"><div className="section-card-title">سجل الطلبات المعالجة</div><span className="badge active">{doneApprovals.length}</span></div>
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {doneApprovals.map(a => (
                  <div key={a.id} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{a.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{a.timestamp.substring(0, 16)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {a.amount && <span style={{ fontWeight: 700, color: 'var(--gray)' }}>{a.amount.toLocaleString()} {a.currency}</span>}
                        <span className={`badge ${a.status === 'approved' ? 'active' : 'inactive'}`}>
                          {a.status === 'approved' ? 'مُوافَق' : 'مرفوض'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== USERS TAB ========== */}
      {isAdmin && tab === 'users' && (
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title"><Users size={18} color="var(--accent)" />قائمة المستخدمين</div>
            <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }} onClick={openAddUser}>
              <Plus size={14} />إضافة مستخدم
            </button>
          </div>
          <table className="financial-table">
            <thead>
              <tr><th>الاسم الكامل</th><th>المعرف</th><th>الدور</th><th>الفرع</th><th>الحالة</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 700 }}>{u.name}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--gray)' }}>{u.username}</td>
                  <td>
                    <span className="badge pending" style={{ color: ROLE_COLORS[u.role] || 'var(--gray)', background: 'transparent', border: `1px solid ${ROLE_COLORS[u.role] || 'var(--gray)'}` }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{u.branch}</td>
                  <td><span className={`badge ${u.isActive ? 'active' : 'inactive'}`}>{u.isActive ? 'نشط' : 'موقوف'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem' }} onClick={() => openEditUser(u)}>
                        <Edit3 size={12} />تعديل
                      </button>
                      <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', color: u.isActive ? 'var(--warning)' : 'var(--success)' }}
                        onClick={() => { disableUser(u.id); showToast('info', `تم ${u.isActive ? 'تعطيل' : 'تفعيل'} ${u.name}`); }}>
                        <ToggleLeft size={12} />
                      </button>
                      {u.username !== 'admin' && (
                        <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', color: 'var(--danger)' }}
                          onClick={() => handleDeleteUser(u.id, u.name)}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== ROLES TAB ========== */}
      {isAdmin && tab === 'roles' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', alignItems: 'start' }} className="roles-tab-grid">
          {/* Right Column: Roles List & Control */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="section-card" style={{ padding: '1.25rem' }}>
              <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '1rem', color: 'var(--primary)' }}>الأدوار الوظيفية</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {Object.keys(rolesPermissions || {}).map(roleName => {
                  const isActive = selectedRole === roleName;
                  return (
                    <div
                      key={roleName}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 1rem',
                        borderRadius: '10px',
                        background: isActive ? 'linear-gradient(135deg, var(--accent), #0D3FC7)' : 'var(--input)',
                        color: isActive ? '#FFFFFF' : 'var(--foreground)',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        boxShadow: isActive ? '0 4px 12px rgba(59,130,246,0.25)' : 'none'
                      }}
                      onClick={() => setSelectedRole(roleName)}
                    >
                      <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{roleName}</span>
                      {roleName !== 'مدير النظام' && roleName !== 'صراف' && (
                        <button
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: isActive ? 'rgba(255,255,255,0.8)' : 'var(--danger)',
                            padding: '0.2rem',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'var(--transition)'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRole(roleName);
                          }}
                          title="حذف هذا الدور"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Create New Role Card */}
            <div className="section-card" style={{ padding: '1.25rem' }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.75rem', color: 'var(--primary)' }}>إنشاء دور جديد</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="اسم الدور (مثال: مشرف)"
                  className="form-input"
                  style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem', marginBottom: 0 }}
                  id="new-role-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = e.currentTarget.value.trim();
                      if (val) {
                        handleCreateRole(val);
                        e.currentTarget.value = '';
                      }
                    }
                  }}
                />
                <button
                  className="btn btn-primary"
                  style={{ padding: '0.45rem 0.85rem', flexShrink: 0 }}
                  onClick={() => {
                    const el = document.getElementById('new-role-input') as HTMLInputElement;
                    if (el && el.value.trim()) {
                      handleCreateRole(el.value.trim());
                      el.value = '';
                    } else {
                      showToast('danger', 'يرجى إدخال اسم الدور');
                    }
                  }}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Left Column: Permissions Matrix for the Selected Role */}
          <div className="section-card" style={{ gridColumn: 'span 2', minHeight: '400px' }}>
            <div className="section-card-header" style={{ borderBottom: '1px solid var(--border)', padding: '1.25rem' }}>
              <div className="section-card-title" style={{ fontSize: '1.1rem' }}>
                <ShieldCheck size={20} color="var(--accent)" />
                صلاحيات الدور: <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{selectedRole}</span>
              </div>
            </div>
            <div className="section-card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem', padding: '1.25rem' }}>
              {PERMISSION_GROUPS.map(group => {
                const activePermsForRole = rolesPermissions[selectedRole] || [];
                return (
                  <div key={group.title} style={{ background: 'var(--background)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>{group.title}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {group.permissions.map(perm => {
                        const hasPerm = activePermsForRole.includes(perm);
                        return (
                          <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.85rem', cursor: 'pointer', padding: '0.2rem 0', userSelect: 'none' }}>
                            <input
                              type="checkbox"
                              checked={hasPerm}
                              onChange={(e) => handleTogglePermission(selectedRole, perm, e.target.checked)}
                              style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                            />
                            <span style={{ color: hasPerm ? 'var(--foreground)' : 'var(--gray)', fontWeight: hasPerm ? 700 : 400 }}>{perm}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========== AUDIT TAB ========== */}
      {isAdmin && tab === 'audit' && (
        <div className="section-card">
          <div className="section-card-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="section-card-title"><Activity size={18} color="var(--accent)" />سجل التدقيق والأحداث</div>
              <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>{auditLogs.length} حدث مسجل</span>
            </div>
            
            {/* Local Search Filters Row */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', background: 'var(--input)', padding: '0.75rem', borderRadius: 8 }}>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>المستخدم</label>
                <input className="form-input" style={{ padding: '0.35rem 0.6rem', fontSize: '0.82rem' }} type="text" placeholder="البحث بالمستخدم..." value={auditUserFilter} onChange={e => setAuditUserFilter(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>العملية</label>
                <input className="form-input" style={{ padding: '0.35rem 0.6rem', fontSize: '0.82rem' }} type="text" placeholder="البحث بالعملية..." value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>التاريخ (سنة-شهر-يوم)</label>
                <input className="form-input" style={{ padding: '0.35rem 0.6rem', fontSize: '0.82rem' }} type="text" placeholder="مثال: 2026-05-28" value={auditDateFilter} onChange={e => setAuditDateFilter(e.target.value)} />
              </div>
            </div>
          </div>
          
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {(() => {
              const logs = auditLogs.filter(log => {
                const matchesUser = auditUserFilter === '' || log.user.includes(auditUserFilter);
                const matchesAction = auditActionFilter === '' || log.action.includes(auditActionFilter);
                const matchesDate = auditDateFilter === '' || log.timestamp.startsWith(auditDateFilter);
                return matchesUser && matchesAction && matchesDate;
              });

              if (logs.length === 0) {
                return <div className="empty-state"><Activity size={32} /><span>لا توجد سجلات تدقيق مطابقة لفلاتر البحث</span></div>;
              }

              return logs.map((log, i) => (
                <div key={log.id || i} style={{ display: 'flex', gap: '1rem', padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', minWidth: 120, paddingTop: '0.1rem' }}>{log.timestamp}</div>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: '0.45rem' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{log.user}</span>
                      <span style={{ color: 'var(--gray)', margin: '0 0.4rem' }}>—</span>
                      <span>{log.details}</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.2rem' }}>{log.role} · {log.branch} · {log.ip}</div>
                  </div>
                  <span className="badge pending" style={{ fontSize: '0.7rem', flexShrink: 0 }}>{log.action}</span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ========== BRANCHES TAB ========== */}
      {isAdmin && tab === 'branches' && (
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title"><Building2 size={18} color="var(--accent)" />إدارة فروع الشركة</div>
            <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }} onClick={openAddBranch}>
              <Plus size={14} />إضافة فرع جديد
            </button>
          </div>
          <table className="financial-table">
            <thead>
              <tr><th>اسم الفرع</th><th>المدينة</th><th>العنوان الكامل</th><th>الهاتف</th><th>المدير</th><th>الحالة</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {branches.map(b => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 700 }}>{b.name}</td>
                  <td>{b.city}</td>
                  <td style={{ fontSize: '0.82rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.address}>{b.address}</td>
                  <td style={{ fontFamily: 'monospace' }}>{b.phone || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{b.manager || '—'}</td>
                  <td><span className={`badge ${b.isActive ? 'active' : 'inactive'}`}>{b.isActive ? 'نشط' : 'معطل'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem' }} onClick={() => openEditBranch(b)}>
                        <Edit3 size={12} />تعديل
                      </button>
                      <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', color: b.isActive ? 'var(--warning)' : 'var(--success)' }}
                        onClick={() => { disableBranch(b.id); showToast('info', `تم ${b.isActive ? 'تعطيل' : 'تفعيل'} فرع ${b.name}`); }}>
                        <ToggleLeft size={12} />
                      </button>
                      {b.id !== 'الإدارة العامة' && (
                        <button className="btn btn-secondary" style={{ padding: '0.22rem 0.5rem', fontSize: '0.72rem', color: 'var(--danger)' }}
                          onClick={() => handleDeleteBranch(b.id, b.name)}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== LOGIN LOGS TAB ========== */}
      {isAdmin && tab === 'loginLogs' && (
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title"><Clock size={18} color="var(--accent)" />سجل جلسات الدخول للموظفين</div>
            <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>{loginLogs.length} جلسة مسجلة</span>
          </div>
          <div className="table-responsive">
            <table className="financial-table">
              <thead>
                <tr><th>وقت الدخول</th><th>الموظف</th><th>الدور</th><th>الفرع</th><th>عنوان IP</th><th>الجهاز</th><th>الحالة</th></tr>
              </thead>
              <tbody>
                {loginLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>{log.loginTime}</td>
                    <td style={{ fontWeight: 700 }}>{log.user}</td>
                    <td><span className="badge pending">{log.role}</span></td>
                    <td>{log.branch}</td>
                    <td style={{ fontFamily: 'monospace' }}>{log.ip}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>{log.device}</td>
                    <td><span className="badge active">نجاح</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== USER MODAL ========== */}
      {isAdmin && showUserModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="section-card" style={{ width: '100%', maxWidth: 560, border: '2px solid var(--accent)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="section-card-header">
              <div className="section-card-title">{editingUser ? `تعديل المستخدم — ${editingUser.name}` : 'إضافة مستخدم جديد'}</div>
              <button onClick={() => setShowUserModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}><X size={20} /></button>
            </div>
            <div className="section-card-body">
              <div className="form-group-grid">
                <div className="form-group">
                  <label className="form-label">الاسم الكامل *</label>
                  <input className="form-input" type="text" placeholder="محمد أحمد" value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">معرف الدخول (Username) *</label>
                  <input className="form-input" type="text" placeholder="mohamad" value={userForm.username}
                    onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))}
                    disabled={!!editingUser} />
                </div>
                {!editingUser && (
                  <div className="form-group">
                    <label className="form-label">كلمة المرور *</label>
                    <input className="form-input" type="password" placeholder="••••••••" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">رقم الهاتف</label>
                  <input className="form-input" type="text" placeholder="091-xxxxxxx" value={userForm.phone} onChange={e => setUserForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">البريد الإلكتروني</label>
                  <input className="form-input" type="email" placeholder="user@example.com" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">الدور الوظيفي</label>
                  <select className="form-select" value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}>
                    {Object.keys(rolesPermissions || {}).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">الفرع</label>
                  <select className="form-select" value={userForm.branch} onChange={e => setUserForm(f => ({ ...f, branch: e.target.value }))}>
                    {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">الخزنة المصرّح بها</label>
                  <select className="form-select" value={userForm.allowedVaultId} onChange={e => setUserForm(f => ({ ...f, allowedVaultId: e.target.value }))}>
                    <option value="">— بدون تحديد —</option>
                    {vaults.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="btn btn-success" onClick={handleSaveUser}><CheckCircle size={16} />{editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}</button>
                <button className="btn btn-secondary" onClick={() => setShowUserModal(false)}><X size={16} />إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== BRANCH MODAL ========== */}
      {isAdmin && showBranchModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="section-card" style={{ width: '100%', maxWidth: 520, border: '2px solid var(--accent)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="section-card-header">
              <div className="section-card-title">{editingBranch ? `تعديل الفرع — ${editingBranch.name}` : 'إضافة فرع جديد'}</div>
              <button onClick={() => setShowBranchModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}><X size={20} /></button>
            </div>
            <div className="section-card-body">
              <div className="form-group-grid">
                <div className="form-group">
                  <label className="form-label">اسم الفرع *</label>
                  <input className="form-input" type="text" placeholder="فرع البيضاء" value={branchForm.name} onChange={e => setBranchForm(f => ({ ...f, name: e.target.value }))} disabled={!!editingBranch} />
                </div>
                <div className="form-group">
                  <label className="form-label">المدينة *</label>
                  <input className="form-input" type="text" placeholder="البيضاء" value={branchForm.city} onChange={e => setBranchForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">رقم الهاتف</label>
                  <input className="form-input" type="text" placeholder="061-xxxxxxx" value={branchForm.phone} onChange={e => setBranchForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">مدير الفرع</label>
                  <input className="form-input" type="text" placeholder="اسم مدير الفرع" value={branchForm.manager} onChange={e => setBranchForm(f => ({ ...f, manager: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">العنوان الكامل</label>
                  <input className="form-input" type="text" placeholder="شارع المركز، بجانب المصرف التجاري" value={branchForm.address} onChange={e => setBranchForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">ملاحظات الفرع</label>
                  <textarea className="form-input" placeholder="أدخل أي ملاحظات إضافية حول الفرع..." rows={3} value={branchForm.notes} onChange={e => setBranchForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="btn btn-success" onClick={handleSaveBranch}><CheckCircle size={16} />{editingBranch ? 'حفظ التعديلات' : 'إضافة الفرع'}</button>
                <button className="btn btn-secondary" onClick={() => setShowBranchModal(false)}><X size={16} />إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
