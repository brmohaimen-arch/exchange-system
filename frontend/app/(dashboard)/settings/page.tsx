'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Save, User, Shield, Building2, Plus, Pencil, Trash2, X, Loader2, KeyRound, ShieldCheck, Percent, History, DatabaseBackup, ShieldAlert, CheckCircle2, Smartphone, XCircle, MessageCircle, Send } from 'lucide-react'
import { api, newId, ALL_PERMISSIONS, Currency, RoleDTO, UserDTO, CommissionRule, AuditLogEntry, LoginLogEntry, BackupEntry, API_BASE } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'

interface Branch { id: string; name: string; city: string }
interface VaultLite { id: string; name: string }

function emptyRuleForm() {
  return { name: '', currency: '', customerType: '', minAmount: '0', maxAmount: '', rateType: 'percentage', rateValue: '', priority: '0' }
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-muted'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? '-translate-x-6' : '-translate-x-1'}`} />
    </button>
  )
}

function emptyUserForm() {
  return { id: '', name: '', username: '', password: '', email: '', phone: '', role: '', branch: '', allowedVaultId: '', isActive: true }
}

export default function SettingsPage() {
  const { user: me, hasPermission, refreshUser } = useAuth()
  const canManageSettings = hasPermission('إدارة الإعدادات')
  const canManageUsers = hasPermission('إدارة المستخدمين')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  // General + system settings
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [savingSettings, setSavingSettings] = useState(false)

  // Users
  const [users, setUsers] = useState<UserDTO[]>([])
  const [roles, setRoles] = useState<RoleDTO[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [vaults, setVaults] = useState<VaultLite[]>([])
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserDTO | null>(null)
  const [userForm, setUserForm] = useState(emptyUserForm())
  const [userFormError, setUserFormError] = useState('')
  const [savingUser, setSavingUser] = useState(false)

  // Roles & permissions
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [rolePerms, setRolePerms] = useState<string[]>([])
  const [savingRole, setSavingRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')

  // Commission rules
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [ruleForm, setRuleForm] = useState(emptyRuleForm())
  const [ruleFormError, setRuleFormError] = useState('')
  const [savingRule, setSavingRule] = useState(false)

  // Audit / login logs & backups
  const canViewLogs = hasPermission('رؤية سجل العمليات')
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [loginLogs, setLoginLogs] = useState<LoginLogEntry[]>([])
  const [chainStatus, setChainStatus] = useState<{ valid: boolean } | null>(null)
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [creatingBackup, setCreatingBackup] = useState(false)

  // MFA (self-service, own account)
  const [mfaSecret, setMfaSecret] = useState('')
  const [mfaOtpauthUrl, setMfaOtpauthUrl] = useState('')
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)
  const [mfaError, setMfaError] = useState('')
  const [showMfaDisable, setShowMfaDisable] = useState(false)
  const [mfaDisablePassword, setMfaDisablePassword] = useState('')

  // WhatsApp assistant
  const [sendingWhatsappTest, setSendingWhatsappTest] = useState(false)
  const [whatsappTestResult, setWhatsappTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const load = async () => {
    try {
      const results = await Promise.allSettled([
        api.get<Record<string, any>>('/settings'),
        api.get<Currency[]>('/currencies'),
        api.get<RoleDTO[]>('/auth/roles'),
        canManageUsers ? api.get<UserDTO[]>('/auth/users') : Promise.resolve([]),
        api.get<Branch[]>('/branches'),
        api.get<VaultLite[]>('/vaults'),
        api.get<CommissionRule[]>('/commission_rules'),
        canViewLogs ? api.get<AuditLogEntry[]>('/audit_logs') : Promise.resolve([]),
        canViewLogs ? api.get<LoginLogEntry[]>('/login_logs') : Promise.resolve([]),
        canManageSettings ? api.get<BackupEntry[]>('/backups') : Promise.resolve([]),
      ])
      const [s, c, r, u, b, v, cr, al, ll, bk] = results
      if (s.status === 'fulfilled') setSettings(s.value)
      if (c.status === 'fulfilled') setCurrencies(c.value)
      if (r.status === 'fulfilled') { setRoles(r.value); if (r.value.length && !selectedRole) setSelectedRole(r.value[0].name) }
      if (u.status === 'fulfilled') setUsers(u.value as UserDTO[])
      if (b.status === 'fulfilled') setBranches(b.value)
      if (v.status === 'fulfilled') setVaults(v.value)
      if (cr.status === 'fulfilled') setRules(cr.value as CommissionRule[])
      if (al.status === 'fulfilled') setAuditLogs(al.value as AuditLogEntry[])
      if (ll.status === 'fulfilled') setLoginLogs(ll.value as LoginLogEntry[])
      if (bk.status === 'fulfilled') setBackups(bk.value as BackupEntry[])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل الإعدادات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const r = roles.find((x) => x.name === selectedRole)
    setRolePerms(r ? [...r.permissions] : [])
  }, [selectedRole, roles])

  const setField = (key: string, value: any) => setSettings((s) => ({ ...s, [key]: value }))

  const saveSettings = async (e: FormEvent) => {
    e.preventDefault()
    setSavingSettings(true)
    setSaveMsg('')
    try {
      await api.post('/settings', { settings })
      setSaveMsg('تم حفظ الإعدادات بنجاح')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حفظ الإعدادات')
    } finally {
      setSavingSettings(false)
    }
  }

  // ---------------- Users ----------------
  const openCreateUser = () => {
    setEditingUser(null)
    setUserForm(emptyUserForm())
    setUserFormError('')
    setShowUserModal(true)
  }

  const openEditUser = (u: UserDTO) => {
    setEditingUser(u)
    setUserForm({
      id: u.id, name: u.name, username: u.username, password: '',
      email: u.email || '', phone: u.phone || '', role: u.role, branch: u.branch,
      allowedVaultId: u.allowedVaultId || '', isActive: u.isActive,
    })
    setUserFormError('')
    setShowUserModal(true)
  }

  const submitUser = async (e: FormEvent) => {
    e.preventDefault()
    setUserFormError('')
    if (!userForm.name.trim() || !userForm.username.trim() || (!editingUser && !userForm.password) || !userForm.role || !userForm.branch) {
      setUserFormError('الاسم واسم المستخدم والدور والفرع حقول مطلوبة')
      return
    }
    setSavingUser(true)
    const payload = {
      id: editingUser?.id || userForm.id || newId('u'),
      name: userForm.name.trim(),
      username: userForm.username.trim(),
      password: userForm.password,
      email: userForm.email.trim() || null,
      phone: userForm.phone.trim() || null,
      role: userForm.role,
      branch: userForm.branch,
      allowed_vault_id: userForm.allowedVaultId || null,
      is_active: userForm.isActive,
    }
    try {
      if (editingUser) {
        await api.put(`/auth/users/${editingUser.id}`, payload)
      } else {
        await api.post('/auth/users', payload)
      }
      setShowUserModal(false)
      await load()
    } catch (err) {
      setUserFormError(err instanceof ApiError ? err.message : 'تعذر حفظ المستخدم')
    } finally {
      setSavingUser(false)
    }
  }

  const deleteUser = async (u: UserDTO) => {
    if (!confirm(`هل تريد حذف المستخدم ${u.name}؟`)) return
    try {
      await api.delete(`/auth/users/${u.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف المستخدم')
    }
  }

  // ---------------- Roles ----------------
  const togglePerm = (perm: string) => {
    setRolePerms((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm])
  }

  const saveRolePerms = async () => {
    if (!selectedRole) return
    setSavingRole(true)
    try {
      await api.put(`/auth/roles/${encodeURIComponent(selectedRole)}`, { name: selectedRole, permissions: rolePerms })
      await load()
      setSaveMsg('تم تحديث صلاحيات الدور بنجاح')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحديث صلاحيات الدور')
    } finally {
      setSavingRole(false)
    }
  }

  const addRole = async () => {
    if (!newRoleName.trim()) return
    try {
      await api.post('/auth/roles', { name: newRoleName.trim(), permissions: [] })
      setNewRoleName('')
      await load()
      setSelectedRole(newRoleName.trim())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إضافة الدور')
    }
  }

  const deleteRole = async (name: string) => {
    if (!confirm(`هل تريد حذف الدور "${name}"؟`)) return
    try {
      await api.delete(`/auth/roles/${encodeURIComponent(name)}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف الدور')
    }
  }

  const currentRole = roles.find((r) => r.name === selectedRole)

  // ---------------- Commission Rules ----------------
  const openCreateRule = () => {
    setRuleForm(emptyRuleForm())
    setRuleFormError('')
    setShowRuleModal(true)
  }

  const submitRule = async (e: FormEvent) => {
    e.preventDefault()
    setRuleFormError('')
    if (!ruleForm.name.trim() || !ruleForm.rateValue) {
      setRuleFormError('اسم القاعدة وقيمة النسبة/المبلغ حقول مطلوبة')
      return
    }
    setSavingRule(true)
    try {
      await api.post('/commission_rules', {
        id: newId('rule'),
        name: ruleForm.name.trim(),
        currency: ruleForm.currency || null,
        customer_type: ruleForm.customerType || null,
        min_amount: parseFloat(ruleForm.minAmount) || 0,
        max_amount: ruleForm.maxAmount ? parseFloat(ruleForm.maxAmount) : null,
        rate_type: ruleForm.rateType,
        rate_value: parseFloat(ruleForm.rateValue) || 0,
        priority: parseInt(ruleForm.priority) || 0,
        is_active: true,
      })
      setShowRuleModal(false)
      await load()
    } catch (err) {
      setRuleFormError(err instanceof ApiError ? err.message : 'تعذر حفظ القاعدة')
    } finally {
      setSavingRule(false)
    }
  }

  const deleteRule = async (r: CommissionRule) => {
    if (!confirm(`هل تريد حذف قاعدة "${r.name}"؟`)) return
    try {
      await api.delete(`/commission_rules/${r.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف القاعدة')
    }
  }

  // ---------------- Audit chain / backups ----------------
  const verifyChain = async () => {
    try {
      const result = await api.get<{ valid: boolean }>('/audit_logs/verify')
      setChainStatus(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر التحقق من سلامة السجل')
    }
  }

  const triggerBackup = async () => {
    setCreatingBackup(true)
    try {
      await api.post('/backups')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إنشاء نسخة احتياطية')
    } finally {
      setCreatingBackup(false)
    }
  }

  // ---------------- MFA ----------------
  const startMfaEnrollment = async () => {
    setMfaError('')
    setMfaBusy(true)
    try {
      const data = await api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup')
      setMfaSecret(data.secret)
      setMfaOtpauthUrl(data.otpauthUrl)
      setMfaEnrolling(true)
      setMfaCode('')
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : 'تعذر بدء إعداد المصادقة الثنائية')
    } finally {
      setMfaBusy(false)
    }
  }

  const confirmMfaEnrollment = async (e: FormEvent) => {
    e.preventDefault()
    setMfaError('')
    setMfaBusy(true)
    try {
      await api.post('/auth/mfa/enable', { code: mfaCode.trim() })
      setMfaEnrolling(false)
      setMfaCode('')
      await refreshUser()
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : 'رمز التحقق غير صحيح')
    } finally {
      setMfaBusy(false)
    }
  }

  const confirmMfaDisable = async (e: FormEvent) => {
    e.preventDefault()
    setMfaError('')
    setMfaBusy(true)
    try {
      await api.post('/auth/mfa/disable', { password: mfaDisablePassword })
      setShowMfaDisable(false)
      setMfaDisablePassword('')
      await refreshUser()
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : 'تعذر تعطيل المصادقة الثنائية')
    } finally {
      setMfaBusy(false)
    }
  }

  // ---------------- WhatsApp assistant ----------------
  const sendWhatsappTest = async () => {
    setSendingWhatsappTest(true)
    setWhatsappTestResult(null)
    try {
      // The test endpoint reads settings already persisted server-side, so save
      // whatever is currently typed first — otherwise this could test stale config.
      await api.post('/settings', { settings })
      await api.post('/whatsapp/test')
      setWhatsappTestResult({ ok: true, message: 'تم حفظ الإعدادات وإرسال رسالة الاختبار بنجاح — تحقق من واتساب' })
    } catch (err) {
      setWhatsappTestResult({ ok: false, message: err instanceof ApiError ? err.message : 'تعذر إرسال رسالة الاختبار' })
    } finally {
      setSendingWhatsappTest(false)
    }
  }

  const whatsappWebhookUrl = `${API_BASE}/whatsapp/webhook`

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">الإعدادات</h2>
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}
      {saveMsg && <p className="rounded-md bg-success/10 px-4 py-2 text-sm text-success">{saveMsg}</p>}

      <form onSubmit={saveSettings} className="grid gap-6 lg:grid-cols-2">
        {/* General Settings */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">بيانات المكتب</h3>
          </div>

          <fieldset disabled={!canManageSettings} className="space-y-4 text-right disabled:opacity-70">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">اسم المكتب</label>
              <input
                value={settings.companyName || ''}
                onChange={(e) => setField('companyName', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">رقم الهاتف</label>
                <input
                  value={settings.phone || ''}
                  onChange={(e) => setField('phone', e.target.value)}
                  dir="ltr"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">العملة الأساسية</label>
                <select
                  value={settings.defaultCurrency || 'LYD'}
                  onChange={(e) => setField('defaultCurrency', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.symbol} - {c.nameAr}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">العنوان</label>
              <input
                value={settings.address || ''}
                onChange={(e) => setField('address', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">الرقم الضريبي</label>
              <input
                value={settings.taxNumber || ''}
                onChange={(e) => setField('taxNumber', e.target.value)}
                dir="ltr"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </fieldset>
        </div>

        {/* Security / System Settings */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Shield className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">الأمان والامتثال</h3>
          </div>

          <fieldset disabled={!canManageSettings} className="space-y-4 text-right disabled:opacity-70">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">تفعيل التحقق بخطوتين (MFA)</span>
              <Toggle checked={!!settings.enableMFA} onChange={(v) => setField('enableMFA', v)} disabled={!canManageSettings} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">السماح بتعديل السعر أثناء تنفيذ العملية</span>
              <Toggle checked={!!settings.allowRateEditDuringTx} onChange={(v) => setField('allowRateEditDuringTx', v)} disabled={!canManageSettings} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">تفعيل تذكيرات الرسائل النصية</span>
              <Toggle checked={!!settings.smsRemindersEnabled} onChange={(v) => setField('smsRemindersEnabled', v)} disabled={!canManageSettings} />
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">مهلة الجلسة (دقيقة)</label>
                <input
                  type="number"
                  value={settings.sessionTimeout ?? ''}
                  onChange={(e) => setField('sessionTimeout', parseInt(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">حد الإبلاغ (د.ل)</label>
                <input
                  type="number"
                  value={settings.amlThresholdLYD ?? ''}
                  onChange={(e) => setField('amlThresholdLYD', parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-sm text-foreground">تفعيل النسخ الاحتياطي التلقائي المجدول</span>
              <Toggle checked={!!settings.autoBackupEnabled} onChange={(v) => setField('autoBackupEnabled', v)} disabled={!canManageSettings} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">كل كم ساعة</label>
                <input
                  type="number"
                  min={1}
                  value={settings.autoBackupIntervalHours ?? ''}
                  onChange={(e) => setField('autoBackupIntervalHours', parseInt(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">عدد النسخ المحتفظ بها</label>
                <input
                  type="number"
                  min={1}
                  value={settings.autoBackupRetentionCount ?? ''}
                  onChange={(e) => setField('autoBackupRetentionCount', parseInt(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </fieldset>
        </div>

        {canManageSettings && (
          <div className="lg:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ الإعدادات العامة
            </button>
          </div>
        )}
      </form>

      {/* MFA — self-service, own account */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">المصادقة الثنائية (MFA) لحسابي</h3>
        </div>

        {mfaError && <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{mfaError}</p>}

        {me?.mfaEnabled ? (
          <div className="text-right">
            <p className="flex items-center gap-2 text-sm text-success mb-4">
              <CheckCircle2 className="h-4 w-4" /> مفعّلة على حسابك — سيُطلب منك رمز تحقق عند تسجيل الدخول
            </p>
            {!showMfaDisable ? (
              <button onClick={() => setShowMfaDisable(true)} className="flex items-center gap-2 rounded-md border border-danger/30 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 transition-colors">
                <XCircle className="h-4 w-4" /> تعطيل المصادقة الثنائية
              </button>
            ) : (
              <form onSubmit={confirmMfaDisable} className="space-y-3 max-w-xs">
                <label className="block text-sm font-medium text-foreground mb-1">أدخل كلمة المرور للتأكيد</label>
                <input
                  type="password"
                  value={mfaDisablePassword}
                  onChange={(e) => setMfaDisablePassword(e.target.value)}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowMfaDisable(false); setMfaDisablePassword('') }} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                  <button type="submit" disabled={mfaBusy} className="flex items-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 transition-colors disabled:opacity-60">
                    {mfaBusy && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد التعطيل
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : !mfaEnrolling ? (
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-4">غير مفعّلة — يمكنك تفعيلها لحماية إضافية لحسابك عبر تطبيق مصادقة (مثل Google Authenticator)</p>
            <button onClick={startMfaEnrollment} disabled={mfaBusy} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
              {mfaBusy && <Loader2 className="h-4 w-4 animate-spin" />} تفعيل المصادقة الثنائية
            </button>
          </div>
        ) : (
          <form onSubmit={confirmMfaEnrollment} className="space-y-4 text-right max-w-md">
            <p className="text-sm text-muted-foreground">
              أضف هذا المفتاح يدوياً في تطبيق المصادقة الخاص بك (مثل Google Authenticator أو Authy)، ثم أدخل الرمز المكوّن من 6 أرقام لتأكيد التفعيل:
            </p>
            <div className="rounded-md border border-border bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">المفتاح السري</p>
              <p dir="ltr" className="font-mono text-sm tracking-wider text-foreground break-all">{mfaSecret}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">رمز التحقق</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                required
                dir="ltr"
                className="w-40 rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setMfaEnrolling(false); setMfaCode('') }} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
              <button type="submit" disabled={mfaBusy || mfaCode.length !== 6} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                {mfaBusy && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد التفعيل
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Roles & Permissions */}
      {canManageSettings && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border px-6 py-4 bg-secondary/30 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">الأدوار والصلاحيات</h3>
          </div>
          <div className="grid gap-0 md:grid-cols-[220px_1fr]">
            <div className="border-b md:border-b-0 md:border-l border-border p-4 space-y-1">
              {roles.map((r) => (
                <div key={r.name} className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedRole(r.name)}
                    className={`flex-1 text-right rounded-md px-3 py-2 text-sm transition-colors ${
                      selectedRole === r.name ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    {r.name}
                    {r.isSystem && <span className="mr-1.5 text-[10px] text-muted-foreground">(أساسي)</span>}
                  </button>
                  {!r.isSystem && (
                    <button onClick={() => deleteRole(r.name)} className="p-1.5 text-muted-foreground hover:text-danger transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-1 pt-2 border-t border-border mt-2">
                <input
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="دور جديد"
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button onClick={addRole} className="rounded-md bg-primary/10 p-1.5 text-primary hover:bg-primary/20 transition-colors">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {currentRole ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
                    {ALL_PERMISSIONS.map((perm) => (
                      <label key={perm} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rolePerms.includes(perm)}
                          onChange={() => togglePerm(perm)}
                          disabled={currentRole.isSystem && currentRole.name === 'مدير النظام'}
                          className="h-4 w-4 rounded border-input"
                        />
                        {perm}
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={saveRolePerms}
                    disabled={savingRole || (currentRole.isSystem && currentRole.name === 'مدير النظام')}
                    className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {savingRole && <Loader2 className="h-4 w-4 animate-spin" />}
                    حفظ صلاحيات الدور
                  </button>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">اختر دوراً من القائمة</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Users */}
      {canManageUsers && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border px-6 py-4 flex justify-between items-center bg-secondary/30">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">المستخدمون</h3>
            </div>
            <button
              onClick={openCreateUser}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              إضافة مستخدم
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">الاسم</th>
                  <th className="px-6 py-4 font-medium">اسم المستخدم</th>
                  <th className="px-6 py-4 font-medium">البريد الإلكتروني</th>
                  <th className="px-6 py-4 font-medium">الدور</th>
                  <th className="px-6 py-4 font-medium">الفرع</th>
                  <th className="px-6 py-4 font-medium">الحالة</th>
                  <th className="px-6 py-4 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">لا يوجد مستخدمون</td></tr>
                ) : users.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{u.name}</td>
                    <td className="px-6 py-4 text-muted-foreground" dir="ltr">{u.username}</td>
                    <td className="px-6 py-4 text-muted-foreground" dir="ltr">{u.email || '—'}</td>
                    <td className="px-6 py-4">{u.role}</td>
                    <td className="px-6 py-4 text-muted-foreground">{u.branch}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                        ${u.isActive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                        {u.isActive ? 'نشط' : 'موقوف'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditUser(u)} className="text-primary hover:text-primary/80 transition-colors p-1">
                          <Pencil className="h-4 w-4" />
                        </button>
                        {u.id !== me?.id && (
                          <button onClick={() => deleteUser(u)} className="text-danger hover:text-danger/80 transition-colors p-1">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Commission Rules */}
      {canManageSettings && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border px-6 py-4 flex justify-between items-center bg-secondary/30">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">قواعد العمولة</h3>
            </div>
            <button
              onClick={openCreateRule}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              إضافة قاعدة
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">الاسم</th>
                  <th className="px-6 py-4 font-medium">العملة</th>
                  <th className="px-6 py-4 font-medium">نوع العميل</th>
                  <th className="px-6 py-4 font-medium">النطاق</th>
                  <th className="px-6 py-4 font-medium">القيمة</th>
                  <th className="px-6 py-4 font-medium">الأولوية</th>
                  <th className="px-6 py-4 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rules.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">لا توجد قواعد عمولة</td></tr>
                ) : rules.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{r.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{r.currency || 'الكل'}</td>
                    <td className="px-6 py-4 text-muted-foreground">{r.customerType === 'company' ? 'شركة' : r.customerType === 'individual' ? 'فرد' : 'الكل'}</td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">{r.minAmount} — {r.maxAmount ?? '∞'}</td>
                    <td className="px-6 py-4 font-medium">{r.rateValue}{r.rateType === 'percentage' ? '%' : ' د.ل'}</td>
                    <td className="px-6 py-4">{r.priority}</td>
                    <td className="px-6 py-4">
                      <button onClick={() => deleteRule(r)} className="text-danger hover:text-danger/80 transition-colors p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit & Login Logs */}
      {canViewLogs && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4 flex justify-between items-center bg-secondary/30">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">سجل التدقيق</h3>
              </div>
              <button onClick={verifyChain} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                <ShieldAlert className="h-3.5 w-3.5" /> تحقق من السلامة
              </button>
            </div>
            {chainStatus && (
              <div className={`flex items-center gap-2 px-6 py-2 text-xs font-medium ${chainStatus.valid ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                {chainStatus.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                {chainStatus.valid ? 'السجل سليم ولم يتم التلاعب به' : 'تنبيه: تم اكتشاف كسر في سلسلة السجل'}
              </div>
            )}
            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {auditLogs.length === 0 ? (
                <p className="px-6 py-8 text-center text-muted-foreground text-sm">لا توجد سجلات</p>
              ) : auditLogs.slice(0, 50).map((log) => (
                <div key={log.id} className="px-6 py-3 text-right">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                    <span className="text-xs font-medium text-foreground">{log.user} — {log.action}</span>
                  </div>
                  <p className="text-sm text-foreground mt-1">{log.details}</p>
                  <p dir="ltr" className="text-[10px] text-muted-foreground mt-1 text-right">{log.ip} · {log.device}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4 bg-secondary/30">
              <h3 className="text-lg font-semibold text-foreground">سجل تسجيل الدخول</h3>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase sticky top-0">
                  <tr>
                    <th className="px-6 py-3 font-medium">المستخدم</th>
                    <th className="px-6 py-3 font-medium">الوقت</th>
                    <th className="px-6 py-3 font-medium">IP</th>
                    <th className="px-6 py-3 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loginLogs.length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">لا توجد سجلات دخول</td></tr>
                  ) : loginLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-3 font-medium text-foreground">{log.user}</td>
                      <td className="px-6 py-3 text-muted-foreground">{log.loginTime}</td>
                      <td className="px-6 py-3 text-muted-foreground" dir="ltr">{log.ip || '—'}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                          ${log.status === 'successful' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                          {log.status === 'successful' ? 'ناجح' : 'فاشل'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Assistant */}
      {canManageSettings && (
        <div className="rounded-xl border border-border bg-card shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <MessageCircle className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">مساعد واتساب للمدير</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            يتطلب حساب Meta Business App مع WhatsApp Cloud API — سجّل رابط الويب هوك التالي في إعدادات التطبيق على Meta:
          </p>
          <div dir="ltr" className="mb-4 rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs font-mono text-foreground break-all">
            {whatsappWebhookUrl}
          </div>

          <fieldset className="space-y-4 text-right">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">تفعيل مساعد واتساب</span>
              <Toggle checked={!!settings.whatsappEnabled} onChange={(v) => setField('whatsappEnabled', v)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">رقم هاتف المدير (بصيغة دولية بدون +)</label>
                <input
                  value={settings.whatsappManagerPhone || ''}
                  onChange={(e) => setField('whatsappManagerPhone', e.target.value)}
                  placeholder="218911234567"
                  dir="ltr"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Phone Number ID</label>
                <input
                  value={settings.whatsappPhoneNumberId || ''}
                  onChange={(e) => setField('whatsappPhoneNumberId', e.target.value)}
                  dir="ltr"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Access Token</label>
              <input
                type="password"
                value={settings.whatsappAccessToken || ''}
                onChange={(e) => setField('whatsappAccessToken', e.target.value)}
                dir="ltr"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Verify Token (للويب هوك)</label>
                <input
                  value={settings.whatsappVerifyToken || ''}
                  onChange={(e) => setField('whatsappVerifyToken', e.target.value)}
                  dir="ltr"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">App Secret (اختياري — للتحقق من التوقيع)</label>
                <input
                  type="password"
                  value={settings.whatsappAppSecret || ''}
                  onChange={(e) => setField('whatsappAppSecret', e.target.value)}
                  dir="ltr"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">اسم القالب المعتمد (لتنبيهات النظام — Business-initiated)</label>
              <input
                value={settings.whatsappTemplateName || ''}
                onChange={(e) => setField('whatsappTemplateName', e.target.value)}
                dir="ltr"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">تنبيه عند عملية تستوجب المراجعة (AML)</span>
                <Toggle checked={!!settings.whatsappAlertCompliance} onChange={(v) => setField('whatsappAlertCompliance', v)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">تنبيه عند فروقات إقفال وردية</span>
                <Toggle checked={!!settings.whatsappAlertShiftDiscrepancy} onChange={(v) => setField('whatsappAlertShiftDiscrepancy', v)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">ملخص نهاية اليوم التلقائي</span>
                <Toggle checked={!!settings.whatsappDailySummaryEnabled} onChange={(v) => setField('whatsappDailySummaryEnabled', v)} />
              </div>
              {!!settings.whatsappDailySummaryEnabled && (
                <div className="max-w-[10rem]">
                  <label className="block text-sm font-medium text-foreground mb-1">ساعة الإرسال (توقيت ليبيا، 0-23)</label>
                  <input
                    type="number" min={0} max={23}
                    value={settings.whatsappDailySummaryHour ?? 20}
                    onChange={(e) => setField('whatsappDailySummaryHour', parseInt(e.target.value) || 0)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={sendWhatsappTest}
                disabled={sendingWhatsappTest}
                className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60"
              >
                {sendingWhatsappTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                إرسال رسالة اختبار
              </button>
              {whatsappTestResult && (
                <span className={`text-sm ${whatsappTestResult.ok ? 'text-success' : 'text-danger'}`}>{whatsappTestResult.message}</span>
              )}
            </div>
          </fieldset>
        </div>
      )}

      {/* Backups */}
      {canManageSettings && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border px-6 py-4 flex justify-between items-center bg-secondary/30">
            <div className="flex items-center gap-2">
              <DatabaseBackup className="h-4 w-4 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">النسخ الاحتياطي لقاعدة البيانات</h3>
            </div>
            <button
              onClick={triggerBackup}
              disabled={creatingBackup}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {creatingBackup && <Loader2 className="h-4 w-4 animate-spin" />}
              إنشاء نسخة احتياطية الآن
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">التاريخ</th>
                  <th className="px-6 py-4 font-medium">النوع</th>
                  <th className="px-6 py-4 font-medium">الحجم</th>
                  <th className="px-6 py-4 font-medium">بواسطة</th>
                  <th className="px-6 py-4 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {backups.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">لا توجد نسخ احتياطية بعد</td></tr>
                ) : backups.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">{b.timestamp}</td>
                    <td className="px-6 py-4">{b.type}</td>
                    <td className="px-6 py-4">{b.size}</td>
                    <td className="px-6 py-4 text-muted-foreground">{b.user}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-success/10 text-success">{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Commission Rule Modal */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">إضافة قاعدة عمولة</h3>
              <button onClick={() => setShowRuleModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitRule} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">اسم القاعدة *</label>
                <input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
                  <select value={ruleForm.currency} onChange={(e) => setRuleForm({ ...ruleForm, currency: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">كل العملات</option>
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">نوع العميل</label>
                  <select value={ruleForm.customerType} onChange={(e) => setRuleForm({ ...ruleForm, customerType: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">الكل</option>
                    <option value="individual">فرد</option>
                    <option value="company">شركة</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الحد الأدنى للمبلغ</label>
                  <input type="number" value={ruleForm.minAmount} onChange={(e) => setRuleForm({ ...ruleForm, minAmount: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الحد الأقصى (اختياري)</label>
                  <input type="number" value={ruleForm.maxAmount} onChange={(e) => setRuleForm({ ...ruleForm, maxAmount: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">نوع القيمة</label>
                  <select value={ruleForm.rateType} onChange={(e) => setRuleForm({ ...ruleForm, rateType: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="percentage">نسبة %</option>
                    <option value="fixed">مبلغ ثابت</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">القيمة *</label>
                  <input type="number" value={ruleForm.rateValue} onChange={(e) => setRuleForm({ ...ruleForm, rateValue: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الأولوية</label>
                  <input type="number" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              {ruleFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{ruleFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRuleModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={savingRule} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {savingRule && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}</h3>
              <button onClick={() => setShowUserModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitUser} className="space-y-4 p-6 text-right max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الاسم الكامل *</label>
                  <input
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">اسم المستخدم *</label>
                  <input
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    dir="ltr"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1 flex items-center gap-1">
                  <KeyRound className="h-3.5 w-3.5" />
                  {editingUser ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء الحالية)' : 'كلمة المرور *'}
                </label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">البريد الإلكتروني</label>
                  <input
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    dir="ltr"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رقم الهاتف</label>
                  <input
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    dir="ltr"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الدور *</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">اختر</option>
                    {roles.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الفرع *</label>
                  <select
                    value={userForm.branch}
                    onChange={(e) => setUserForm({ ...userForm, branch: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">اختر</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الخزنة المصرح بها</label>
                  <select
                    value={userForm.allowedVaultId}
                    onChange={(e) => setUserForm({ ...userForm, allowedVaultId: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">بدون تحديد</option>
                    {vaults.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-foreground self-end pb-2">
                  <input
                    type="checkbox"
                    checked={userForm.isActive}
                    onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-input"
                  />
                  حساب نشط
                </label>
              </div>

              {userFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{userFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowUserModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {savingUser && <Loader2 className="h-4 w-4 animate-spin" />}
                  حفظ المستخدم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
