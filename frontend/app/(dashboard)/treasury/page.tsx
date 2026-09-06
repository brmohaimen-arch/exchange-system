'use client'

import { useEffect, useMemo, useState, FormEvent } from 'react'
import { Landmark, ArrowRightLeft, X, Loader2, Building2, Clock, ShieldCheck, Check, Ban, Plus, MapPin, Pencil, Trash2, ClipboardList, Receipt, Lock, Eye } from 'lucide-react'
import { api, newId, Vault, Currency, Bank, BankAccount, BankBranch, Branch, Shift, ApprovalRequestDTO, InventoryCountDTO, DailyExpenseDTO, EXPENSE_CATEGORIES, Transaction } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'
import { TablePagination, paginate } from '@/components/TablePagination'
import { useConfirm } from '@/components/ConfirmProvider'

interface TransferRow {
  id: string
  sourceName: string
  destName: string
  currency: string
  amount: number
  status: string
  requestedBy: string
  timestamp: string
}

const vaultTypeLabels: Record<string, string> = { main: 'رئيسية', branch: 'فرع', cashier: 'صندوق' }
const statusLabels: Record<string, { label: string; className: string }> = {
  pending: { label: 'بانتظار الموافقة', className: 'bg-warning/10 text-warning' },
  pending_open: { label: 'بانتظار الموافقة على الفتح', className: 'bg-warning/10 text-warning' },
  approved: { label: 'تمت الموافقة', className: 'bg-success/10 text-success' },
  rejected: { label: 'مرفوضة', className: 'bg-danger/10 text-danger' },
  open: { label: 'مفتوحة', className: 'bg-info/10 text-info' },
  closed: { label: 'مغلقة', className: 'bg-muted text-muted-foreground' },
}
const approvalTypeLabels: Record<string, string> = { transfer: 'تحويل أموال', shift: 'إقفال وردية', shift_open: 'فتح وردية', inventory: 'جرد', reversal: 'عكس عملية' }
const txTypeLabels: Record<string, string> = { buy: 'شراء', sell: 'بيع', exchange: 'تبديل', deposit: 'إيداع', withdraw: 'سحب' }

const tabs = [
  { key: 'vaults', label: 'الخزنات', icon: Landmark },
  { key: 'branches', label: 'الفروع', icon: MapPin },
  { key: 'banks', label: 'البنوك', icon: Building2 },
  { key: 'shifts', label: 'الورديات', icon: Clock },
  { key: 'inventory', label: 'الجرد', icon: ClipboardList },
  { key: 'expenses', label: 'المصاريف اليومية', icon: Receipt },
  { key: 'approvals', label: 'طلبات الموافقة', icon: ShieldCheck },
] as const
type TabKey = typeof tabs[number]['key']

type AccountOption = { type: 'vault' | 'bank_account'; id: string; label: string }

function emptyTransferForm() {
  return { sourceType: 'vault' as 'vault' | 'bank_account', sourceId: '', destType: 'vault' as 'vault' | 'bank_account', destId: '', currency: 'LYD', amount: '', notes: '' }
}
function emptyVaultForm() {
  return { id: '', name: '', type: 'branch', branch: '', manager: '' }
}
function emptyBranchForm() {
  return { name: '', city: '', address: '', phone: '', manager: '', notes: '' }
}
function emptyBankForm() {
  return { name: '', code: '', country: 'ليبيا', city: '', phone: '', notes: '' }
}
function emptyBankAccountForm() {
  return { bankId: '', branchId: '', accountName: '', accountNumber: '', currency: 'LYD', balance: '0', newBranch: false, newBranchName: '', newBranchCity: '', newBranchAddress: '', newBranchPhone: '', newBranchManager: '' }
}
function emptyInventoryForm() {
  return { vaultId: '', currency: 'LYD', actualBalance: '', reason: '', notes: '' }
}
function emptyExpenseForm() {
  return { date: new Date().toISOString().slice(0, 10), category: 'rent' as string, amount: '', currency: 'LYD', description: '' }
}

export default function TreasuryPage() {
  const { user, hasPermission } = useAuth()
  const confirmDialog = useConfirm()
  const canTransfer = hasPermission('تحويل بين الخزنات')
  const canOpenShift = hasPermission('فتح وردية')
  const canManageVaults = hasPermission('إدارة الخزنات')
  const canManageBranches = hasPermission('إدارة الفروع')
  const canManageBanks = hasPermission('إدارة البنوك')

  const [tab, setTab] = useState<TabKey>('vaults')
  const [vaults, setVaults] = useState<Vault[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [bankBranches, setBankBranches] = useState<BankBranch[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null)
  const [approvals, setApprovals] = useState<ApprovalRequestDTO[]>([])
  const [inventoryCounts, setInventoryCounts] = useState<InventoryCountDTO[]>([])
  const [expenses, setExpenses] = useState<DailyExpenseDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferForm, setTransferForm] = useState(emptyTransferForm())
  const [transferError, setTransferError] = useState('')

  const [showVaultModal, setShowVaultModal] = useState(false)
  const [editingVault, setEditingVault] = useState<Vault | null>(null)
  const [vaultForm, setVaultForm] = useState(emptyVaultForm())
  const [vaultFormError, setVaultFormError] = useState('')

  const [showBranchModal, setShowBranchModal] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [branchForm, setBranchForm] = useState(emptyBranchForm())
  const [branchFormError, setBranchFormError] = useState('')

  const [showBankModal, setShowBankModal] = useState(false)
  const [editingBank, setEditingBank] = useState<Bank | null>(null)
  const [bankForm, setBankForm] = useState(emptyBankForm())
  const [bankFormError, setBankFormError] = useState('')

  const [showAccountModal, setShowAccountModal] = useState(false)
  const [accountForm, setAccountForm] = useState(emptyBankAccountForm())
  const [accountFormError, setAccountFormError] = useState('')

  const [closingShift, setClosingShift] = useState<Shift | null>(null)
  const [closeBalances, setCloseBalances] = useState<Record<string, string>>({})
  const [closeError, setCloseError] = useState('')

  const [showInventoryModal, setShowInventoryModal] = useState(false)
  const [inventoryForm, setInventoryForm] = useState(emptyInventoryForm())
  const [inventoryFormError, setInventoryFormError] = useState('')

  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm())
  const [expenseFormError, setExpenseFormError] = useState('')

  const [saving, setSaving] = useState(false)
  const [actingApprovalId, setActingApprovalId] = useState<string | null>(null)
  const [actingInventoryId, setActingInventoryId] = useState<string | null>(null)
  const [actingExpenseId, setActingExpenseId] = useState<string | null>(null)

  const [transfersPage, setTransfersPage] = useState(1)
  const [bankAccountsPage, setBankAccountsPage] = useState(1)
  const [shiftsPage, setShiftsPage] = useState(1)
  const [inventoryPage, setInventoryPage] = useState(1)
  const [expensesPage, setExpensesPage] = useState(1)
  const [approvalsPage, setApprovalsPage] = useState(1)

  const load = async () => {
    try {
      const [v, c, t, br, b, bb, ba, s, ap, ic, ex, tx] = await Promise.all([
        api.get<Vault[]>('/vaults'),
        api.get<Currency[]>('/currencies'),
        api.get<TransferRow[]>('/transfers'),
        api.get<Branch[]>('/branches'),
        api.get<Bank[]>('/banks'),
        api.get<BankBranch[]>('/bank_branches'),
        api.get<BankAccount[]>('/bank_accounts'),
        api.get<Shift[]>('/shifts'),
        api.get<ApprovalRequestDTO[]>('/approvals'),
        api.get<InventoryCountDTO[]>('/inventory_counts'),
        api.get<DailyExpenseDTO[]>('/daily-expenses'),
        api.get<Transaction[]>('/transactions'),
      ])
      setVaults(v); setCurrencies(c); setTransfers(t); setBranches(br); setBanks(b); setBankBranches(bb); setBankAccounts(ba); setShifts(s); setApprovals(ap)
      setInventoryCounts(ic); setExpenses(ex); setTransactions(tx)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات الخزينة')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const accountOptions: AccountOption[] = useMemo(() => [
    ...vaults.map((v) => ({ type: 'vault' as const, id: v.id, label: `${v.name} (خزنة)` })),
    ...bankAccounts.map((a) => ({ type: 'bank_account' as const, id: a.id, label: `${a.bankName} - ${a.accountName} (حساب بنكي)` })),
  ], [vaults, bankAccounts])

  const accountLabel = (type: 'vault' | 'bank_account', id: string) => accountOptions.find((a) => a.type === type && a.id === id)

  // Newest-first, capped to a page of results — each list is already the full
  // set fetched from the server, so pagination here is purely client-side.
  const sortedTransfers = useMemo(() => [...transfers].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)), [transfers])
  const pagedTransfers = paginate(sortedTransfers, transfersPage)

  const sortedBankAccounts = useMemo(() => [...bankAccounts].reverse(), [bankAccounts])
  const pagedBankAccounts = paginate(sortedBankAccounts, bankAccountsPage)

  const sortedShifts = useMemo(() => [...shifts].sort((a, b) => ((a.requestedAt || a.startTime || '') < (b.requestedAt || b.startTime || '') ? 1 : -1)), [shifts])
  const pagedShifts = paginate(sortedShifts, shiftsPage)

  const sortedInventoryCounts = useMemo(() => [...inventoryCounts].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)), [inventoryCounts])
  const pagedInventoryCounts = paginate(sortedInventoryCounts, inventoryPage)

  // expenses already arrive newest-first from the server (ORDER BY timestamp DESC)
  const pagedExpenses = paginate(expenses, expensesPage)

  const sortedApprovals = useMemo(() => [...approvals].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)), [approvals])
  const pagedApprovals = paginate(sortedApprovals, approvalsPage)

  // ---------------- Transfers ----------------
  const openTransfer = () => {
    setTransferForm(emptyTransferForm())
    setTransferError('')
    setShowTransferModal(true)
  }

  const submitTransfer = async (e: FormEvent) => {
    e.preventDefault()
    setTransferError('')
    const amount = parseFloat(transferForm.amount)
    if (!transferForm.sourceId || !transferForm.destId || (transferForm.sourceType === transferForm.destType && transferForm.sourceId === transferForm.destId) || !amount || amount <= 0) {
      setTransferError('اختر مصدراً ووجهة مختلفين ومبلغاً صحيحاً')
      return
    }
    const source = accountLabel(transferForm.sourceType, transferForm.sourceId)
    const dest = accountLabel(transferForm.destType, transferForm.destId)
    if (!source || !dest) return
    setSaving(true)
    try {
      await api.post('/transfers', {
        id: newId('tr'),
        source_type: transferForm.sourceType,
        source_id: transferForm.sourceId,
        source_name: source.label,
        dest_type: transferForm.destType,
        dest_id: transferForm.destId,
        dest_name: dest.label,
        currency: transferForm.currency,
        amount,
        notes: transferForm.notes.trim() || null,
      })
      setShowTransferModal(false)
      await load()
    } catch (err) {
      setTransferError(err instanceof ApiError ? err.message : 'تعذر إرسال طلب التحويل')
    } finally {
      setSaving(false)
    }
  }

  // ---------------- Vaults ----------------
  const openCreateVault = () => {
    setEditingVault(null)
    setVaultForm(emptyVaultForm())
    setVaultFormError('')
    setShowVaultModal(true)
  }

  const openEditVault = (v: Vault) => {
    setEditingVault(v)
    setVaultForm({ id: v.id, name: v.name, type: v.type, branch: v.branch, manager: v.manager })
    setVaultFormError('')
    setShowVaultModal(true)
  }

  const submitVault = async (e: FormEvent) => {
    e.preventDefault()
    setVaultFormError('')
    if (!vaultForm.name.trim() || !vaultForm.branch || !vaultForm.manager.trim()) {
      setVaultFormError('اسم الخزنة والفرع والمسؤول حقول مطلوبة')
      return
    }
    setSaving(true)
    try {
      if (editingVault) {
        await api.put(`/vaults/${editingVault.id}`, {
          id: editingVault.id,
          name: vaultForm.name.trim(),
          type: vaultForm.type,
          branch: vaultForm.branch,
          manager: vaultForm.manager.trim(),
          balances: editingVault.balances,
          opening_balances: editingVault.openingBalances,
          is_active: editingVault.isActive,
        })
      } else {
        await api.post('/vaults', {
          id: newId('v'),
          name: vaultForm.name.trim(),
          type: vaultForm.type,
          branch: vaultForm.branch,
          manager: vaultForm.manager.trim(),
          balances: {},
          opening_balances: {},
          is_active: true,
        })
      }
      setShowVaultModal(false)
      await load()
    } catch (err) {
      setVaultFormError(err instanceof ApiError ? err.message : 'تعذر حفظ الخزنة')
    } finally {
      setSaving(false)
    }
  }

  // ---------------- Branches ----------------
  const openCreateBranch = () => {
    setEditingBranch(null)
    setBranchForm(emptyBranchForm())
    setBranchFormError('')
    setShowBranchModal(true)
  }

  const openEditBranch = (b: Branch) => {
    setEditingBranch(b)
    setBranchForm({ name: b.name, city: b.city, address: b.address, phone: b.phone, manager: b.manager, notes: b.notes || '' })
    setBranchFormError('')
    setShowBranchModal(true)
  }

  const submitBranch = async (e: FormEvent) => {
    e.preventDefault()
    setBranchFormError('')
    if (!branchForm.name.trim() || !branchForm.city.trim()) {
      setBranchFormError('اسم الفرع والمدينة حقول مطلوبة')
      return
    }
    setSaving(true)
    try {
      const payload = {
        id: editingBranch?.id || branchForm.name.trim(),
        name: branchForm.name.trim(),
        city: branchForm.city.trim(),
        address: branchForm.address.trim(),
        phone: branchForm.phone.trim(),
        manager: branchForm.manager.trim(),
        is_active: true,
        notes: branchForm.notes.trim() || null,
      }
      if (editingBranch) await api.put(`/branches/${editingBranch.id}`, payload)
      else await api.post('/branches', payload)
      setShowBranchModal(false)
      await load()
    } catch (err) {
      setBranchFormError(err instanceof ApiError ? err.message : 'تعذر حفظ الفرع')
    } finally {
      setSaving(false)
    }
  }

  const deleteBranch = async (b: Branch) => {
    if (!(await confirmDialog(`هل تريد حذف فرع "${b.name}"؟`))) return
    try {
      await api.delete(`/branches/${b.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف الفرع')
    }
  }

  // ---------------- Banks ----------------
  const openCreateBank = () => {
    setEditingBank(null)
    setBankForm(emptyBankForm())
    setBankFormError('')
    setShowBankModal(true)
  }

  const openEditBank = (b: Bank) => {
    setEditingBank(b)
    setBankForm({ name: b.name, code: b.code, country: b.country, city: b.city, phone: b.phone, notes: b.notes || '' })
    setBankFormError('')
    setShowBankModal(true)
  }

  const submitBank = async (e: FormEvent) => {
    e.preventDefault()
    setBankFormError('')
    if (!bankForm.name.trim() || !bankForm.code.trim()) {
      setBankFormError('اسم البنك ورمزه حقلان مطلوبان')
      return
    }
    setSaving(true)
    try {
      const payload = {
        id: editingBank?.id || newId('bank'),
        name: bankForm.name.trim(),
        code: bankForm.code.trim(),
        country: bankForm.country.trim(),
        city: bankForm.city.trim(),
        phone: bankForm.phone.trim(),
        is_active: true,
        notes: bankForm.notes.trim() || null,
      }
      if (editingBank) await api.put(`/banks/${editingBank.id}`, payload)
      else await api.post('/banks', payload)
      setShowBankModal(false)
      await load()
    } catch (err) {
      setBankFormError(err instanceof ApiError ? err.message : 'تعذر حفظ البنك')
    } finally {
      setSaving(false)
    }
  }

  const deleteBank = async (b: Bank) => {
    if (!(await confirmDialog(`هل تريد حذف بنك "${b.name}"؟`))) return
    try {
      await api.delete(`/banks/${b.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف البنك')
    }
  }

  const deleteBankAccount = async (a: BankAccount) => {
    if (!(await confirmDialog(`هل تريد حذف الحساب "${a.accountName}"؟`))) return
    try {
      await api.delete(`/bank_accounts/${a.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف الحساب البنكي')
    }
  }

  // ---------------- Bank Accounts ----------------
  const openCreateAccount = () => {
    setAccountForm(emptyBankAccountForm())
    setAccountFormError('')
    setShowAccountModal(true)
  }

  const submitAccount = async (e: FormEvent) => {
    e.preventDefault()
    setAccountFormError('')
    const bank = banks.find((b) => b.id === accountForm.bankId)
    if (!bank || !accountForm.accountName.trim() || !accountForm.accountNumber.trim()) {
      setAccountFormError('البنك واسم الحساب ورقم الحساب حقول مطلوبة')
      return
    }
    if (!accountForm.newBranch && !accountForm.branchId) {
      setAccountFormError('اختر فرع البنك أو أضف فرعاً جديداً')
      return
    }
    if (accountForm.newBranch && !accountForm.newBranchName.trim()) {
      setAccountFormError('اسم الفرع الجديد مطلوب')
      return
    }
    setSaving(true)
    try {
      let branchId = accountForm.branchId
      let branchName = bankBranches.find((bb) => bb.id === accountForm.branchId)?.name || ''
      if (accountForm.newBranch) {
        const newBranchId = newId('bbr')
        await api.post('/bank_branches', {
          id: newBranchId,
          bank_id: bank.id,
          bank_name: bank.name,
          name: accountForm.newBranchName.trim(),
          city: accountForm.newBranchCity.trim(),
          address: accountForm.newBranchAddress.trim(),
          phone: accountForm.newBranchPhone.trim(),
          manager: accountForm.newBranchManager.trim(),
          is_active: true,
        })
        branchId = newBranchId
        branchName = accountForm.newBranchName.trim()
      }
      await api.post('/bank_accounts', {
        id: newId('ba'),
        bank_id: bank.id,
        bank_name: bank.name,
        branch_id: branchId,
        branch_name: branchName,
        account_name: accountForm.accountName.trim(),
        account_number: accountForm.accountNumber.trim(),
        currency: accountForm.currency,
        balance: parseFloat(accountForm.balance) || 0,
        is_active: true,
        notes: null,
      })
      setShowAccountModal(false)
      await load()
    } catch (err) {
      setAccountFormError(err instanceof ApiError ? err.message : 'تعذر إضافة الحساب البنكي')
    } finally {
      setSaving(false)
    }
  }

  // ---------------- Shifts ----------------
  const openShift = async () => {
    if (!vaults.length) return
    const vault = vaults.find((v) => v.id === user?.allowedVaultId) || vaults[0]
    setSaving(true)
    try {
      await api.post('/shifts/open', {
        id: newId('shift'),
        cashier: user?.name || '',
        branch: vault.branch,
        vault_id: vault.id,
        vault_name: vault.name,
        opening_balances: vault.balances,
        notes: null,
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر فتح الوردية')
    } finally {
      setSaving(false)
    }
  }

  const openCloseShift = (shift: Shift) => {
    setClosingShift(shift)
    const vault = vaults.find((v) => v.id === shift.vaultId)
    const initial: Record<string, string> = {}
    Object.keys(vault?.balances || shift.expectedBalances || {}).forEach((ccy) => {
      initial[ccy] = String((vault?.balances || shift.expectedBalances)[ccy] ?? 0)
    })
    setCloseBalances(initial)
    setCloseError('')
  }

  const submitCloseShift = async (e: FormEvent) => {
    e.preventDefault()
    if (!closingShift) return
    setCloseError('')
    setSaving(true)
    const actualBalances: Record<string, number> = {}
    Object.entries(closeBalances).forEach(([ccy, val]) => { actualBalances[ccy] = parseFloat(val) || 0 })
    try {
      await api.post(`/shifts/${closingShift.id}/close`, {
        actual_balances: actualBalances,
        notes: null,
        denomination_breakdown: {},
      })
      setClosingShift(null)
      await load()
    } catch (err) {
      setCloseError(err instanceof ApiError ? err.message : 'تعذر إقفال الوردية')
    } finally {
      setSaving(false)
    }
  }

  const approveShift = async (shift: Shift) => {
    setSaving(true)
    try {
      await api.post(`/shifts/${shift.id}/approve`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر اعتماد إقفال الوردية')
    } finally {
      setSaving(false)
    }
  }

  // ---------------- Inventory Counts ----------------
  const openCreateInventory = () => {
    setInventoryForm(emptyInventoryForm())
    setInventoryFormError('')
    setShowInventoryModal(true)
  }

  const submitInventory = async (e: FormEvent) => {
    e.preventDefault()
    setInventoryFormError('')
    const vault = vaults.find((v) => v.id === inventoryForm.vaultId)
    const actual = parseFloat(inventoryForm.actualBalance)
    if (!vault || isNaN(actual) || actual < 0 || !inventoryForm.reason.trim()) {
      setInventoryFormError('الخزنة والرصيد الفعلي والسبب حقول مطلوبة')
      return
    }
    setSaving(true)
    try {
      await api.post('/inventory_counts', {
        id: newId('ic'),
        vault_id: vault.id,
        vault_name: vault.name,
        currency: inventoryForm.currency,
        system_balance: vault.balances[inventoryForm.currency] || 0,
        actual_balance: actual,
        reason: inventoryForm.reason.trim(),
        notes: inventoryForm.notes.trim() || null,
        reported_by: user?.name || '',
        denomination_breakdown: {},
      })
      setShowInventoryModal(false)
      await load()
    } catch (err) {
      setInventoryFormError(err instanceof ApiError ? err.message : 'تعذر تسجيل الجرد')
    } finally {
      setSaving(false)
    }
  }

  const approveInventory = async (ic: InventoryCountDTO) => {
    setActingInventoryId(ic.id)
    try {
      await api.post(`/inventory_counts/${ic.id}/approve`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر اعتماد الجرد')
    } finally {
      setActingInventoryId(null)
    }
  }

  // ---------------- Daily Expenses ----------------
  const openCreateExpense = () => {
    setExpenseForm(emptyExpenseForm())
    setExpenseFormError('')
    setShowExpenseModal(true)
  }

  const submitExpense = async (e: FormEvent) => {
    e.preventDefault()
    setExpenseFormError('')
    const amount = parseFloat(expenseForm.amount)
    if (!expenseForm.date || !expenseForm.category || isNaN(amount) || amount <= 0) {
      setExpenseFormError('التاريخ والفئة والمبلغ حقول مطلوبة')
      return
    }
    setSaving(true)
    try {
      await api.post('/daily-expenses', {
        id: newId('exp'),
        date: expenseForm.date,
        category: expenseForm.category,
        amount,
        currency: expenseForm.currency,
        description: expenseForm.description.trim() || null,
      })
      setShowExpenseModal(false)
      await load()
    } catch (err) {
      setExpenseFormError(err instanceof ApiError ? err.message : 'تعذر تسجيل المصروف')
    } finally {
      setSaving(false)
    }
  }

  const deleteExpense = async (exp: DailyExpenseDTO) => {
    if (!(await confirmDialog('هل أنت متأكد من حذف هذا المصروف؟'))) return
    setActingExpenseId(exp.id)
    try {
      await api.delete(`/daily-expenses/${exp.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف المصروف')
    } finally {
      setActingExpenseId(null)
    }
  }

  // ---------------- Approvals ----------------
  const actOnApproval = async (a: ApprovalRequestDTO, action: 'approve' | 'reject') => {
    setActingApprovalId(a.id)
    try {
      await api.post(`/approvals/${a.id}/action?action=${action}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تنفيذ الإجراء')
    } finally {
      setActingApprovalId(null)
    }
  }

  const pendingApprovalsCount = approvals.filter((a) => a.status === 'pending').length
  const branchesForSelect = branches
  const canApproveClosings = hasPermission('اعتماد الإقفالات')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">الخزينة والفروع</h2>
        <div className="flex items-center gap-2">
          {tab === 'vaults' && (
            <>
              {canManageVaults && (
                <button onClick={openCreateVault} className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  <Plus className="h-4 w-4" /> إضافة خزنة
                </button>
              )}
              {canTransfer && (
                <button onClick={openTransfer} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  <ArrowRightLeft className="h-4 w-4" /> تحويل أموال
                </button>
              )}
            </>
          )}
          {tab === 'branches' && canManageBranches && (
            <button onClick={openCreateBranch} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus className="h-4 w-4" /> إضافة فرع
            </button>
          )}
          {tab === 'banks' && canManageBanks && (
            <>
              <button onClick={openCreateAccount} className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                <Plus className="h-4 w-4" /> إضافة حساب بنكي
              </button>
              <button onClick={openCreateBank} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> إضافة بنك
              </button>
            </>
          )}
          {tab === 'shifts' && canOpenShift && (
            <button onClick={openShift} disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
              <Plus className="h-4 w-4" /> طلب فتح وردية جديدة
            </button>
          )}
          {tab === 'inventory' && (
            <button onClick={openCreateInventory} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus className="h-4 w-4" /> تسجيل جرد
            </button>
          )}
          {tab === 'expenses' && canManageVaults && (
            <button onClick={openCreateExpense} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus className="h-4 w-4" /> تسجيل مصروف
            </button>
          )}
        </div>
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.key === 'approvals' && pendingApprovalsCount > 0 && (
              <span className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger">{pendingApprovalsCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'vaults' && (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <p className="text-muted-foreground text-sm">جاري التحميل...</p>
            ) : vaults.length === 0 ? (
              <p className="text-muted-foreground text-sm">لا توجد خزنات مسجلة</p>
            ) : vaults.map((vault) => (
              <div key={vault.id} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
                      <Landmark className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{vault.name}</h3>
                      <span className="text-xs text-muted-foreground">{vaultTypeLabels[vault.type] || vault.type} — {vault.branch}</span>
                    </div>
                  </div>
                  {canManageVaults && (
                    <button onClick={() => openEditVault(vault)} title="تعديل" className="text-muted-foreground hover:text-primary transition-colors p-1">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="pt-4 space-y-3">
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>المسؤول</span>
                    <span className="font-medium text-foreground">{vault.manager}</span>
                  </div>
                  {Object.entries(vault.balances).length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا توجد أرصدة</p>
                  ) : Object.entries(vault.balances).map(([ccy, amt]) => (
                    <div key={ccy} className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">رصيد ({ccy})</span>
                      <span className="font-bold text-foreground">{amt.toLocaleString()}</span>
                    </div>
                  ))}
                  {vault.lastMovement && (
                    <p className="pt-2 border-t border-border text-[11px] text-muted-foreground">آخر حركة: {vault.lastMovement}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4 bg-secondary/30">
              <h3 className="text-lg font-semibold text-foreground">طلبات التحويل</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">من</th>
                    <th className="px-6 py-4 font-medium">إلى</th>
                    <th className="px-6 py-4 font-medium">المبلغ</th>
                    <th className="px-6 py-4 font-medium">الحالة</th>
                    <th className="px-6 py-4 font-medium">بواسطة</th>
                    <th className="px-6 py-4 font-medium">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transfers.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">لا توجد طلبات تحويل</td></tr>
                  ) : pagedTransfers.map((t) => {
                    const st = statusLabels[t.status] || statusLabels.pending
                    return (
                      <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-foreground">{t.sourceName}</td>
                        <td className="px-6 py-4">{t.destName}</td>
                        <td className="px-6 py-4 font-medium">{t.amount.toLocaleString()} {t.currency}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{t.requestedBy}</td>
                        <td className="px-6 py-4 text-muted-foreground">{t.timestamp}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination page={transfersPage} totalItems={sortedTransfers.length} onPageChange={setTransfersPage} />
          </div>
        </>
      )}

      {tab === 'branches' && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {branches.length === 0 ? (
            <p className="text-muted-foreground text-sm">لا توجد فروع مسجلة</p>
          ) : branches.map((b) => (
            <div key={b.id} className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{b.name}</h3>
                    <span className="text-xs text-muted-foreground">{b.city}</span>
                  </div>
                </div>
                {canManageBranches && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEditBranch(b)} title="تعديل" className="text-muted-foreground hover:text-primary transition-colors p-1">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteBranch(b)} title="حذف" className="text-muted-foreground hover:text-danger transition-colors p-1">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="pt-4 space-y-1 text-sm">
                <p className="text-muted-foreground">{b.address}</p>
                <p className="text-muted-foreground" dir="ltr">{b.phone}</p>
                <div className="flex justify-between pt-2 border-t border-border mt-2">
                  <span className="text-muted-foreground">المدير</span>
                  <span className="font-medium">{b.manager}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'banks' && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {banks.length === 0 ? (
              <p className="text-muted-foreground text-sm">لا توجد بنوك مسجلة</p>
            ) : banks.map((b) => (
              <div key={b.id} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{b.name}</h3>
                      <span className="text-xs text-muted-foreground">{b.code} — {b.city}, {b.country}</span>
                    </div>
                  </div>
                  {canManageBanks && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditBank(b)} title="تعديل" className="text-muted-foreground hover:text-primary transition-colors p-1">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteBank(b)} title="حذف" className="text-muted-foreground hover:text-danger transition-colors p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                <p className="pt-4 text-xs text-muted-foreground" dir="ltr">{b.phone}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4 bg-secondary/30">
              <h3 className="text-lg font-semibold text-foreground">الحسابات البنكية</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">البنك</th>
                    <th className="px-6 py-4 font-medium">الفرع</th>
                    <th className="px-6 py-4 font-medium">اسم الحساب</th>
                    <th className="px-6 py-4 font-medium">رقم الحساب</th>
                    <th className="px-6 py-4 font-medium">العملة</th>
                    <th className="px-6 py-4 font-medium">الرصيد</th>
                    <th className="px-6 py-4 font-medium">الحالة</th>
                    {canManageBanks && <th className="px-6 py-4 font-medium">إجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bankAccounts.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">لا توجد حسابات بنكية</td></tr>
                  ) : pagedBankAccounts.map((ba) => (
                    <tr key={ba.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{ba.bankName}</td>
                      <td className="px-6 py-4 text-muted-foreground">{ba.branchName}</td>
                      <td className="px-6 py-4">{ba.accountName}</td>
                      <td className="px-6 py-4" dir="ltr">{ba.accountNumber}</td>
                      <td className="px-6 py-4">{ba.currency}</td>
                      <td className="px-6 py-4 font-bold">{ba.balance.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                          ${ba.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                          {ba.isActive ? 'نشط' : 'غير نشط'}
                        </span>
                      </td>
                      {canManageBanks && (
                        <td className="px-6 py-4">
                          <button onClick={() => deleteBankAccount(ba)} title="حذف" className="text-muted-foreground hover:text-danger transition-colors p-1">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={bankAccountsPage} totalItems={sortedBankAccounts.length} onPageChange={setBankAccountsPage} />
          </div>
        </div>
      )}

      {tab === 'shifts' && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">الصراف</th>
                  <th className="px-6 py-4 font-medium">الخزنة</th>
                  <th className="px-6 py-4 font-medium">وقت الفتح</th>
                  <th className="px-6 py-4 font-medium">وقت الإغلاق</th>
                  <th className="px-6 py-4 font-medium">الحالة</th>
                  <th className="px-6 py-4 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shifts.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">لا توجد ورديات مسجلة</td></tr>
                ) : pagedShifts.map((s) => {
                  const st = statusLabels[s.status] || statusLabels.open
                  const pendingApproval = approvals.find((a) => a.type === 'shift_open' && a.referenceId === s.id && a.status === 'pending')
                  return (
                    <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{s.cashier}</td>
                      <td className="px-6 py-4">{s.vaultName}</td>
                      <td className="px-6 py-4 text-muted-foreground">{s.startTime || '—'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{s.endTime || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {s.status === 'pending_open' && pendingApproval && canApproveClosings && (
                            <>
                              <button
                                onClick={() => actOnApproval(pendingApproval, 'approve')}
                                disabled={actingApprovalId === pendingApproval.id}
                                className="flex items-center gap-1 text-success hover:text-success/80 transition-colors text-xs font-medium disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" /> قبول الفتح
                              </button>
                              <button
                                onClick={() => actOnApproval(pendingApproval, 'reject')}
                                disabled={actingApprovalId === pendingApproval.id}
                                className="flex items-center gap-1 text-danger hover:text-danger/80 transition-colors text-xs font-medium disabled:opacity-50"
                              >
                                <Ban className="h-3.5 w-3.5" /> رفض
                              </button>
                            </>
                          )}
                          {s.status === 'open' && canOpenShift && (
                            <button onClick={() => openCloseShift(s)} className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors text-xs font-medium">
                              <Lock className="h-3.5 w-3.5" /> إقفال الوردية
                            </button>
                          )}
                          {s.status === 'closed' && canApproveClosings && (
                            <button onClick={() => approveShift(s)} disabled={saving} className="flex items-center gap-1 text-success hover:text-success/80 transition-colors text-xs font-medium disabled:opacity-50">
                              <Check className="h-3.5 w-3.5" /> اعتماد الإقفال
                            </button>
                          )}
                          {(s.status === 'open' || s.status === 'closed' || s.status === 'approved') && (
                            <button onClick={() => setSelectedShift(s)} title="تفاصيل الجلسة" className="text-muted-foreground hover:text-primary transition-colors p-1">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <TablePagination page={shiftsPage} totalItems={sortedShifts.length} onPageChange={setShiftsPage} />
        </div>
      )}

      {tab === 'inventory' && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">الخزنة</th>
                  <th className="px-6 py-4 font-medium">العملة</th>
                  <th className="px-6 py-4 font-medium">الرصيد الدفتري</th>
                  <th className="px-6 py-4 font-medium">الرصيد الفعلي</th>
                  <th className="px-6 py-4 font-medium">الفرق</th>
                  <th className="px-6 py-4 font-medium">السبب</th>
                  <th className="px-6 py-4 font-medium">الحالة</th>
                  <th className="px-6 py-4 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inventoryCounts.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-10 text-center text-muted-foreground">لا توجد سجلات جرد</td></tr>
                ) : pagedInventoryCounts.map((ic) => (
                  <tr key={ic.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{ic.vaultName}</td>
                    <td className="px-6 py-4">{ic.currency}</td>
                    <td className="px-6 py-4">{ic.systemBalance.toLocaleString()}</td>
                    <td className="px-6 py-4">{ic.actualBalance.toLocaleString()}</td>
                    <td className={`px-6 py-4 font-medium ${ic.difference === 0 ? 'text-muted-foreground' : ic.difference > 0 ? 'text-success' : 'text-danger'}`}>
                      {ic.difference > 0 ? '+' : ''}{ic.difference.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{ic.reason}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                        ${ic.status === 'pending' ? 'bg-warning/10 text-warning' : ic.status === 'approved' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                        {ic.status === 'pending' ? 'بانتظار الاعتماد' : ic.status === 'approved' ? 'معتمد' : 'مرفوض'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {ic.status === 'pending' && canApproveClosings && (
                        <button onClick={() => approveInventory(ic)} disabled={actingInventoryId === ic.id} className="flex items-center gap-1 text-success hover:text-success/80 transition-colors text-xs font-medium disabled:opacity-50">
                          <Check className="h-3.5 w-3.5" /> اعتماد
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={inventoryPage} totalItems={sortedInventoryCounts.length} onPageChange={setInventoryPage} />
        </div>
      )}

      {tab === 'expenses' && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">التاريخ</th>
                  <th className="px-6 py-4 font-medium">الفئة</th>
                  <th className="px-6 py-4 font-medium">المبلغ</th>
                  <th className="px-6 py-4 font-medium">الوصف</th>
                  <th className="px-6 py-4 font-medium">سجّله</th>
                  {canManageVaults && <th className="px-6 py-4 font-medium"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {expenses.length === 0 ? (
                  <tr><td colSpan={canManageVaults ? 6 : 5} className="px-6 py-10 text-center text-muted-foreground">لا توجد مصاريف مسجلة</td></tr>
                ) : pagedExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">{exp.date}</td>
                    <td className="px-6 py-4 font-medium text-foreground">{EXPENSE_CATEGORIES.find((c) => c.value === exp.category)?.label || exp.category}</td>
                    <td className="px-6 py-4 font-medium">{exp.amount.toLocaleString()} {exp.currency}</td>
                    <td className="px-6 py-4 text-muted-foreground">{exp.description || '—'}</td>
                    <td className="px-6 py-4 text-muted-foreground">{exp.recordedBy}</td>
                    {canManageVaults && (
                      <td className="px-6 py-4">
                        <button onClick={() => deleteExpense(exp)} disabled={actingExpenseId === exp.id} className="flex items-center gap-1 text-danger hover:text-danger/80 transition-colors text-xs font-medium disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" /> حذف
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={expensesPage} totalItems={expenses.length} onPageChange={setExpensesPage} />
        </div>
      )}

      {tab === 'approvals' && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">النوع</th>
                  <th className="px-6 py-4 font-medium">العنوان</th>
                  <th className="px-6 py-4 font-medium">المبلغ</th>
                  <th className="px-6 py-4 font-medium">طلب بواسطة</th>
                  <th className="px-6 py-4 font-medium">التاريخ</th>
                  <th className="px-6 py-4 font-medium">الحالة</th>
                  <th className="px-6 py-4 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {approvals.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">لا توجد طلبات موافقة</td></tr>
                ) : pagedApprovals.map((a) => {
                  const st = statusLabels[a.status] || statusLabels.pending
                  return (
                    <tr key={a.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4">{approvalTypeLabels[a.type] || a.type}</td>
                      <td className="px-6 py-4 font-medium text-foreground">{a.title}</td>
                      <td className="px-6 py-4">{a.amount ? `${a.amount.toLocaleString()} ${a.currency || ''}` : '—'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{a.requestedBy}</td>
                      <td className="px-6 py-4 text-muted-foreground">{a.timestamp}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
                      </td>
                      <td className="px-6 py-4">
                        {a.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => actOnApproval(a, 'approve')}
                              disabled={actingApprovalId === a.id}
                              className="flex items-center gap-1 text-success hover:text-success/80 transition-colors text-xs font-medium disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" /> موافقة
                            </button>
                            <button
                              onClick={() => actOnApproval(a, 'reject')}
                              disabled={actingApprovalId === a.id}
                              className="flex items-center gap-1 text-danger hover:text-danger/80 transition-colors text-xs font-medium disabled:opacity-50"
                            >
                              <Ban className="h-3.5 w-3.5" /> رفض
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <TablePagination page={approvalsPage} totalItems={sortedApprovals.length} onPageChange={setApprovalsPage} />
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">تحويل أموال</h3>
              <button onClick={() => setShowTransferModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitTransfer} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">من حساب *</label>
                <select
                  value={transferForm.sourceType === 'vault' ? `vault:${transferForm.sourceId}` : `bank_account:${transferForm.sourceId}`}
                  onChange={(e) => { const [type, id] = e.target.value.split(':'); setTransferForm({ ...transferForm, sourceType: type as any, sourceId: id }) }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value=":">اختر</option>
                  {accountOptions.map((a) => <option key={`${a.type}:${a.id}`} value={`${a.type}:${a.id}`}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">إلى حساب *</label>
                <select
                  value={transferForm.destType === 'vault' ? `vault:${transferForm.destId}` : `bank_account:${transferForm.destId}`}
                  onChange={(e) => { const [type, id] = e.target.value.split(':'); setTransferForm({ ...transferForm, destType: type as any, destId: id }) }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value=":">اختر</option>
                  {accountOptions.map((a) => <option key={`${a.type}:${a.id}`} value={`${a.type}:${a.id}`}>{a.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
                  <select
                    value={transferForm.currency}
                    onChange={(e) => setTransferForm({ ...transferForm, currency: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.nameAr} ({c.code})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">المبلغ *</label>
                  <input
                    type="number"
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea
                  value={transferForm.notes}
                  onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <p className="text-xs text-muted-foreground">سيتم إرسال هذا الطلب للموافقة قبل تنفيذه فعلياً.</p>
              {transferError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{transferError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTransferModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} إرسال الطلب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vault Modal */}
      {showVaultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editingVault ? 'تعديل الخزنة' : 'إضافة خزنة جديدة'}</h3>
              <button onClick={() => setShowVaultModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitVault} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">اسم الخزنة *</label>
                <input value={vaultForm.name} onChange={(e) => setVaultForm({ ...vaultForm, name: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">النوع</label>
                <select value={vaultForm.type} onChange={(e) => setVaultForm({ ...vaultForm, type: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="main">رئيسية</option>
                  <option value="branch">فرع</option>
                  <option value="cashier">صندوق</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الفرع *</label>
                <select value={vaultForm.branch} onChange={(e) => setVaultForm({ ...vaultForm, branch: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">اختر</option>
                  {branchesForSelect.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">المسؤول *</label>
                <input value={vaultForm.manager} onChange={(e) => setVaultForm({ ...vaultForm, manager: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              {vaultFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{vaultFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowVaultModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Branch Modal */}
      {showBranchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editingBranch ? 'تعديل الفرع' : 'إضافة فرع جديد'}</h3>
              <button onClick={() => setShowBranchModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitBranch} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">اسم الفرع *</label>
                <input value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">المدينة *</label>
                <input value={branchForm.city} onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">العنوان</label>
                <input value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الهاتف</label>
                  <input value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">المدير</label>
                  <input value={branchForm.manager} onChange={(e) => setBranchForm({ ...branchForm, manager: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              {branchFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{branchFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowBranchModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bank Modal */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editingBank ? 'تعديل البنك' : 'إضافة بنك جديد'}</h3>
              <button onClick={() => setShowBankModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitBank} className="space-y-4 p-6 text-right">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">اسم البنك *</label>
                  <input value={bankForm.name} onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الرمز *</label>
                  <input value={bankForm.code} onChange={(e) => setBankForm({ ...bankForm, code: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الدولة</label>
                  <input value={bankForm.country} onChange={(e) => setBankForm({ ...bankForm, country: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">المدينة</label>
                  <input value={bankForm.city} onChange={(e) => setBankForm({ ...bankForm, city: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الهاتف</label>
                <input value={bankForm.phone} onChange={(e) => setBankForm({ ...bankForm, phone: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              {bankFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{bankFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowBankModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bank Account Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">إضافة حساب بنكي</h3>
              <button onClick={() => setShowAccountModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitAccount} className="space-y-4 p-6 text-right max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">البنك *</label>
                <select value={accountForm.bankId} onChange={(e) => setAccountForm({ ...accountForm, bankId: e.target.value, branchId: '' })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">اختر بنكاً</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {!accountForm.newBranch ? (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الفرع</label>
                  <div className="flex items-center gap-2">
                    <select value={accountForm.branchId} onChange={(e) => setAccountForm({ ...accountForm, branchId: e.target.value })} className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <option value="">اختر فرعاً</option>
                      {bankBranches.filter((bb) => bb.bankId === accountForm.bankId).map((bb) => <option key={bb.id} value={bb.id}>{bb.name}</option>)}
                    </select>
                    <button type="button" onClick={() => setAccountForm({ ...accountForm, newBranch: true })} className="whitespace-nowrap text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                      + فرع جديد
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-md border border-dashed border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">بيانات الفرع الجديد</span>
                    <button type="button" onClick={() => setAccountForm({ ...accountForm, newBranch: false })} className="text-xs text-muted-foreground hover:text-foreground">إلغاء</button>
                  </div>
                  <input placeholder="اسم الفرع" value={accountForm.newBranchName} onChange={(e) => setAccountForm({ ...accountForm, newBranchName: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="المدينة" value={accountForm.newBranchCity} onChange={(e) => setAccountForm({ ...accountForm, newBranchCity: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    <input placeholder="المدير" value={accountForm.newBranchManager} onChange={(e) => setAccountForm({ ...accountForm, newBranchManager: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                  <input placeholder="العنوان" value={accountForm.newBranchAddress} onChange={(e) => setAccountForm({ ...accountForm, newBranchAddress: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  <input placeholder="الهاتف" dir="ltr" value={accountForm.newBranchPhone} onChange={(e) => setAccountForm({ ...accountForm, newBranchPhone: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">اسم الحساب *</label>
                  <input value={accountForm.accountName} onChange={(e) => setAccountForm({ ...accountForm, accountName: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رقم الحساب *</label>
                  <input value={accountForm.accountNumber} onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
                  <select value={accountForm.currency} onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الرصيد الافتتاحي</label>
                  <input type="number" value={accountForm.balance} onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              {accountFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{accountFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAccountModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {closingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">إقفال وردية {closingShift.cashier}</h3>
              <button onClick={() => setClosingShift(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitCloseShift} className="space-y-4 p-6 text-right">
              <p className="text-xs text-muted-foreground">أدخل الرصيد الفعلي المعدود لكل عملة. أي فرق عن الرصيد المتوقع سيُرسل تلقائياً لاعتماد المدير.</p>
              {Object.keys(closeBalances).length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد أرصدة لهذه الخزنة</p>
              ) : Object.entries(closeBalances).map(([ccy, val]) => (
                <div key={ccy} className="flex items-center gap-2">
                  <span className="w-16 text-sm font-medium text-foreground">{ccy}</span>
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => setCloseBalances({ ...closeBalances, [ccy]: e.target.value })}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              ))}

              {closeError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{closeError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setClosingShift(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} إقفال الوردية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inventory Count Modal */}
      {showInventoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">تسجيل جرد</h3>
              <button onClick={() => setShowInventoryModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitInventory} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الخزنة *</label>
                <select value={inventoryForm.vaultId} onChange={(e) => setInventoryForm({ ...inventoryForm, vaultId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">اختر</option>
                  {vaults.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
                  <select value={inventoryForm.currency} onChange={(e) => setInventoryForm({ ...inventoryForm, currency: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الرصيد الفعلي المعدود *</label>
                  <input type="number" value={inventoryForm.actualBalance} onChange={(e) => setInventoryForm({ ...inventoryForm, actualBalance: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">السبب *</label>
                <input value={inventoryForm.reason} onChange={(e) => setInventoryForm({ ...inventoryForm, reason: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea value={inventoryForm.notes} onChange={(e) => setInventoryForm({ ...inventoryForm, notes: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              {inventoryFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{inventoryFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowInventoryModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Daily Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">تسجيل مصروف يومي</h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitExpense} className="space-y-4 p-6 text-right">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">التاريخ *</label>
                  <input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الفئة *</label>
                  <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
                  <select value={expenseForm.currency} onChange={(e) => setExpenseForm({ ...expenseForm, currency: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">المبلغ *</label>
                  <input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">وصف (اختياري)</label>
                <textarea value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              {expenseFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{expenseFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shift Session Detail */}
      {selectedShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">تفاصيل الجلسة — {selectedShift.cashier}</h3>
                <p className="text-xs text-muted-foreground">{selectedShift.vaultName}</p>
              </div>
              <button onClick={() => setSelectedShift(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-6 text-right">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">الحالة</span><span className="font-medium">{(statusLabels[selectedShift.status] || statusLabels.open).label}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">طلب الفتح</span><span className="font-medium">{selectedShift.requestedAt || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">وقت الفتح الفعلي</span><span className="font-medium">{selectedShift.startTime || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">وقت الإغلاق</span><span className="font-medium">{selectedShift.endTime || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">اعتُمد بواسطة</span><span className="font-medium">{selectedShift.approvedBy || '—'}</span></div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">الأرصدة</h4>
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">العملة</th>
                        <th className="px-3 py-2 font-medium">افتتاحي</th>
                        <th className="px-3 py-2 font-medium">متوقع</th>
                        <th className="px-3 py-2 font-medium">فعلي</th>
                        <th className="px-3 py-2 font-medium">الفرق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {Object.keys(selectedShift.expectedBalances).map((ccy) => {
                        const diff = selectedShift.differences[ccy]
                        return (
                          <tr key={ccy}>
                            <td className="px-3 py-2 font-medium">{ccy}</td>
                            <td className="px-3 py-2">{(selectedShift.openingBalances[ccy] ?? 0).toLocaleString()}</td>
                            <td className="px-3 py-2">{(selectedShift.expectedBalances[ccy] ?? 0).toLocaleString()}</td>
                            <td className="px-3 py-2">{ccy in selectedShift.actualBalances ? selectedShift.actualBalances[ccy].toLocaleString() : '—'}</td>
                            <td className={`px-3 py-2 font-medium ${diff ? (diff > 0 ? 'text-success' : 'text-danger') : 'text-muted-foreground'}`}>
                              {diff !== undefined ? (diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">
                  عمليات هذه الجلسة ({transactions.filter((t) => t.shiftId === selectedShift.id).length})
                </h4>
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">النوع</th>
                        <th className="px-3 py-2 font-medium">العميل</th>
                        <th className="px-3 py-2 font-medium">المبلغ</th>
                        <th className="px-3 py-2 font-medium">الإجمالي</th>
                        <th className="px-3 py-2 font-medium">الوقت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {transactions.filter((t) => t.shiftId === selectedShift.id).length === 0 ? (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">لا توجد عمليات مسجلة تحت هذه الجلسة</td></tr>
                      ) : transactions.filter((t) => t.shiftId === selectedShift.id).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).map((t) => (
                        <tr key={t.id}>
                          <td className="px-3 py-2 font-medium">{txTypeLabels[t.type] || t.type}</td>
                          <td className="px-3 py-2">{t.customerName || '—'}</td>
                          <td className="px-3 py-2">{t.amount.toLocaleString()} {t.fromCurrency}</td>
                          <td className="px-3 py-2">{t.totalAmount.toLocaleString()} {t.toCurrency}</td>
                          <td className="px-3 py-2 text-muted-foreground">{t.timestamp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
