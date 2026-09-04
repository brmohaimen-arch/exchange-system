import React, { createContext, useContext, useState, useMemo } from 'react';
import {
  Currency, ExchangeRate, RateHistory, Vault, Bank, BankBranch, BankAccount,
  Customer, Debt, Shift, Transaction, Movement, JournalEntry, AuditLog,
  LoginLog, InventoryCount, Reconciliation, ApprovalRequest,
  FixedAsset, Vehicle, RealEstate, MaintenanceRecord, DepreciationRecord, AssetDocument
} from '../types';
import { PageId, PAGE_PERMISSIONS } from '../config/permissions';

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  role?: string;
  user?: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

export interface ErrorReport {
  id: string;
  timestamp: string;
  user: string;
  page: string;
  action: string;
  errorMessage: string;
}

interface SystemContextType {
  // True until the initial data hydration completes (success or failure) at least once
  isHydrating: boolean;

  // Auth & Session
  currentUser: string | null;
  currentRole: string;
  currentBranch: string;
  currentVaultId: string;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  canAccessPage: (pageId: PageId) => boolean;
  
  // Notifications & Error reports
  notifications: SystemNotification[];
  liveAlerts: SystemNotification[];
  addNotification: (title: string, message: string, type?: 'info' | 'warning' | 'error' | 'success', role?: string, user?: string) => void;
  markNotificationAsRead: (id: string) => void;
  clearNotifications: () => void;
  errorReports: ErrorReport[];
  addErrorReport: (page: string, action: string, errorMessage: string) => void;
  
  // Lists / States
  currencies: Currency[];
  rates: ExchangeRate[];
  rateHistories: RateHistory[];
  vaults: Vault[];
  banks: Bank[];
  bankBranches: BankBranch[];
  bankAccounts: BankAccount[];
  customers: Customer[];
  debts: Debt[];
  shifts: Shift[];
  transactions: Transaction[];
  movements: Movement[];
  journalEntries: JournalEntry[];
  auditLogs: AuditLog[];
  loginLogs: LoginLog[];
  inventoryCounts: InventoryCount[];
  reconciliations: Reconciliation[];
  approvals: ApprovalRequest[];
  branches: { id: string; name: string; city: string; address: string; phone: string; manager: string; isActive: boolean; notes?: string }[];
  users: { id: string; name: string; username: string; password?: string; phone: string; email: string; role: string; branch: string; allowedVaultId: string; isActive: boolean }[];
  rolesPermissions: Record<string, string[]>;
  settings: Record<string, any>;
  backups: { id: string; timestamp: string; type: string; size: string; status: string; user: string }[];

  // Mutators
  addCurrency: (currency: Currency) => void;
  editCurrency: (currency: Currency) => void;
  disableCurrency: (code: string) => void;
  deleteCurrency: (code: string) => Promise<boolean>;
  
  addExchangeRate: (rate: ExchangeRate) => Promise<{ success: boolean; error?: string }>;
  updateExchangeRate: (id: string, buy: number, sell: number, notes?: string) => Promise<{ success: boolean; error?: string }>;
  disableExchangeRate: (id: string) => void;
  
  executePOSOperation: (
    type: 'buy' | 'sell' | 'exchange',
    vaultId: string,
    customerId: string,
    fromCurrency: string,
    toCurrency: string,
    amount: number,
    rate: number,
    commission: number,
    paymentMethod: 'cash' | 'customer_account' | 'bank_account' | 'debt',
    bankAccountId?: string,
    notes?: string
  ) => Promise<{ success: boolean; error?: string; txId?: string }>;

  executeCustomerOperation: (
    type: 'deposit' | 'withdraw',
    customerId: string,
    currency: string,
    amount: number,
    paymentMethod: 'vault' | 'bank_account',
    sourceId: string, // vaultId or bankAccountId
    notes?: string
  ) => { success: boolean; error?: string };

  createTransfer: (
    sourceType: 'vault' | 'bank_account',
    sourceId: string,
    destType: 'vault' | 'bank_account',
    destId: string,
    currency: string,
    amount: number,
    notes?: string
  ) => void;

  updateTransferStatus: (id: string, action: 'approve' | 'reject' | 'send' | 'receive' | 'cancel') => void;

  addDebt: (debt: Omit<Debt, 'id' | 'paidAmount' | 'remainingAmount' | 'status'>) => void;
  payDebt: (id: string, amount: number, notes?: string) => Promise<{ success: boolean; error?: string }>;

  openShift: (vaultId: string, openingBalances: Record<string, number>, notes?: string) => void;
  closeShift: (shiftId: string, actualBalances: Record<string, number>, notes?: string) => void;
  approveShift: (shiftId: string) => void;

  submitInventoryCount: (
    vaultId: string,
    currency: string,
    systemBalance: number,
    actualBalance: number,
    reason: 'shortage' | 'overage' | 'counting_error' | 'damaged_cash' | 'admin_settlement',
    notes?: string
  ) => void;
  approveInventoryCount: (id: string) => void;
  rejectInventoryCount: (id: string) => void;

  requestReconciliation: (
    type: 'vault' | 'bank' | 'customer' | 'inventory',
    targetId: string,
    currency: string,
    amount: number,
    reason: string,
    notes?: string
  ) => void;
  approveReconciliation: (id: string) => void;

  requestReversal: (originalTxId: string, reason: string) => { success: boolean; error?: string };
  approveReversal: (approvalId: string) => void;
  rejectReversal: (approvalId: string) => void;

  // Management Admins CRUDs
  addBranch: (branch: any) => void;
  editBranch: (branch: any) => void;
  disableBranch: (id: string) => void;

  addUser: (user: any) => void;
  editUser: (user: any) => void;
  disableUser: (id: string) => void;
  
  addBank: (bank: any) => void;
  editBank: (bank: any) => void;
  disableBank: (id: string) => void;
  deleteBank: (id: string) => Promise<boolean>;

  addBankBranch: (branch: any) => void;
  editBankBranch: (branch: any) => void;
  disableBankBranch: (id: string) => void;
  deleteBankBranch: (id: string) => Promise<boolean>;

  addBankAccount: (account: any) => void;
  editBankAccount: (account: any) => void;
  disableBankAccount: (id: string) => void;
  deleteBankAccount: (id: string) => Promise<boolean>;

  addCustomer: (customer: any) => void;
  editCustomer: (customer: any) => void;
  disableCustomer: (id: string) => void;
  deleteCustomer: (id: string) => Promise<boolean>;

  editVault: (vault: any) => void;
  disableVault: (id: string) => void;

  deleteUser: (id: string) => Promise<boolean>;
  deleteBranch: (id: string) => Promise<boolean>;

  updateRolePermissions: (role: string, permissions: string[] | null) => void;
  updateSettings: (newSettings: Record<string, any>) => void;
  triggerBackup: () => void;

  // Added missing aliases
  transfers: any[];
  addVault: (vault: any) => void;
  updateVaultBalance: (vaultId: string, currency: string, amount: number) => void;
  addRate: (rate: any) => Promise<{ success: boolean; error?: string }>;
  updateRate: (id: string, buy: number, sell: number) => Promise<{ success: boolean; error?: string }>;
  settleDebt: (id: string, amount?: number) => void;

  // Fixed Assets Management
  fixedAssets: FixedAsset[];
  vehicles: Vehicle[];
  realEstates: RealEstate[];
  maintenanceRecords: MaintenanceRecord[];
  depreciationRecords: DepreciationRecord[];
  assetDocuments: AssetDocument[];

  addAsset: (asset: FixedAsset, details?: { vehicle?: Omit<Vehicle, 'id' | 'assetId'>; realEstate?: Omit<RealEstate, 'id' | 'assetId'> }) => void;
  editAsset: (asset: FixedAsset, details?: { vehicle?: Omit<Vehicle, 'id' | 'assetId'>; realEstate?: Omit<RealEstate, 'id' | 'assetId'> }) => void;
  disableAsset: (id: string) => void;
  sellAsset: (id: string, price: number, currency: string, buyer: string, notes?: string) => void;
  transferAsset: (id: string, toBranch: string, toLocation: string, responsible: string) => void;
  addMaintenanceRecord: (record: Omit<MaintenanceRecord, 'id'>) => void;
  editMaintenanceRecord: (record: MaintenanceRecord) => void;
  completeMaintenanceRecord: (id: string, finalCost: number, notes?: string) => void;
  calculateDepreciation: (assetId: string, depreciationAmount: number, notes?: string) => void;
  addAssetDocument: (doc: Omit<AssetDocument, 'id'>) => void;

  // Helpers
  addAuditLog: (action: string, entity: string, details: string, oldValue?: string, newValue?: string) => void;
}

// Use the Vite proxy in the browser so login works in the preview and in local development.
// A deployment can override this with VITE_API_BASE_URL when the API is hosted separately.
const API_BASE = "/api";

export async function fetchAPI(endpoint: string, options?: RequestInit) {
  try {
    const token = localStorage.getItem('authToken');
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers
      },
      ...options
    });
    const data = await res.json();
    if (res.status === 401) {
      // Session expired or was never established — clear it so the app falls back to the login screen
      // instead of silently operating with stale/no credentials.
      localStorage.removeItem('authToken');
    }
    if (!data.success) throw new Error(data.message_ar || "حدث خطأ غير معروف");
    return data.data;
  } catch (err: any) {
    console.error("API Call Failed:", err);
    throw err;
  }
}

const SystemContext = createContext<SystemContextType | undefined>(undefined);

export const SystemProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isHydrating, setIsHydrating] = useState(true);

  // Centralized Hydration from SQLite. Defined on the component (not inside the
  // effect) so it can be re-run after login: several endpoints now require
  // authentication, so data that 401s pre-login (e.g. /auth/users) needs a
  // second pass once a token exists. Every call is individually .catch()'d —
  // one endpoint being unreachable or forbidden must not blank out everything
  // else, which is what happened when this was a single all-or-nothing Promise.all.
  const loadData = React.useCallback(async () => {
      try {
        const [
          currenciesData, ratesData, historiesData, vaultsData, banksData,
          bankBranchesData, bankAccountsData, customersData, debtsData,
          shiftsData, transactionsData, movementsData, journalEntriesData,
          auditLogsData, loginLogsData, inventoryCountsData, reconciliationsData,
          approvalsData, branchesData, usersData, rolesData, settingsData, backupsData,
          fixedAssetsData, vehiclesData, realEstatesData, maintenanceRecordsData,
          depreciationRecordsData, assetDocumentsData, notificationsData, transfersData
        ] = await Promise.all([
          fetchAPI("/currencies").catch(() => []),
          fetchAPI("/currencies/rates").catch(() => []),
          fetchAPI("/currencies/rate_histories").catch(() => []),
          fetchAPI("/vaults").catch(() => []),
          fetchAPI("/banks").catch(() => []),
          fetchAPI("/bank_branches").catch(() => []),
          fetchAPI("/bank_accounts").catch(() => []),
          fetchAPI("/customers").catch(() => []),
          fetchAPI("/debts").catch(() => []),
          fetchAPI("/shifts").catch(() => []),
          fetchAPI("/transactions").catch(() => []),
          fetchAPI("/movements").catch(() => []),
          fetchAPI("/journal_entries").catch(() => []),
          fetchAPI("/audit_logs").catch(() => []),
          fetchAPI("/login_logs").catch(() => []),
          fetchAPI("/inventory_counts").catch(() => []),
          fetchAPI("/reconciliations").catch(() => []),
          fetchAPI("/approvals").catch(() => []),
          fetchAPI("/branches").catch(() => []),
          fetchAPI("/auth/users").catch(() => []),
          fetchAPI("/auth/roles").catch(() => []),
          fetchAPI("/settings").catch(() => null),
          fetchAPI("/backups").catch(() => []),
          fetchAPI("/assets").catch(() => []),
          fetchAPI("/vehicles").catch(() => []),
          fetchAPI("/real_estates").catch(() => []),
          fetchAPI("/maintenance_records").catch(() => []),
          fetchAPI("/depreciation_records").catch(() => []),
          fetchAPI("/asset_documents").catch(() => []),
          fetchAPI("/notifications").catch(() => []),
          fetchAPI("/transfers").catch(() => [])
        ]);

        if (currenciesData?.length) setCurrencies(currenciesData);
        if (ratesData?.length) setRates(ratesData);
        if (historiesData?.length) setRateHistories(historiesData);
        if (vaultsData?.length) setVaults(vaultsData);
        if (banksData?.length) setBanks(banksData);
        if (bankBranchesData?.length) setBankBranches(bankBranchesData);
        if (bankAccountsData?.length) setBankAccounts(bankAccountsData);
        if (customersData?.length) setCustomers(customersData);
        if (debtsData?.length) setDebts(debtsData);
        if (shiftsData?.length) setShifts(shiftsData);
        if (transactionsData?.length) setTransactions(transactionsData);
        if (movementsData?.length) setMovements(movementsData);
        if (journalEntriesData?.length) setJournalEntries(journalEntriesData);
        if (auditLogsData?.length) setAuditLogs(auditLogsData);
        if (loginLogsData?.length) setLoginLogs(loginLogsData);
        if (inventoryCountsData?.length) setInventoryCounts(inventoryCountsData);
        if (reconciliationsData?.length) setReconciliations(reconciliationsData);
        if (approvalsData?.length) setApprovals(approvalsData);
        if (branchesData?.length) setBranches(branchesData);
        if (usersData?.length) setUsers(usersData);
        if (rolesData?.length) {
          const rolesMap: Record<string, string[]> = {};
          rolesData.forEach((r: { name: string; permissions: string[] }) => { rolesMap[r.name] = r.permissions; });
          setRolesPermissions(rolesMap);
        }
        if (settingsData) setSettings(settingsData);
        if (backupsData?.length) setBackups(backupsData);
        if (fixedAssetsData?.length) setFixedAssets(fixedAssetsData);
        if (vehiclesData?.length) setVehicles(vehiclesData);
        if (realEstatesData?.length) setRealEstates(realEstatesData);
        if (maintenanceRecordsData?.length) setMaintenanceRecords(maintenanceRecordsData);
        if (depreciationRecordsData?.length) setDepreciationRecords(depreciationRecordsData);
        if (assetDocumentsData?.length) setAssetDocuments(assetDocumentsData);
        if (notificationsData?.length) setNotifications(notificationsData);
        if (transfersData?.length) _setTransfers(transfersData);
      } catch (err: any) {
        console.error("Hydration from SQLite failed", err);
      } finally {
        setIsHydrating(false);
      }
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  // Session & Authentication
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('currentUser') || null);
  const [currentRole, setCurrentRole] = useState<string>(() => localStorage.getItem('currentRole') || '');
  const [currentBranch, setCurrentBranch] = useState<string>(() => localStorage.getItem('currentBranch') || '');
  const [currentVaultId, setCurrentVaultId] = useState<string>(() => localStorage.getItem('currentVaultId') || '');

  const canAccessPage = (pageId: PageId): boolean => {
    const required = PAGE_PERMISSIONS[pageId];
    if (!required || required.length === 0) return true;
    if (!currentUser || !currentRole) return false;
    const userPerms = rolesPermissions[currentRole] || [];
    return required.some(p => userPerms.includes(p));
  };

  // 1. Currencies DB
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  // 2. Exchange Rates DB
  const [rates, setRates] = useState<ExchangeRate[]>([]);

  const [rateHistories, setRateHistories] = useState<RateHistory[]>([]);

  // 3. Vaults DB
  const [vaults, setVaults] = useState<Vault[]>([]);

  // 4. Banks, Branches & Accounts DB
  const [banks, setBanks] = useState<Bank[]>([]);

  const [bankBranches, setBankBranches] = useState<BankBranch[]>([]);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // 5. Customers DB
  const [customers, setCustomers] = useState<Customer[]>([]);

  // 6. Debts DB
  const [debts, setDebts] = useState<Debt[]>([]);

  // 7. Shifts DB
  const [shifts, setShifts] = useState<Shift[]>([]);

  // 8. Transactions DB
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // 9. Movements DB
  const [movements, setMovements] = useState<Movement[]>([]);

  // 10. Journal Entries (Accounting)
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);

  // 11. Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // 12. Login Logs
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);

  // 13. Inventory Counts
  const [inventoryCounts, setInventoryCounts] = useState<InventoryCount[]>([]);

  // 14. Reconciliations
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);

  // 15. Approvals Requests
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);

  const [transfers, _setTransfers] = useState<any[]>([]);

  // 16. Branches DB
  const [branches, setBranches] = useState<any[]>([]);

  // 17. Users DB
  const [users, setUsers] = useState<any[]>([]);

  const [rolesPermissions, setRolesPermissions] = useState<Record<string, string[]>>(() => {
    const defaultRoles = {
      'مدير النظام': [
        'إدارة المستخدمين', 'إدارة الفروع', 'إدارة الخزنات', 'إدارة البنوك', 'إدارة العملات', 'تعديل أسعار الصرف',
        'إلغاء عملية', 'إنشاء عملية عكسية', 'الموافقة على التحويلات', 'إدارة العملاء', 'إدارة الديون',
        'إدارة الإعدادات', 'رؤية الأرباح', 'رؤية التقارير', 'رؤية سجل العمليات', 'اعتماد الإقفالات',
        'إدارة الأصول'
      ],
      'صراف': [
        'تنفيذ بيع عملة', 'تنفيذ شراء عملة', 'تحويل بين الخزنات', 'إدارة العملاء', 'فتح وردية', 'إغلاق وردية', 'رؤية التقارير', 'إدارة الديون'
      ]
    };
    const saved = localStorage.getItem('rolesPermissions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migration: Ensure 'مدير النظام' always has 'إدارة الأصول'
        if (parsed['مدير النظام'] && !parsed['مدير النظام'].includes('إدارة الأصول')) {
          parsed['مدير النظام'] = [...parsed['مدير النظام'], 'إدارة الأصول'];
          localStorage.setItem('rolesPermissions', JSON.stringify(parsed));
        }
        return parsed;
      } catch (e) {
        console.error('Failed to parse rolesPermissions from localStorage', e);
      }
    }
    return defaultRoles;
  });

  // 19. System Settings State
  const [settings, setSettings] = useState<Record<string, any>>({
    companyName: 'نظام الواحة الدولي للصرافة والخدمات المالية',
    address: 'شارع الميزران، طرابلس، ليبيا',
    phone: '021-3601122',
    taxNumber: '102-3929-1029',
    defaultCurrency: 'LYD',
    allowRateEditDuringTx: true,
    maxDiffWithoutApproval: 50.0,
    enableMFA: false,
    sessionTimeout: 30 // minutes
  });

  // 20. Backups
  const [backups, setBackups] = useState<any[]>([]);

  // 21. Fixed Assets states
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([]);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [realEstates, setRealEstates] = useState<RealEstate[]>([]);

  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);

  const [depreciationRecords, setDepreciationRecords] = useState<DepreciationRecord[]>([]);

  const [assetDocuments, setAssetDocuments] = useState<AssetDocument[]>([]);


  // 22. Notifications & Error Reports State
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [errorReports, setErrorReports] = useState<ErrorReport[]>([]);

  const addNotification = (title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info', role?: string, user?: string) => {
    const newNot: SystemNotification = {
      id: `not_${Date.now()}`,
      title,
      message,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      isRead: false,
      role,
      user,
      type
    };
    setNotifications(prev => [newNot, ...prev]);
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const addErrorReport = (page: string, action: string, errorMessage: string) => {
    const newReport: ErrorReport = {
      id: `err_${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      user: currentUser || 'غير معروف',
      page,
      action,
      errorMessage
    };
    setErrorReports(prev => [newReport, ...prev]);
  };

  // Helpers
  const addAuditLog = (action: string, entity: string, details: string, oldValue?: string, newValue?: string) => {
    const newLog: AuditLog = {
      id: `al_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      user: currentUser || 'غير معروف',
      role: currentRole || 'زائر',
      branch: currentBranch || 'الإدارة العامة',
      action,
      entity,
      details,
      oldValue,
      newValue,
      ip: '192.168.10.' + Math.floor(Math.random() * 250 + 2),
      device: 'Windows 11 / Chrome 124'
    };
    setAuditLogs(prev => [newLog, ...prev]);
  };

  // Login handler — delegates to backend for secure password verification
  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase(), password })
      });
      const data = await res.json();

      if (!data.success) {
        return { success: false, error: data.message_ar || 'فشل تسجيل الدخول' };
      }

      const matchedUser = data.data;
      const role = matchedUser.role;
      const branch = matchedUser.branch;

      setCurrentUser(matchedUser.name);
      setCurrentRole(role);
      setCurrentBranch(branch);
      setCurrentVaultId(matchedUser.allowedVaultId || '');

      localStorage.setItem('currentUser', matchedUser.name);
      localStorage.setItem('currentRole', role);
      localStorage.setItem('currentBranch', branch);
      localStorage.setItem('currentVaultId', matchedUser.allowedVaultId || '');
      if (matchedUser.token) localStorage.setItem('authToken', matchedUser.token);

      // Re-hydrate now that a token exists — endpoints that 401'd pre-login
      // (user management, audit logs, etc.) can now load.
      loadData();

      // Save login log locally
      const newLoginLog: LoginLog = {
        id: `ll_${Date.now()}`,
        user: matchedUser.name,
        role,
        branch,
        loginTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
        ip: '192.168.10.' + Math.floor(Math.random() * 250 + 2),
        device: 'Windows 11 / Chrome 124',
        status: 'successful'
      };
      setLoginLogs(prev => [newLoginLog, ...prev]);

      // Audit log locally
      const details = `تسجيل دخول ناجح للمستخدم ${matchedUser.name} بدور ${role} في فرع ${branch}`;
      const newLog: AuditLog = {
        id: `al_${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        user: matchedUser.name,
        role,
        branch,
        action: 'تسجيل دخول',
        entity: 'USER',
        details,
        ip: newLoginLog.ip,
        device: newLoginLog.device
      };
      setAuditLogs(prev => [newLog, ...prev]);

      return { success: true };
    } catch (err: any) {
      console.error('[v0] Login API unavailable:', err);
      // The preview ships without the separate FastAPI process. Keep the seeded
      // administrator available for preview navigation, while real deployments
      // continue to use the backend response above.
      if (username.trim().toLowerCase() === 'admin' && password === '123') {
        const previewUser = { name: 'مدير النظام الرئيسي', role: 'مدير النظام', branch: 'الإدارة العامة', vaultId: 'v_main' };
        setCurrentUser(previewUser.name);
        setCurrentRole(previewUser.role);
        setCurrentBranch(previewUser.branch);
        setCurrentVaultId(previewUser.vaultId);
        localStorage.setItem('currentUser', previewUser.name);
        localStorage.setItem('currentRole', previewUser.role);
        localStorage.setItem('currentBranch', previewUser.branch);
        localStorage.setItem('currentVaultId', previewUser.vaultId);
        localStorage.setItem('authToken', 'preview-session');
        return { success: true };
      }
      return { success: false, error: 'تعذر الاتصال بالخادم. استخدم admin و 123 في المعاينة.' };
    }
  };

  // Logout handler
  const logout = () => {
    if (!currentUser) return;
    addAuditLog('تسجيل خروج', 'USER', `تسجيل خروج للمستخدم ${currentUser}`);
    
    setLoginLogs(prev => {
      const copy = [...prev];
      const index = copy.findIndex(l => l.user === currentUser && !l.logoutTime);
      if (index !== -1) {
        const timeNow = new Date().toISOString().replace('T', ' ').substring(0, 19);
        copy[index] = {
          ...copy[index],
          logoutTime: timeNow,
          duration: '3 ساعات و12 دقيقة'
        };
      }
      return copy;
    });

    setCurrentUser(null);
    setCurrentRole('');
    setCurrentBranch('');
    setCurrentVaultId('');

    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentRole');
    localStorage.removeItem('currentBranch');
    localStorage.removeItem('currentVaultId');
    localStorage.removeItem('authToken');
  };

  // 1. Currencies CRUD
  const addCurrency = async (currency: Currency) => {
    try {
      await fetchAPI("/currencies", {
        method: "POST",
        body: JSON.stringify({
          code: currency.code,
          nameAr: currency.nameAr,
          nameEn: currency.nameEn,
          symbol: currency.symbol,
          country: currency.country,
          flag: currency.flag,
          decimalPlaces: currency.decimalPlaces,
          isActive: currency.isActive,
          lastUpdated: currency.lastUpdated
        })
      });
      setCurrencies(prev => [...prev, currency]);
      addAuditLog('إإضافة عملة', 'CURRENCY', `تمت إإضافة عملة جديدة: ${currency.nameAr} (${currency.code})`);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const editCurrency = async (currency: Currency) => {
    try {
      await fetchAPI(`/currencies/${currency.code}`, {
        method: "PUT",
        body: JSON.stringify({
          code: currency.code,
          nameAr: currency.nameAr,
          nameEn: currency.nameEn,
          symbol: currency.symbol,
          country: currency.country,
          flag: currency.flag,
          decimalPlaces: currency.decimalPlaces,
          isActive: currency.isActive,
          lastUpdated: currency.lastUpdated
        })
      });
      setCurrencies(prev => prev.map(c => c.code === currency.code ? currency : c));
      addAuditLog('تعديل عملة', 'CURRENCY', `تم تعديل بيانات العملة: ${currency.nameAr} (${currency.code})`);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const disableCurrency = async (code: string) => {
    try {
      const curr = currencies.find(c => c.code === code);
      if (!curr) return;
      const newActive = !curr.isActive;
      await fetchAPI(`/currencies/${code}`, {
        method: "PUT",
        body: JSON.stringify({
          code: curr.code,
          nameAr: curr.nameAr,
          nameEn: curr.nameEn,
          symbol: curr.symbol,
          country: curr.country,
          flag: curr.flag,
          decimalPlaces: curr.decimalPlaces,
          isActive: newActive,
          lastUpdated: curr.lastUpdated
        })
      });
      setCurrencies(prev => prev.map(c => c.code === code ? { ...c, isActive: newActive } : c));
      addAuditLog('تعديل حالة عملة', 'CURRENCY', `تم تغيير حالة العملة ${code} إإلى ${newActive ? 'نشط' : 'تعطيل'}`);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const deleteCurrency = async (code: string): Promise<boolean> => {
    try {
      const hasTransactions = transactions.some(t => t.fromCurrency === code || t.toCurrency === code);
      const hasBalances = vaults.some(v => (v.balances[code] || 0) > 0);
      
      if (hasTransactions || hasBalances) {
        addAuditLog('فشل حذف عملة', 'CURRENCY', `محاولة غير مصرحة لحذف عملة ${code} مرتبطة بحركات مالية نشطة`);
        return false;
      }
      await fetchAPI(`/currencies/${code}`, {
        method: "DELETE"
      });
      setCurrencies(prev => prev.filter(c => c.code !== code));
      addAuditLog('حذف عملة', 'CURRENCY', `تم حذف العملة ${code} نهائياً لعدم وجود حركات مالية مسجلة عليها`);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  // 2. Exchange Rates CRUD
  const addExchangeRate = async (rate: ExchangeRate) => {
    const payload = {
      id: rate.id || `rate_${rate.fromCurrency.toLowerCase()}_${rate.toCurrency.toLowerCase()}`,
      fromCurrency: rate.fromCurrency,
      toCurrency: rate.toCurrency,
      buyRate: rate.buyRate,
      sellRate: rate.sellRate,
      minRate: rate.minRate || 0,
      maxRate: rate.maxRate || 100,
      validFrom: rate.validFrom || new Date().toISOString().substring(0, 10),
      validTo: rate.validTo || new Date(Date.now() + 365 * 86400000).toISOString().substring(0, 10),
      isActive: true,
      lastUpdated: new Date().toISOString().replace('T', ' ').substring(0, 19),
      updatedBy: currentUser || 'غير معروف',
      notes: rate.notes || ''
    };
    try {
      await fetchAPI('/currencies/rates', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setRates(prev => [...prev, { ...rate, id: payload.id, isActive: true, lastUpdated: payload.lastUpdated, updatedBy: payload.updatedBy }]);
      addAuditLog('إضافة سعر صرف', 'EXCHANGE_RATE', `إضافة سعر صرف لزوج ${rate.fromCurrency}/${rate.toCurrency}: شراء ${rate.buyRate}/بيع ${rate.sellRate}`);
      return { success: true };
    } catch (err: any) {
      console.error('Failed to add exchange rate:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء إضافة سعر الصرف' };
    }
  };

  const updateExchangeRate = async (id: string, buy: number, sell: number, notes?: string) => {
    const rateIndex = rates.findIndex(r => r.id === id);
    if (rateIndex === -1) return { success: false, error: 'سعر الصرف غير موجود' };
    const oldRate = rates[rateIndex];

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newHist: RateHistory = {
      id: `h_${Date.now()}`,
      pair: `${oldRate.fromCurrency} / ${oldRate.toCurrency}`,
      oldBuy: oldRate.buyRate,
      newBuy: buy,
      oldSell: oldRate.sellRate,
      newSell: sell,
      user: currentUser || 'غير معروف',
      timestamp: timestamp,
      notes: notes || 'تحديث دوري لأسعار الصرف'
    };

    try {
      await fetchAPI('/currencies/rate_histories', {
        method: 'POST',
        body: JSON.stringify({
          id: newHist.id,
          pair: newHist.pair,
          oldBuy: newHist.oldBuy,
          newBuy: newHist.newBuy,
          oldSell: newHist.oldSell,
          newSell: newHist.newSell,
          user: newHist.user,
          timestamp: newHist.timestamp,
          notes: newHist.notes
        })
      });

      await fetchAPI(`/currencies/rates/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          id: oldRate.id,
          fromCurrency: oldRate.fromCurrency,
          toCurrency: oldRate.toCurrency,
          buyRate: buy,
          sellRate: sell,
          minRate: oldRate.minRate || 0,
          maxRate: oldRate.maxRate || 100,
          validFrom: oldRate.validFrom,
          validTo: oldRate.validTo,
          isActive: oldRate.isActive,
          lastUpdated: timestamp,
          updatedBy: currentUser || 'غير معروف',
          notes: notes || oldRate.notes || ''
        })
      });

      setRateHistories(prev => [newHist, ...prev]);

      setRates(prev => prev.map(r => r.id === id ? {
        ...r,
        buyRate: buy,
        sellRate: sell,
        notes: notes || r.notes,
        lastUpdated: new Date().toISOString().replace('T', ' ').substring(0, 19),
        updatedBy: currentUser || 'غير معروف'
      } : r));

      addAuditLog('تعديل سعر صرف', 'EXCHANGE_RATE', `تم تحديث أسعار الصرف لزوج ${oldRate.fromCurrency}/${oldRate.toCurrency}: شراء ${buy} (سابقاً ${oldRate.buyRate})، بيع ${sell} (سابقاً ${oldRate.sellRate})`);
      return { success: true };
    } catch (err: any) {
      console.error('Failed to update exchange rate:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء تحديث سعر الصرف' };
    }
  };

  const disableExchangeRate = (id: string) => {
    setRates(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
    const rate = rates.find(r => r.id === id);
    addAuditLog('تغيير حالة سعر صرف', 'EXCHANGE_RATE', `تغيير حالة سعر الصرف لزوج ${rate?.fromCurrency}/${rate?.toCurrency} إلى ${rate?.isActive ? 'معطل' : 'نشط'}`);
  };

  // 3. Currency POS operations Engine
  const executePOSOperation = async (
    type: 'buy' | 'sell' | 'exchange',
    vaultId: string,
    customerId: string,
    fromCurrency: string,
    toCurrency: string,
    amount: number,
    rate: number,
    commission: number,
    paymentMethod: 'cash' | 'customer_account' | 'bank_account' | 'debt',
    bankAccountId?: string,
    notes?: string
  ) => {
    const activeVault = vaults.find(v => v.id === vaultId);
    if (!activeVault) return { success: false, error: 'الخزنة المحددة غير موجودة' };

    const selectedCustomer = customers.find(c => c.id === customerId);
    if (!selectedCustomer) return { success: false, error: 'العميل المحدد غير موجود' };

    const currentShift = shifts.find(s => s.vaultId === vaultId && s.status === 'open');
    if (!currentShift && activeVault.type === 'cashier') {
      return { success: false, error: 'الصندوق مغلق حالياً، يجب فتح الوردية أولاً لإجراء العمليات' };
    }

    const sourceBal = activeVault.balances[fromCurrency] || 0;
    const destBal = activeVault.balances[toCurrency] || 0;

    const isBuy = type === 'buy';
    const isSell = type === 'sell';
    const isExchange = type === 'exchange';

    let totalAmount = 0;
    let expectedProfit = 0;

    let cashierReceiveCurrency = '';
    let cashierReceiveAmount = 0;
    let cashierPayCurrency = '';
    let cashierPayAmount = 0;

    if (isBuy) {
      cashierReceiveCurrency = fromCurrency;
      cashierReceiveAmount = amount;
      cashierPayCurrency = toCurrency;
      cashierPayAmount = amount * rate - commission;
      totalAmount = cashierPayAmount;

      const standardRateObj = rates.find(r => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency);
      if (standardRateObj) {
        const sellRate = standardRateObj.sellRate;
        expectedProfit = amount * (sellRate - rate);
      }
    } else if (isSell) {
      cashierReceiveCurrency = fromCurrency;
      cashierReceiveAmount = amount * rate + commission;
      cashierPayCurrency = toCurrency;
      cashierPayAmount = amount;
      totalAmount = cashierReceiveAmount;

      const standardRateObj = rates.find(r => r.fromCurrency === toCurrency && r.toCurrency === fromCurrency);
      if (standardRateObj) {
        const buyRate = standardRateObj.buyRate;
        expectedProfit = amount * (rate - buyRate);
      }
    } else if (isExchange) {
      cashierReceiveCurrency = fromCurrency;
      cashierReceiveAmount = amount;
      cashierPayCurrency = toCurrency;
      cashierPayAmount = amount * rate;
      totalAmount = cashierPayAmount;
      expectedProfit = commission;
    }

    const cashierAvailablePayBalance = activeVault.balances[cashierPayCurrency] || 0;
    if (cashierAvailablePayBalance < cashierPayAmount && paymentMethod === 'cash') {
      return { success: false, error: `الرصيد المتاح في الخزنة (${cashierAvailablePayBalance} ${cashierPayCurrency}) غير كافي لتسديد قيمة العملية البالغة (${cashierPayAmount} ${cashierPayCurrency})` };
    }

    if (paymentMethod === 'debt') {
      const currentDebt = debts.filter(d => d.customerId === customerId && d.status !== 'paid').reduce((sum, d) => sum + d.remainingAmount, 0);
      const newDebtAmount = isBuy ? cashierPayAmount : cashierReceiveAmount;
      const debtLimit = selectedCustomer.debtLimit;
      if (currentDebt + newDebtAmount > debtLimit) {
        return { success: false, error: `تجاوزت العملية حد الدين المسموح به للعميل! حد الدين: ${debtLimit} د.ل. الدين الحالي: ${currentDebt} د.ل.` };
      }
    }

    let bankAcc: BankAccount | undefined = undefined;
    if (paymentMethod === 'bank_account' && bankAccountId) {
      bankAcc = bankAccounts.find(ba => ba.id === bankAccountId);
      if (!bankAcc) return { success: false, error: 'الحساب المصرفي المحدد غير موجود' };
      if (bankAcc.balance < cashierReceiveAmount && isSell) {
        return { success: false, error: `رصيد الحساب البنكي غير كافي! الرصيد المتاح: ${bankAcc.balance} ${bankAcc.currency}` };
      }
    }

    const txId = `tx_${Date.now()}`;
    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    try {
      await fetchAPI('/exchange/pos', {
        method: 'POST',
        body: JSON.stringify({
          id: txId,
          type,
          vaultId,
          customerId,
          fromCurrency,
          toCurrency,
          amount,
          rate,
          commission,
          paymentMethod,
          bankAccountId: bankAccountId || null,
          notes: notes || null,
          user: currentUser || 'غير معروف'
        })
      });

      setVaults(prev => prev.map(v => {
        if (v.id === vaultId) {
          const updatedBal = { ...v.balances };
          updatedBal[cashierReceiveCurrency] = (updatedBal[cashierReceiveCurrency] || 0) + cashierReceiveAmount;
          if (paymentMethod === 'cash') {
            updatedBal[cashierPayCurrency] = (updatedBal[cashierPayCurrency] || 0) - cashierPayAmount;
          }
          return {
            ...v,
            balances: updatedBal,
            lastMovement: timestampStr
          };
        }
        return v;
      }));

      setCustomers(prev => prev.map(c => {
        if (c.id === customerId) {
          const updatedBal = { ...c.balances };
          if (paymentMethod === 'customer_account') {
            updatedBal[cashierPayCurrency] = (updatedBal[cashierPayCurrency] || 0) + cashierPayAmount;
            updatedBal[cashierReceiveCurrency] = (updatedBal[cashierReceiveCurrency] || 0) - cashierReceiveAmount;
          } else if (paymentMethod === 'debt') {
            const debtCurrency = isBuy ? cashierPayCurrency : cashierReceiveCurrency;
            const debtAmount = isBuy ? cashierPayAmount : cashierReceiveAmount;
            updatedBal[debtCurrency] = (updatedBal[debtCurrency] || 0) - debtAmount;
          }
          return { ...c, balances: updatedBal };
        }
        return c;
      }));

      if (paymentMethod === 'bank_account' && bankAcc) {
        setBankAccounts(prev => prev.map(ba => {
          if (ba.id === bankAcc?.id) {
            return {
              ...ba,
              balance: isBuy ? ba.balance - cashierPayAmount : ba.balance + cashierReceiveAmount,
              lastMovement: timestampStr
            };
          }
          return ba;
        }));

        const newBankMovement: Movement = {
          id: `bm_${Date.now()}`,
          timestamp: timestampStr,
          entityType: 'bank_account',
          entityId: bankAcc.id,
          entityName: `${bankAcc.bankName} - ${bankAcc.accountName}`,
          currency: bankAcc.currency,
          type: isBuy ? 'سحب نقدي لصالح عملية صرافة' : 'إيداع نقدي من مبيعات صرافة',
          amountIn: isBuy ? 0 : cashierReceiveAmount,
          amountOut: isBuy ? cashierPayAmount : 0,
          balanceBefore: bankAcc.balance,
          balanceAfter: isBuy ? bankAcc.balance - cashierPayAmount : bankAcc.balance + cashierReceiveAmount,
          referenceId: txId,
          user: currentUser || 'غير معروف'
        };
        setMovements(prev => [newBankMovement, ...prev]);
      }

      if (paymentMethod === 'debt') {
        const newDebt: Debt = {
          id: `d_${Date.now()}`,
          customerId,
          customerName: selectedCustomer.name,
          currency: isBuy ? cashierPayCurrency : cashierReceiveCurrency,
          amount: isBuy ? cashierPayAmount : cashierReceiveAmount,
          paidAmount: 0.0,
          remainingAmount: isBuy ? cashierPayAmount : cashierReceiveAmount,
          startDate: timestampStr.substring(0, 10),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
          transactionId: txId,
          status: 'unpaid',
          notes: `دين مستحق للعملية رقم ${txId} - ${notes || ''}`
        };
        setDebts(prev => [newDebt, ...prev]);
      }

      if (currentShift) {
        setShifts(prev => prev.map(s => {
          if (s.id === currentShift.id) {
            const updatedExpected = { ...s.expectedBalances };
            updatedExpected[cashierReceiveCurrency] = (updatedExpected[cashierReceiveCurrency] || 0) + cashierReceiveAmount;
            if (paymentMethod === 'cash') {
              updatedExpected[cashierPayCurrency] = (updatedExpected[cashierPayCurrency] || 0) - cashierPayAmount;
            }
            return { ...s, expectedBalances: updatedExpected };
          }
          return s;
        }));
      }

      const newTx: Transaction = {
        id: txId,
        type,
        vaultId,
        vaultName: activeVault.name,
        customerId,
        customerName: selectedCustomer.name,
        fromCurrency,
        toCurrency,
        amount,
        rate,
        commission,
        totalAmount,
        paymentMethod,
        bankAccountId,
        bankAccountName: bankAcc ? `${bankAcc.bankName} - ${bankAcc.accountName}` : undefined,
        status: 'approved',
        notes,
        user: currentUser || 'غير معروف',
        branch: currentBranch || 'الادارة العامة',
        timestamp: timestampStr,
        expectedProfit
      };
      setTransactions(prev => [newTx, ...prev]);

      const newMovReceive: Movement = {
        id: `m_${Date.now()}_rec`,
        timestamp: timestampStr,
        entityType: 'vault',
        entityId: vaultId,
        entityName: activeVault.name,
        currency: cashierReceiveCurrency,
        type: `${isBuy ? 'شراء عملة ورقية' : isSell ? 'مقبوضات صرافة' : 'تبديل عملة'}`,
        amountIn: cashierReceiveAmount,
        amountOut: 0.0,
        balanceBefore: sourceBal,
        balanceAfter: sourceBal + cashierReceiveAmount,
        referenceId: txId,
        user: currentUser || 'غير معروف'
      };

      let newMovPay: Movement | null = null;
      if (paymentMethod === 'cash') {
        newMovPay = {
          id: `m_${Date.now()}_pay`,
          timestamp: timestampStr,
          entityType: 'vault',
          entityId: vaultId,
          entityName: activeVault.name,
          currency: cashierPayCurrency,
          type: `${isBuy ? 'مدفوعات صرافة' : isSell ? 'بيع عملة ورقية' : 'تبديل عملة'}`,
          amountIn: 0.0,
          amountOut: cashierPayAmount,
          balanceBefore: destBal,
          balanceAfter: destBal - cashierPayAmount,
          referenceId: txId,
          user: currentUser || 'غير معروف'
        };
      }

      setMovements(prev => {
        const list = [newMovReceive];
        if (newMovPay) list.push(newMovPay);
        return [...list, ...prev];
      });

      const newJV: JournalEntry = {
        id: `JV-${timestampStr.replace(/[- :]/g, '').substring(0, 8)}-${Math.floor(Math.random() * 900 + 100)}`,
        date: timestampStr,
        txType: isBuy ? 'شراء عملة' : isSell ? 'بيع عملة' : 'تبديل عملة',
        reference: txId,
        description: `قيد تلقائي لعملية ${isBuy ? 'شراء' : isSell ? 'بيع' : 'تبديل'} بقيمة ${amount} ${isBuy ? fromCurrency : toCurrency} من العميل ${selectedCustomer.name}`,
        user: currentUser || 'غير معروف',
        status: 'approved',
        lines: [
          {
            accountName: `خزينة ${activeVault.name} - ${cashierReceiveCurrency}`,
            currency: cashierReceiveCurrency,
            debit: cashierReceiveAmount,
            credit: 0.0,
            originalAmount: cashierReceiveAmount,
            exchangeRate: isBuy ? rate : 1.0,
            equivalentLYD: cashierReceiveCurrency === 'LYD' ? cashierReceiveAmount : cashierReceiveAmount * (isBuy ? rate : rate)
          },
          {
            accountName: paymentMethod === 'cash' 
              ? `خزينة ${activeVault.name} - ${cashierPayCurrency}` 
              : paymentMethod === 'bank_account' 
              ? `حساب بنكي ${bankAcc?.bankName} - ${bankAcc?.accountName}` 
              : paymentMethod === 'customer_account'
              ? `حساب العميل ${selectedCustomer.name} - ${cashierPayCurrency}`
              : `دين العميل ${selectedCustomer.name} - ${cashierPayCurrency}`,
            currency: cashierPayCurrency,
            debit: 0.0,
            credit: cashierPayAmount,
            originalAmount: cashierPayAmount,
            exchangeRate: isSell ? rate : 1.0,
            equivalentLYD: cashierPayCurrency === 'LYD' ? cashierPayAmount : cashierPayAmount * (isSell ? rate : rate)
          },
          {
            accountName: 'إإيراد عمولات صرافة - LYD',
            currency: 'LYD',
            debit: 0.0,
            credit: commission,
            originalAmount: commission,
            exchangeRate: 1.0,
            equivalentLYD: commission
          },
          {
            accountName: `حساب تسوية عمولة الصندوق - LYD`,
            currency: 'LYD',
            debit: commission,
            credit: 0.0,
            originalAmount: commission,
            exchangeRate: 1.0,
            equivalentLYD: commission
          }
        ]
      };

      setJournalEntries(prev => [newJV, ...prev]);

      addAuditLog(
        isBuy ? 'شراء عملة' : isSell ? 'بيع عملة' : 'تبديل عملة',
        'TRANSACTION',
        `تم تنفيذ عملية صرافة رقم ${txId} بنجاح: العميل يدفع (${cashierReceiveAmount} ${cashierReceiveCurrency})، العميل يستلم (${cashierPayAmount} ${cashierPayCurrency}) بقيمة عم��لة ${commission} د.ل`
      );

      return { success: true, txId };
    } catch (err: any) {
      console.error('API Call Failed:', err);
      return { success: false, txId: '' };
    }
  };


  // 4. Customer Deposit & Withdrawal
  const executeCustomerOperation = (
    type: 'deposit' | 'withdraw',
    customerId: string,
    currency: string,
    amount: number,
    paymentMethod: 'vault' | 'bank_account',
    sourceId: string,
    notes?: string
  ) => {
    const selectedCustomer = customers.find(c => c.id === customerId);
    if (!selectedCustomer) return { success: false, error: 'العميل المحدد غير موجود' };

    const isDep = type === 'deposit';
    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const txId = `cx_op_${Date.now()}`;

    let sourceName = '';
    let beforeBalance = 0;

    if (paymentMethod === 'vault') {
      const activeVault = vaults.find(v => v.id === sourceId);
      if (!activeVault) return { success: false, error: 'الخزنة المحددة غير موجودة' };
      sourceName = activeVault.name;
      beforeBalance = activeVault.balances[currency] || 0;

      if (!isDep && beforeBalance < amount) {
        return { success: false, error: `الرصيد المتاح بالخزنة (${beforeBalance} ${currency}) غير كافي لإإتمام عملية سحب العميل البالغة (${amount} ${currency})` };
      }

      setVaults(prev => prev.map(v => {
        if (v.id === sourceId) {
          const updatedBal = { ...v.balances };
          updatedBal[currency] = isDep ? (updatedBal[currency] || 0) + amount : (updatedBal[currency] || 0) - amount;
          return { ...v, balances: updatedBal, lastMovement: timestampStr };
        }
        return v;
      }));

      const newVmov: Movement = {
        id: `m_${Date.now()}_v`,
        timestamp: timestampStr,
        entityType: 'vault',
        entityId: sourceId,
        entityName: sourceName,
        currency,
        type: isDep ? 'إإيداع نقدي من عميل' : 'سحب نقدي من عميل',
        amountIn: isDep ? amount : 0,
        amountOut: isDep ? 0 : amount,
        balanceBefore: beforeBalance,
        balanceAfter: isDep ? beforeBalance + amount : beforeBalance - amount,
        referenceId: txId,
        user: currentUser || 'غير معروف'
      };
      setMovements(prev => [newVmov, ...prev]);

    } else {
      const bankAcc = bankAccounts.find(ba => ba.id === sourceId);
      if (!bankAcc) return { success: false, error: 'الحساب البنكي المحدد غير موجود' };
      sourceName = `${bankAcc.bankName} - ${bankAcc.accountName}`;
      beforeBalance = bankAcc.balance;

      if (!isDep && beforeBalance < amount) {
        return { success: false, error: `رصيد الحساب البنكي البالغ (${beforeBalance} ${currency}) غير كافي لإإتمام عملية سحب العميل` };
      }

      setBankAccounts(prev => prev.map(ba => {
        if (ba.id === sourceId) {
          return { ...ba, balance: isDep ? ba.balance + amount : ba.balance - amount, lastMovement: timestampStr };
        }
        return ba;
      }));

      const newBmov: Movement = {
        id: `m_${Date.now()}_b`,
        timestamp: timestampStr,
        entityType: 'bank_account',
        entityId: sourceId,
        entityName: sourceName,
        currency,
        type: isDep ? 'حوالة واردة لحساب عميل' : 'حوالة صادرة لصالح عميل',
        amountIn: isDep ? amount : 0,
        amountOut: isDep ? 0 : amount,
        balanceBefore: beforeBalance,
        balanceAfter: isDep ? beforeBalance + amount : beforeBalance - amount,
        referenceId: txId,
        user: currentUser || 'غير معروف'
      };
      setMovements(prev => [newBmov, ...prev]);
    }

    const custBeforeBalance = selectedCustomer.balances[currency] || 0;
    setCustomers(prev => prev.map(c => {
      if (c.id === customerId) {
        const updatedBal = { ...c.balances };
        updatedBal[currency] = isDep ? (updatedBal[currency] || 0) + amount : (updatedBal[currency] || 0) - amount;
        return { ...c, balances: updatedBal };
      }
      return c;
    }));

    const newCmov: Movement = {
      id: `m_${Date.now()}_c`,
      timestamp: timestampStr,
      entityType: 'customer',
      entityId: customerId,
      entityName: selectedCustomer.name,
      currency,
      type: isDep ? 'إإيداع في رصيد الحساب' : 'سحب من رصيد الحساب',
      amountIn: isDep ? amount : 0,
      amountOut: isDep ? 0 : amount,
      balanceBefore: custBeforeBalance,
      balanceAfter: isDep ? custBeforeBalance + amount : custBeforeBalance - amount,
      referenceId: txId,
      user: currentUser || 'غير معروف'
    };
    setMovements(prev => [newCmov, ...prev]);

    const newTx: Transaction = {
      id: txId,
      type: isDep ? 'deposit' : 'withdraw',
      vaultId: paymentMethod === 'vault' ? sourceId : undefined,
      vaultName: paymentMethod === 'vault' ? sourceName : undefined,
      customerId,
      customerName: selectedCustomer.name,
      fromCurrency: currency,
      toCurrency: currency,
      amount,
      rate: 1.0,
      commission: 0.0,
      totalAmount: amount,
      paymentMethod: paymentMethod === 'vault' ? 'cash' : 'bank_account',
      bankAccountId: paymentMethod === 'bank_account' ? sourceId : undefined,
      bankAccountName: paymentMethod === 'bank_account' ? sourceName : undefined,
      status: 'approved',
      notes,
      user: currentUser || 'غير معروف',
      branch: currentBranch || 'الإدارة العامة',
      timestamp: timestampStr
    };
    setTransactions(prev => [newTx, ...prev]);

    const newJV: JournalEntry = {
      id: `JV-${timestampStr.replace(/[- :]/g, '').substring(0, 8)}-${Math.floor(Math.random() * 900 + 100)}`,
      date: timestampStr,
      txType: isDep ? 'إإيداع عميل' : 'سحب عميل',
      reference: txId,
      description: `قيد تلقائي لعملية ${isDep ? 'إإيداع' : 'سحب'} بقيمة ${amount} ${currency} للعميل ${selectedCustomer.name}`,
      user: currentUser || 'غير معروف',
      status: 'approved',
      lines: [
        {
          accountName: isDep 
            ? `${paymentMethod === 'vault' ? 'خزينة' : 'حساب بنكي'} ${sourceName} - ${currency}`
            : `حساب العميل ${selectedCustomer.name} - ${currency}`,
          currency,
          debit: amount,
          credit: 0.0,
          originalAmount: amount,
          exchangeRate: 1.0,
          equivalentLYD: currency === 'LYD' ? amount : amount * (rates.find(r => r.fromCurrency === currency)?.buyRate || 7.2)
        },
        {
          accountName: isDep 
            ? `حساب العميل ${selectedCustomer.name} - ${currency}`
            : `${paymentMethod === 'vault' ? 'خزينة' : 'حساب بنكي'} ${sourceName} - ${currency}`,
          currency,
          debit: 0.0,
          credit: amount,
          originalAmount: amount,
          exchangeRate: 1.0,
          equivalentLYD: currency === 'LYD' ? amount : amount * (rates.find(r => r.fromCurrency === currency)?.buyRate || 7.2)
        }
      ]
    };
    setJournalEntries(prev => [newJV, ...prev]);

    addAuditLog(
      isDep ? 'إإيداع عميل' : 'سحب عميل',
      'CUSTOMER',
      `تنفيذ عملية ${isDep ? 'إإيداع' : 'سحب'} لـ ${selectedCustomer.name} بقيمة ${amount} ${currency} عبر ${sourceName}`
    );

    return { success: true };
  };

  // 5. Money Transfers
  const createTransfer = async (
    sourceType: 'vault' | 'bank_account',
    sourceId: string,
    destType: 'vault' | 'bank_account',
    destId: string,
    currency: string,
    amount: number,
    notes?: string
  ) => {
    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newId = `tr_${Date.now()}`;

    const sourceName = sourceType === 'vault' 
      ? vaults.find(v => v.id === sourceId)?.name || 'خزنة'
      : bankAccounts.find(ba => ba.id === sourceId)?.accountName || 'حساب';

    const destName = destType === 'vault'
      ? vaults.find(v => v.id === destId)?.name || 'خزنة'
      : bankAccounts.find(ba => ba.id === destId)?.accountName || 'حساب';

    try {
      const res = await fetchAPI("/transfers", {
        method: "POST",
        body: JSON.stringify({
          id: newId,
          source_type: sourceType,
          source_id: sourceId,
          source_name: sourceName,
          dest_type: destType,
          dest_id: destId,
          dest_name: destName,
          currency: currency,
          amount: amount,
          notes: notes
        })
      });
      if (res) {
        // Fetch the newly created approval request
        const [transfersData, approvalsData] = await Promise.all([
          fetchAPI("/transfers"),
          fetchAPI("/approvals")
        ]);
        if (transfersData) _setTransfers(transfersData);
        if (approvalsData) setApprovals(approvalsData);

        addAuditLog('طلب تحويل معلق', 'APPROVAL', `تم إنشاء طلب تحويل بقيمة ${amount} ${currency} يحتاج إإلى موافقة`);
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const executeTransferDeduction = (type: 'vault' | 'bank_account', id: string, currency: string, amount: number, refId: string, timestamp: string) => {
    if (type === 'vault') {
      const v = vaults.find(v => v.id === id);
      const balanceBefore = v?.balances[currency] || 0;
      setVaults(prev => prev.map(v => {
        if (v.id === id) {
          const updatedBal = { ...v.balances };
          updatedBal[currency] = (updatedBal[currency] || 0) - amount;
          return { ...v, balances: updatedBal, lastMovement: timestamp };
        }
        return v;
      }));

      const newMov: Movement = {
        id: `m_${Date.now()}_tr_ded`,
        timestamp,
        entityType: 'vault',
        entityId: id,
        entityName: v?.name || '',
        currency,
        type: 'تحويل أموال (صادر)',
        amountIn: 0,
        amountOut: amount,
        balanceBefore,
        balanceAfter: balanceBefore - amount,
        referenceId: refId,
        user: currentUser || 'غير معروف'
      };
      setMovements(prev => [newMov, ...prev]);
    } else {
      const ba = bankAccounts.find(ba => ba.id === id);
      const balanceBefore = ba?.balance || 0;
      setBankAccounts(prev => prev.map(ba => {
        if (ba.id === id) {
          return { ...ba, balance: ba.balance - amount, lastMovement: timestamp };
        }
        return ba;
      }));

      const newMov: Movement = {
        id: `m_${Date.now()}_tr_ded_b`,
        timestamp,
        entityType: 'bank_account',
        entityId: id,
        entityName: `${ba?.bankName} - ${ba?.accountName}`,
        currency,
        type: 'تحويل بنكي (خارج)',
        amountIn: 0,
        amountOut: amount,
        balanceBefore,
        balanceAfter: balanceBefore - amount,
        referenceId: refId,
        user: currentUser || 'غير معروف'
      };
      setMovements(prev => [newMov, ...prev]);
    }
  };

  const executeTransferAddition = (type: 'vault' | 'bank_account', id: string, currency: string, amount: number, refId: string, timestamp: string) => {
    if (type === 'vault') {
      const v = vaults.find(v => v.id === id);
      const balanceBefore = v?.balances[currency] || 0;
      setVaults(prev => prev.map(v => {
        if (v.id === id) {
          const updatedBal = { ...v.balances };
          updatedBal[currency] = (updatedBal[currency] || 0) + amount;
          return { ...v, balances: updatedBal, lastMovement: timestamp };
        }
        return v;
      }));

      const newMov: Movement = {
        id: `m_${Date.now()}_tr_add`,
        timestamp,
        entityType: 'vault',
        entityId: id,
        entityName: v?.name || '',
        currency,
        type: 'تحويل أموال (وارد)',
        amountIn: amount,
        amountOut: 0,
        balanceBefore,
        balanceAfter: balanceBefore + amount,
        referenceId: refId,
        user: currentUser || 'powered'
      };
      setMovements(prev => [newMov, ...prev]);
    } else {
      const ba = bankAccounts.find(ba => ba.id === id);
      const balanceBefore = ba?.balance || 0;
      setBankAccounts(prev => prev.map(ba => {
        if (ba.id === id) {
          return { ...ba, balance: ba.balance + amount, lastMovement: timestamp };
        }
        return ba;
      }));

      const newMov: Movement = {
        id: `m_${Date.now()}_tr_add_b`,
        timestamp,
        entityType: 'bank_account',
        entityId: id,
        entityName: `${ba?.bankName} - ${ba?.accountName}`,
        currency,
        type: 'تحويل بنكي (داخل)',
        amountIn: amount,
        amountOut: 0,
        balanceBefore,
        balanceAfter: balanceBefore + amount,
        referenceId: refId,
        user: currentUser || 'powered'
      };
      setMovements(prev => [newMov, ...prev]);
    }
  };

  const updateTransferStatus = async (id: string, action: 'approve' | 'reject' | 'send' | 'receive' | 'cancel') => {
    // Find the approval request corresponding to this transfer
    const appr = approvals.find(a => a.referenceId === id && a.type === 'transfer');
    if (appr && (action === 'approve' || action === 'reject')) {
      try {
        const res = await fetchAPI(`/approvals/${appr.id}/action?action=${action}`, { method: 'POST' });
        if (res) {
          // Re-fetch everything to ensure consistent state
          const [transfersData, vaultsData, banksData, approvalsData] = await Promise.all([
            fetchAPI("/transfers"),
            fetchAPI("/vaults"),
            fetchAPI("/bank_accounts"),
            fetchAPI("/approvals")
          ]);
          if (transfersData) _setTransfers(transfersData);
          if (vaultsData) setVaults(vaultsData);
          if (banksData) setBankAccounts(banksData);
          if (approvalsData) setApprovals(approvalsData);
          addAuditLog(`تحديث حالة تحويل`, 'TRANSACTION', `تم ${action === 'approve' ? 'الموافقة على' : 'رفض'} التحويل`);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  // 6. Debts operations
  const addDebt = async (debt: Omit<Debt, 'id' | 'paidAmount' | 'remainingAmount' | 'status'>) => {
    const newId = `d_${Date.now()}`;
    const newDebt: Debt = {
      ...debt,
      id: newId,
      paidAmount: 0,
      remainingAmount: debt.amount,
      status: 'unpaid'
    };
    try {
      await fetchAPI('/debts', {
        method: 'POST',
        body: JSON.stringify({
          id: newId,
          customer_id: debt.customerId,
          customer_name: debt.customerName,
          currency: debt.currency,
          amount: debt.amount,
          start_date: debt.startDate,
          due_date: debt.dueDate,
          payment_period: debt.paymentPeriod || 'monthly',
          payment_amount: debt.paymentAmount || 0,
          notes: debt.notes || null,
          transaction_id: debt.transactionId || null
        })
      });
    } catch (err) {
      console.error('Failed to save debt:', err);
    }
    setDebts(prev => [...prev, newDebt]);

    setCustomers(prev => prev.map(c => {
      if (c.id === debt.customerId) {
        const updatedBal = { ...c.balances };
        updatedBal[debt.currency] = (updatedBal[debt.currency] || 0) - debt.amount;
        return { ...c, balances: updatedBal };
      }
      return c;
    }));

    addAuditLog('إضافة دين', 'DEBT', `تسجيل دين جديد للعميل ${debt.customerName} بقيمة ${debt.amount} ${debt.currency}`);
  };

  const payDebt = async (id: string, amount: number, _notes?: string) => {
    const debt = debts.find(d => d.id === id);
    if (!debt) return { success: false, error: 'الدين غير موجود' };
    if (debt.status === 'paid') return { success: false, error: 'هذا الدين مدفوع بالكامل سابقاً' };

    if (amount > debt.remainingAmount) {
      return { success: false, error: `المبلغ المدفوع (${amount}) أكبر من المبلغ المتبقي للدين البالغ (${debt.remainingAmount})` };
    }

    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newPaid = debt.paidAmount + amount;
    const newRemaining = debt.amount - newPaid;
    const status: any = newRemaining === 0 ? 'paid' : 'partially_paid';

    setDebts(prev => prev.map(d => d.id === id ? {
      ...d,
      paidAmount: newPaid,
      remainingAmount: newRemaining,
      status
    } : d));

    setCustomers(prev => prev.map(c => {
      if (c.id === debt.customerId) {
        const updatedBal = { ...c.balances };
        updatedBal[debt.currency] = (updatedBal[debt.currency] || 0) + amount;
        return { ...c, balances: updatedBal };
      }
      return c;
    }));

    const newCmov: Movement = {
      id: `m_${Date.now()}_debt_pay`,
      timestamp: timestampStr,
      entityType: 'customer',
      entityId: debt.customerId,
      entityName: debt.customerName,
      currency: debt.currency,
      type: 'سداد دفعة من الدين',
      amountIn: amount,
      amountOut: 0,
      balanceBefore: (customers.find(c => c.id === debt.customerId)?.balances[debt.currency] || 0),
      balanceAfter: (customers.find(c => c.id === debt.customerId)?.balances[debt.currency] || 0) + amount,
      referenceId: debt.id,
      user: currentUser || 'غير معروف'
    };
    setMovements(prev => [newCmov, ...prev]);

    setVaults(prev => prev.map(v => {
      if (v.id === currentVaultId) {
        const updated = { ...v.balances };
        updated[debt.currency] = (updated[debt.currency] || 0) + amount;
        return { ...v, balances: updated, lastMovement: timestampStr };
      }
      return v;
    }));

    const cashierName = vaults.find(v => v.id === currentVaultId)?.name || 'خزنة';
    const newVmov: Movement = {
      id: `m_${Date.now()}_debt_pay_v`,
      timestamp: timestampStr,
      entityType: 'vault',
      entityId: currentVaultId,
      entityName: cashierName,
      currency: debt.currency,
      type: 'مقبوضات سداد دين عميل',
      amountIn: amount,
      amountOut: 0,
      balanceBefore: (vaults.find(v => v.id === currentVaultId)?.balances[debt.currency] || 0),
      balanceAfter: (vaults.find(v => v.id === currentVaultId)?.balances[debt.currency] || 0) + amount,
      referenceId: debt.id,
      user: currentUser || 'غير معروف'
    };
    setMovements(prev => [newVmov, ...prev]);

    const newJV: JournalEntry = {
      id: `JV-${timestampStr.replace(/[- :]/g, '').substring(0, 8)}-${Math.floor(Math.random() * 900 + 100)}`,
      date: timestampStr,
      txType: 'سداد دين',
      reference: debt.id,
      description: `قيد سداد دفعة دين للعميل ${debt.customerName} بمبلغ ${amount} ${debt.currency}`,
      user: currentUser || 'غير معروف',
      status: 'approved',
      lines: [
        {
          accountName: `خزينة ${cashierName} - ${debt.currency}`,
          currency: debt.currency,
          debit: amount,
          credit: 0.0,
          originalAmount: amount,
          exchangeRate: 1.0,
          equivalentLYD: debt.currency === 'LYD' ? amount : amount * (rates.find(r => r.fromCurrency === debt.currency)?.buyRate || 7.2)
        },
        {
          accountName: `حساب ذمم العميل المدين ${debt.customerName} - ${debt.currency}`,
          currency: debt.currency,
          debit: 0.0,
          credit: amount,
          originalAmount: amount,
          exchangeRate: 1.0,
          equivalentLYD: debt.currency === 'LYD' ? amount : amount * (rates.find(r => r.fromCurrency === debt.currency)?.buyRate || 7.2)
        }
      ]
    };
    setJournalEntries(prev => [newJV, ...prev]);

    // Persist payment to backend
    try {
      await fetchAPI(`/debts/${id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ amount, notes: _notes || null })
      });
    } catch (err) {
      console.error('Failed to persist debt payment:', err);
    }

    addAuditLog('سداد دين', 'DEBT', `تم استلام سداد دفعة دين بمبلغ ${amount} ${debt.currency} من العميل ${debt.customerName}، المتبقي: ${newRemaining}`);

    return { success: true };
  };

  // 7. Cash Shifts
  const openShift = (vaultId: string, openingBalances: Record<string, number>, notes?: string) => {
    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    // Use vault's current balances as initial opening balances if not provided
    const vault = vaults.find(v => v.id === vaultId);
    const resolvedOpeningBals = Object.keys(openingBalances).length > 0
      ? openingBalances
      : (vault ? { ...vault.balances } : {});

    const newShift: Shift = {
      id: `s_${Date.now()}`,
      cashier: notes || currentUser || 'غير معروف',
      branch: currentBranch || 'فرع طرابلس',
      vaultId,
      vaultName: vault?.name || 'صندوق',
      startTime: timestampStr,
      openingBalances: resolvedOpeningBals,
      expectedBalances: { ...resolvedOpeningBals },
      actualBalances: { ...resolvedOpeningBals },
      differences: { LYD: 0, USD: 0, EUR: 0, TRY: 0, GBP: 0 },
      status: 'open',
      notes
    };

    setShifts(prev => [newShift, ...prev]);
    
    setVaults(prev => prev.map(v => {
      if (v.id === vaultId) {
        return {
          ...v,
          balances: { ...resolvedOpeningBals },
          openingBalances: { ...resolvedOpeningBals },
          lastMovement: timestampStr
        };
      }
      return v;
    }));

    addAuditLog('فتح وردية', 'SHIFT', `تم فتح وردية الصندوق ${newShift.vaultName} بواسطة الصراف ${currentUser}`);
  };

  const closeShift = (shiftId: string, actualBalances: Record<string, number>, notes?: string) => {
    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;

    const differences: Record<string, number> = {};
    let hasDifferences = false;
    
    currencies.forEach(c => {
      const code = c.code;
      const expected = shift.expectedBalances[code] || 0;
      const actual = actualBalances[code] || 0;
      const diff = actual - expected;
      differences[code] = diff;
      if (diff !== 0) hasDifferences = true;
    });

    const status = hasDifferences ? 'difference_found' : 'pending_approval';

    setShifts(prev => prev.map(s => s.id === shiftId ? {
      ...s,
      endTime: timestampStr,
      actualBalances,
      differences,
      status,
      notes
    } : s));

    if (hasDifferences) {
      currencies.forEach(c => {
        const diff = differences[c.code];
        if (diff !== 0) {
          const newCount: InventoryCount = {
            id: `ic_${Date.now()}_${c.code}`,
            timestamp: timestampStr,
            vaultId: shift.vaultId,
            vaultName: shift.vaultName,
            currency: c.code,
            systemBalance: shift.expectedBalances[c.code] || 0,
            actualBalance: actualBalances[c.code] || 0,
            difference: diff,
            reason: diff < 0 ? 'shortage' : 'overage',
            status: 'pending_review',
            notes: `فرق جرد ناتج عن إإغلاق وردية الصندوق رقم ${shiftId}`,
            reportedBy: currentUser || 'غير معروف'
          };
          setInventoryCounts(prev => [newCount, ...prev]);

          const newApp: ApprovalRequest = {
            id: `apr_diff_${Date.now()}_${c.code}`,
            type: 'inventory',
            title: `موافقة فرق جرد (${diff > 0 ? 'زيادة' : 'عجز'} ${diff} ${c.code})`,
            amount: Math.abs(diff),
            currency: c.code,
            requestedBy: currentUser || 'غير معروف',
            timestamp: timestampStr,
            status: 'pending',
            referenceId: newCount.id,
            details: `فرق جرد مقداره ${diff} ${c.code} في صندوق الصراف ${shift.cashier} بعد إإغلاق الوردية`
          };
          setApprovals(prev => [newApp, ...prev]);
        }
      });
      addAuditLog('إإغلاق وردية بفرق', 'SHIFT', `تم إإغلاق وردية الصندوق ${shift.vaultName} مع وجود فروق جرد (زيادة/عجز) في الانتظار المراجعة والاعتماد`);
    } else {
      const newApp: ApprovalRequest = {
        id: `apr_shift_${Date.now()}`,
        type: 'shift_close',
        title: `طلب اعتماد إإغلاق وردية الصراف ${shift.cashier}`,
        requestedBy: currentUser || 'غير معروف',
        timestamp: timestampStr,
        status: 'pending',
        referenceId: shiftId,
        details: `طلب اعتماد إإغلاق وردية الصندوق ${shift.vaultName} مطابقة بنسبة 100%`
      };
      setApprovals(prev => [newApp, ...prev]);
      addAuditLog('إإغلاق وردية مطابقة', 'SHIFT', `تم إإغلاق وردية الصندوق ${shift.vaultName} بنجاح، بانتظار اعتماد المدير`);
    }
  };

  const approveShift = (shiftId: string) => {
    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, status: 'approved' } : s));
    setApprovals(prev => prev.map(a => a.referenceId === shiftId ? { ...a, status: 'approved' } : a));
    
    const shift = shifts.find(s => s.id === shiftId);
    addAuditLog('اعتماد إإغلاق وردية', 'SHIFT', `تم اعتماد إإغلاق وردية الصراف ${shift?.cashier} للصندوق ${shift?.vaultName} بنجاح من قبل ${currentUser}`);
  };

  // 8. Vault Cash Inventory Counting (الجرد)
  const submitInventoryCount = (
    vaultId: string,
    currency: string,
    systemBalance: number,
    actualBalance: number,
    reason: 'shortage' | 'overage' | 'counting_error' | 'damaged_cash' | 'admin_settlement',
    notes?: string
  ) => {
    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const diff = actualBalance - systemBalance;
    const newCount: InventoryCount = {
      id: `ic_${Date.now()}`,
      timestamp: timestampStr,
      vaultId,
      vaultName: vaults.find(v => v.id === vaultId)?.name || 'خزنة',
      currency,
      systemBalance,
      actualBalance,
      difference: diff,
      reason,
      status: 'pending_review',
      notes,
      reportedBy: currentUser || 'غير معروف'
    };

    setInventoryCounts(prev => [newCount, ...prev]);

    const newApp: ApprovalRequest = {
      id: `apr_ic_${Date.now()}`,
      type: 'inventory',
      title: `طلب اعتماد تسوية جرد خزنة (${diff > 0 ? 'زيادة' : 'عجز'} ${diff} ${currency})`,
      amount: Math.abs(diff),
      currency,
      requestedBy: currentUser || 'غير معروف',
      timestamp: timestampStr,
      status: 'pending',
      referenceId: newCount.id,
      details: `تسوية فرق جرد الخزنة ${newCount.vaultName} لعملة ${currency} بقيمة ${diff} د.ل`
    };

    setApprovals(prev => [newApp, ...prev]);
    addAuditLog('تقديم تسوية جرد', 'INVENTORY', `تم تقديم طلب تسوية فرق جرد للخزنة ${newCount.vaultName} بمقدار ${diff} ${currency}`);
  };

  const approveInventoryCount = (id: string) => {
    const count = inventoryCounts.find(ic => ic.id === id);
    if (!count) return;

    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    setVaults(prev => prev.map(v => {
      if (v.id === count.vaultId) {
        const updated = { ...v.balances };
        updated[count.currency] = count.actualBalance;
        return { ...v, balances: updated, lastMovement: timestampStr };
      }
      return v;
    }));

    const newMov: Movement = {
      id: `m_${Date.now()}_ic_settle`,
      timestamp: timestampStr,
      entityType: 'vault',
      entityId: count.vaultId,
      entityName: count.vaultName,
      currency: count.currency,
      type: `تسوية جرد ${count.difference > 0 ? '(زيادة)' : '(عجز)'}`,
      amountIn: count.difference > 0 ? count.difference : 0,
      amountOut: count.difference < 0 ? Math.abs(count.difference) : 0,
      balanceBefore: count.systemBalance,
      balanceAfter: count.actualBalance,
      referenceId: id,
      user: currentUser || 'powered'
    };
    setMovements(prev => [newMov, ...prev]);

    const newJV: JournalEntry = {
      id: `JV-${timestampStr.replace(/[- :]/g, '').substring(0, 8)}-${Math.floor(Math.random() * 900 + 100)}`,
      date: timestampStr,
      txType: 'تسوية جرد',
      reference: id,
      description: `قيد تسوية فروق جرد خزنة ${count.vaultName} لعملة ${count.currency} بفرق ${count.difference}`,
      user: currentUser || 'غير معروف',
      status: 'approved',
      lines: [
        {
          accountName: `خزينة ${count.vaultName} - ${count.currency}`,
          currency: count.currency,
          debit: count.difference > 0 ? Math.abs(count.difference) : 0.0,
          credit: count.difference < 0 ? Math.abs(count.difference) : 0.0,
          originalAmount: Math.abs(count.difference),
          exchangeRate: 1.0,
          equivalentLYD: Math.abs(count.difference)
        },
        {
          accountName: count.difference > 0 ? 'إإيرادات تسويات جرد (فروقات)' : 'خسائر تسويات جرد (عجز وعوارض)',
          currency: count.currency,
          debit: count.difference < 0 ? Math.abs(count.difference) : 0.0,
          credit: count.difference > 0 ? Math.abs(count.difference) : 0.0,
          originalAmount: Math.abs(count.difference),
          exchangeRate: 1.0,
          equivalentLYD: Math.abs(count.difference)
        }
      ]
    };
    setJournalEntries(prev => [newJV, ...prev]);

    setInventoryCounts(prev => prev.map(ic => ic.id === id ? { ...ic, status: 'approved', approvedBy: currentUser || 'غير معروف' } : ic));
    setApprovals(prev => prev.map(a => a.referenceId === id ? { ...a, status: 'approved' } : a));

    addAuditLog('اعتماد تسوية جرد', 'INVENTORY', `تم اعتماد تسوية فرق جرد الخزنة ${count.vaultName} لعملة ${count.currency} بنجاح، وتم تعديل الأأرصدة للنظام لتطابق الواقع`);
  };

  const rejectInventoryCount = (id: string) => {
    setInventoryCounts(prev => prev.map(ic => ic.id === id ? { ...ic, status: 'rejected' } : ic));
    setApprovals(prev => prev.map(a => a.referenceId === id ? { ...a, status: 'rejected' } : a));
    addAuditLog('رفض تسوية جرد', 'INVENTORY', `تم رفض تسوية فرق جرد الخزنة بقيمة الدين من قبل ${currentUser}`);
  };

  // 9. Reconciliation Operations
  const requestReconciliation = (
    type: 'vault' | 'bank' | 'customer' | 'inventory',
    targetId: string,
    currency: string,
    amount: number,
    reason: string,
    notes?: string
  ) => {
    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newId = `rec_${Date.now()}`;
    const targetName = type === 'vault' 
      ? vaults.find(v => v.id === targetId)?.name || 'خزنة'
      : type === 'bank'
      ? bankAccounts.find(ba => ba.id === targetId)?.accountName || 'حساب بنكي'
      : customers.find(c => c.id === targetId)?.name || 'عميل';

    const newRec: Reconciliation = {
      id: newId,
      type,
      targetId,
      targetName,
      currency,
      amount,
      reason,
      status: 'pending',
      requestedBy: currentUser || 'غير معروف',
      timestamp: timestampStr,
      notes
    };

    setReconciliations(prev => [newRec, ...prev]);

    const newApp: ApprovalRequest = {
      id: `apr_rec_${Date.now()}`,
      type: 'reconciliation',
      title: `تسوية مالية إإدارية للـ ${type === 'vault' ? 'خزنة' : type === 'bank' ? 'حساب البنكي' : 'عميل'} ${targetName}`,
      amount,
      currency,
      requestedBy: currentUser || 'غير معروف',
      timestamp: timestampStr,
      status: 'pending',
      referenceId: newId,
      details: `طلب تسوية إإدارية بقيمة ${amount} ${currency} للـ ${targetName} لوجود: ${reason}`
    };

    setApprovals(prev => [newApp, ...prev]);
    addAuditLog('طلب تسوية مالية', 'RECONCILIATION', `تم تقديم طلب تسوية مالية إإدارية للـ ${targetName} بمقدار ${amount} ${currency}`);
  };

  const approveReconciliation = (id: string) => {
    const rec = reconciliations.find(r => r.id === id);
    if (!rec) return;

    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (rec.type === 'vault') {
      const v = vaults.find(va => va.id === rec.targetId);
      const balanceBefore = v?.balances[rec.currency] || 0;
      
      setVaults(prev => prev.map(v => {
        if (v.id === rec.targetId) {
          const updated = { ...v.balances };
          updated[rec.currency] = (updated[rec.currency] || 0) + rec.amount;
          return { ...v, balances: updated, lastMovement: timestampStr };
        }
        return v;
      }));

      const newMov: Movement = {
        id: `m_${Date.now()}_rec_settle_v`,
        timestamp: timestampStr,
        entityType: 'vault',
        entityId: rec.targetId,
        entityName: rec.targetName,
        currency: rec.currency,
        type: 'تسوية مالية إإدارية (وارد)',
        amountIn: rec.amount > 0 ? rec.amount : 0,
        amountOut: rec.amount < 0 ? Math.abs(rec.amount) : 0,
        balanceBefore,
        balanceAfter: balanceBefore + rec.amount,
        referenceId: id,
        user: currentUser || 'powered'
      };
      setMovements(prev => [newMov, ...prev]);
    } else if (rec.type === 'bank') {
      const ba = bankAccounts.find(b => b.id === rec.targetId);
      const balanceBefore = ba?.balance || 0;

      setBankAccounts(prev => prev.map(ba => {
        if (ba.id === rec.targetId) {
          return { ...ba, balance: ba.balance + rec.amount, lastMovement: timestampStr };
        }
        return ba;
      }));

      const newMov: Movement = {
        id: `m_${Date.now()}_rec_settle_b`,
        timestamp: timestampStr,
        entityType: 'bank_account',
        entityId: rec.targetId,
        entityName: rec.targetName,
        currency: rec.currency,
        type: 'تسوية رصيد حساب مصرفي',
        amountIn: rec.amount > 0 ? rec.amount : 0,
        amountOut: rec.amount < 0 ? Math.abs(rec.amount) : 0,
        balanceBefore,
        balanceAfter: balanceBefore + rec.amount,
        referenceId: id,
        user: currentUser || 'powered'
      };
      setMovements(prev => [newMov, ...prev]);
    } else if (rec.type === 'customer') {
      const c = customers.find(cu => cu.id === rec.targetId);
      const balanceBefore = c?.balances[rec.currency] || 0;

      setCustomers(prev => prev.map(cust => {
        if (cust.id === rec.targetId) {
          const updated = { ...cust.balances };
          updated[rec.currency] = (updated[rec.currency] || 0) + rec.amount;
          return { ...cust, balances: updated };
        }
        return cust;
      }));

      const newMov: Movement = {
        id: `m_${Date.now()}_rec_settle_c`,
        timestamp: timestampStr,
        entityType: 'customer',
        entityId: rec.targetId,
        entityName: rec.targetName,
        currency: rec.currency,
        type: 'تسوية رصيد حساب العميل إإدارياً',
        amountIn: rec.amount > 0 ? rec.amount : 0,
        amountOut: rec.amount < 0 ? Math.abs(rec.amount) : 0,
        balanceBefore,
        balanceAfter: balanceBefore + rec.amount,
        referenceId: id,
        user: currentUser || 'powered'
      };
      setMovements(prev => [newMov, ...prev]);
    }

    setReconciliations(prev => prev.map(r => r.id === id ? { ...r, status: 'approved', approvedBy: currentUser || 'غير معروف' } : r));
    setApprovals(prev => prev.map(a => a.referenceId === id ? { ...a, status: 'approved' } : a));

    addAuditLog('اعتماد تسوية إإدارية', 'RECONCILIATION', `تم اعتماد طلب تسوية مالية إإدارية بنجاح للـ ${rec.targetName} بمبلغ ${rec.amount} ${rec.currency}`);
  };

  // 10. Financial Operations Reversals
  const requestReversal = (originalTxId: string, reason: string) => {
    const originalTx = transactions.find(t => t.id === originalTxId);
    if (!originalTx) return { success: false, error: 'العملية الأصلية غير موجودة' };
    if (originalTx.status === 'reversed') return { success: false, error: 'هذه العملية تم عكسها وإإلغاؤها سابقاً' };

    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newApprovalId = `apr_rev_${Date.now()}`;

    const newApproval: ApprovalRequest = {
      id: newApprovalId,
      type: 'reversal',
      title: `إإلغاء وعكس العملية المالية ${originalTxId}`,
      amount: originalTx.amount,
      currency: originalTx.fromCurrency,
      requestedBy: currentUser || 'غير معروف',
      timestamp: timestampStr,
      status: 'pending',
      referenceId: originalTxId,
      details: `طلب إنشاء قيد عكسي للعملية المالية (${originalTxId} - ${originalTx.type === 'buy' ? 'شراء' : 'بيع'}) بقيمة ${originalTx.amount} بسبب: ${reason}`
    };

    setApprovals(prev => [newApproval, ...prev]);
    addAuditLog('طلب عملية عكسية', 'REVERSAL', `تم تقديم طلب قيد عكسي لإإلغاء العملية المالية ${originalTxId} من قبل ${currentUser}`);

    return { success: true };
  };

  const approveReversal = (approvalId: string) => {
    const appReq = approvals.find(a => a.id === approvalId);
    if (!appReq) return;

    const originalTxId = appReq.referenceId;
    const originalTx = transactions.find(t => t.id === originalTxId);
    if (!originalTx) return;

    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const reversedTxId = `rev_${Date.now()}`;

    const isBuy = originalTx.type === 'buy';
    const isSell = originalTx.type === 'sell';
    const isDeposit = originalTx.type === 'deposit';
    const isWithdraw = originalTx.type === 'withdraw';

    if (originalTx.vaultId) {
      setVaults(prev => prev.map(v => {
        if (v.id === originalTx.vaultId) {
          const updated = { ...v.balances };
          if (isBuy) {
            updated[originalTx.fromCurrency] = (updated[originalTx.fromCurrency] || 0) - originalTx.amount;
            if (originalTx.paymentMethod === 'cash') {
              updated[originalTx.toCurrency] = (updated[originalTx.toCurrency] || 0) + originalTx.totalAmount;
            }
          } else if (isSell) {
            updated[originalTx.fromCurrency] = (updated[originalTx.fromCurrency] || 0) - originalTx.totalAmount;
            if (originalTx.paymentMethod === 'cash') {
              updated[originalTx.toCurrency] = (updated[originalTx.toCurrency] || 0) + originalTx.amount;
            }
          } else if (isDeposit) {
            updated[originalTx.fromCurrency] = (updated[originalTx.fromCurrency] || 0) - originalTx.amount;
          } else if (isWithdraw) {
            updated[originalTx.fromCurrency] = (updated[originalTx.fromCurrency] || 0) + originalTx.amount;
          }
          return { ...v, balances: updated, lastMovement: timestampStr };
        }
        return v;
      }));

      const newVmov: Movement = {
        id: `m_${Date.now()}_rev`,
        timestamp: timestampStr,
        entityType: 'vault',
        entityId: originalTx.vaultId,
        entityName: originalTx.vaultName || '',
        currency: originalTx.fromCurrency,
        type: `عملية عكسية إإلغاء (${originalTx.type})`,
        amountIn: isBuy ? 0 : originalTx.amount,
        amountOut: isBuy ? originalTx.amount : 0,
        balanceBefore: (vaults.find(v => v.id === originalTx.vaultId)?.balances[originalTx.fromCurrency] || 0),
        balanceAfter: (vaults.find(v => v.id === originalTx.vaultId)?.balances[originalTx.fromCurrency] || 0) + (isBuy ? -originalTx.amount : originalTx.amount),
        referenceId: reversedTxId,
        user: currentUser || 'powered'
      };
      setMovements(prev => [newVmov, ...prev]);
    }

    if (originalTx.customerId) {
      setCustomers(prev => prev.map(c => {
        if (c.id === originalTx.customerId) {
          const updated = { ...c.balances };
          
          if (originalTx.paymentMethod === 'customer_account') {
            if (isBuy) {
              updated[originalTx.toCurrency] = (updated[originalTx.toCurrency] || 0) - originalTx.totalAmount;
              updated[originalTx.fromCurrency] = (updated[originalTx.fromCurrency] || 0) + originalTx.amount;
            } else if (isSell) {
              updated[originalTx.toCurrency] = (updated[originalTx.toCurrency] || 0) - originalTx.amount;
              updated[originalTx.fromCurrency] = (updated[originalTx.fromCurrency] || 0) + originalTx.totalAmount;
            }
          } else if (originalTx.paymentMethod === 'debt') {
            if (isBuy) {
              updated[originalTx.toCurrency] = (updated[originalTx.toCurrency] || 0) + originalTx.totalAmount;
            } else if (isSell) {
              updated[originalTx.fromCurrency] = (updated[originalTx.fromCurrency] || 0) + originalTx.totalAmount;
            }
          } else if (isDeposit) {
            updated[originalTx.fromCurrency] = (updated[originalTx.fromCurrency] || 0) - originalTx.amount;
          } else if (isWithdraw) {
            updated[originalTx.fromCurrency] = (updated[originalTx.fromCurrency] || 0) + originalTx.amount;
          }

          return { ...c, balances: updated };
        }
        return c;
      }));

      if (originalTx.paymentMethod === 'debt') {
        setDebts(prev => prev.map(d => d.transactionId === originalTxId ? { ...d, status: 'cancelled' } : d));
      }
    }

    if (originalTx.paymentMethod === 'bank_account' && originalTx.bankAccountId) {
      setBankAccounts(prev => prev.map(ba => {
        if (ba.id === originalTx.bankAccountId) {
          return {
            ...ba,
            balance: isBuy ? ba.balance + originalTx.totalAmount : ba.balance - originalTx.totalAmount,
            lastMovement: timestampStr
          };
        }
        return ba;
      }));
    }

    setTransactions(prev => prev.map(t => t.id === originalTxId ? { ...t, status: 'reversed' } : t));

    const newRevTx: Transaction = {
      id: reversedTxId,
      type: 'reversal',
      vaultId: originalTx.vaultId,
      vaultName: originalTx.vaultName,
      customerId: originalTx.customerId,
      customerName: originalTx.customerName,
      fromCurrency: originalTx.fromCurrency,
      toCurrency: originalTx.toCurrency,
      amount: originalTx.amount,
      rate: originalTx.rate,
      commission: originalTx.commission,
      totalAmount: originalTx.totalAmount,
      paymentMethod: originalTx.paymentMethod,
      status: 'approved',
      notes: `قيد عكسي لإإلغاء وتسوية العملية المالية الأصلية رقم (${originalTxId}) بقلم المحاسب ${currentUser}`,
      user: currentUser || '��ير معروف',
      branch: currentBranch || 'الإدارة العامة',
      timestamp: timestampStr,
      originalTxId
    };
    setTransactions(prev => [newRevTx, ...prev]);

    const matchingJV = journalEntries.find(jv => jv.reference === originalTxId);
    if (matchingJV) {
      const reversedLines = matchingJV.lines.map(line => ({
        ...line,
        debit: line.credit,
        credit: line.debit
      }));

      const newRevJV: JournalEntry = {
        id: `JV-REV-${timestampStr.replace(/[- :]/g, '').substring(0, 8)}-${Math.floor(Math.random() * 900 + 100)}`,
        date: timestampStr,
        txType: 'قيد عكسي',
        reference: reversedTxId,
        description: `قيد تسوية عكسي للعملية الأصلية رقم ${originalTxId} بناءً على طلب موافقة معتمد`,
        user: currentUser || 'غير معروف',
        status: 'approved',
        lines: reversedLines
      };

      setJournalEntries(prev => [newRevJV, ...prev]);
    }

    setApprovals(prev => prev.map(a => a.id === approvalId ? { ...a, status: 'approved' } : a));

    addAuditLog('اعتماد عملية عكسية', 'REVERSAL', `تم بنجاح قيد وعكس العملية المالية رقم ${originalTxId} وإإلغاء أأثرها المالي على الخزنات والعملاء والقيود اليومية`);
  };

  const rejectReversal = (approvalId: string) => {
    setApprovals(prev => prev.map(a => a.id === approvalId ? { ...a, status: 'rejected' } : a));
    addAuditLog('رفض عملية عكسية', 'REVERSAL', `تم رفض طلب القيد العكسي لإإلغاء العملية من قبل ${currentUser}`);
  };

  // CRUDs Admins — all wired to backend API
  const addBranch = async (branch: any) => {
    try {
      await fetchAPI('/branches', {
        method: 'POST',
        body: JSON.stringify({ id: branch.name, name: branch.name, city: branch.city || '', address: branch.address || '', phone: branch.phone || '', manager: branch.manager || '', notes: branch.notes || null })
      });
    } catch (err) { console.error('addBranch API failed, saving locally:', err); }
    setBranches(prev => [...prev, { ...branch, id: branch.name, isActive: true }]);
    addAuditLog('إضافة فرع', 'BRANCH', `تمت إضافة فرع جديد: ${branch.name}`);
  };
  const editBranch = async (branch: any) => {
    try {
      await fetchAPI(`/branches/${branch.id}`, {
        method: 'PUT',
        body: JSON.stringify({ id: branch.id, name: branch.name, city: branch.city || '', address: branch.address || '', phone: branch.phone || '', manager: branch.manager || '', notes: branch.notes || null })
      });
    } catch (err) { console.error('editBranch API failed:', err); }
    setBranches(prev => prev.map(b => b.id === branch.id ? branch : b));
    addAuditLog('تعديل فرع', 'BRANCH', `تم تعديل بيانات الفرع: ${branch.name}`);
  };
  const disableBranch = async (id: string) => {
    const br = branches.find(b => b.id === id);
    const newActive = !br?.isActive;
    try {
      await fetchAPI(`/branches/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ id: br?.id, name: br?.name, city: br?.city || '', address: br?.address || '', phone: br?.phone || '', manager: br?.manager || '', notes: br?.notes || null, is_active: newActive })
      });
    } catch (err) { console.error('disableBranch API failed:', err); }
    setBranches(prev => prev.map(b => b.id === id ? { ...b, isActive: newActive } : b));
    addAuditLog('تغيير حالة فرع', 'BRANCH', `تغيير حالة فرع ${id} إلى ${newActive ? 'نشط' : 'معطل'}`);
  };

  const addUser = async (user: any) => {
    const newId = user.id || `u_${Date.now()}`;
    try {
      await fetchAPI('/auth/users', {
        method: 'POST',
        body: JSON.stringify({ id: newId, name: user.name, username: user.username, password: user.password, email: user.email || null, phone: user.phone || null, role: user.role, branch: user.branch, allowed_vault_id: user.allowedVaultId || null })
      });
    } catch (err) { console.error('addUser API failed:', err); }
    setUsers(prev => [...prev, { ...user, id: newId, isActive: true }]);
    addAuditLog('إضافة مستخدم', 'USER', `إضافة مستخدم: ${user.name} بدور ${user.role}`);
  };
  const editUser = async (user: any) => {
    try {
      await fetchAPI(`/auth/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ id: user.id, name: user.name, username: user.username, password: user.password || '', email: user.email || null, phone: user.phone || null, role: user.role, branch: user.branch, allowed_vault_id: user.allowedVaultId || null })
      });
    } catch (err) { console.error('editUser API failed:', err); }
    setUsers(prev => prev.map(u => u.id === user.id ? user : u));
    addAuditLog('تعديل مستخدم', 'USER', `تعديل بيانات المستخدم: ${user.name}`);
  };
  const disableUser = async (id: string) => {
    const usr = users.find(u => u.id === id);
    const newActive = !usr?.isActive;
    try {
      await fetchAPI(`/auth/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ id: usr?.id, name: usr?.name, username: usr?.username, password: usr?.password || '', email: usr?.email || null, phone: usr?.phone || null, role: usr?.role, branch: usr?.branch, allowed_vault_id: usr?.allowedVaultId || null, is_active: newActive })
      });
    } catch (err) { console.error('disableUser API failed:', err); }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, isActive: newActive } : u));
    addAuditLog('تغيير حالة مستخدم', 'USER', `تغيير حالة ${usr?.name} إلى ${newActive ? 'نشط' : 'معطل'}`);
  };

  const addBank = async (bank: any) => {
    const newId = bank.id || `b_${Date.now()}`;
    try {
      await fetchAPI('/banks', { method: 'POST', body: JSON.stringify({ id: newId, name: bank.name, code: bank.code || newId, country: bank.country || 'ليبيا', city: bank.city || '', phone: bank.phone || '', notes: bank.notes || null }) });
    } catch (err) { console.error('addBank failed:', err); }
    setBanks(prev => [...prev, { ...bank, id: newId, isActive: true }]);
    addAuditLog('إضافة بنك', 'BANK', `إضافة بنك: ${bank.name}`);
  };
  const editBank = async (bank: any) => {
    try {
      await fetchAPI(`/banks/${bank.id}`, { method: 'PUT', body: JSON.stringify({ id: bank.id, name: bank.name, code: bank.code || bank.id, country: bank.country || '', city: bank.city || '', phone: bank.phone || '', notes: bank.notes || null }) });
    } catch (err) { console.error('editBank failed:', err); }
    setBanks(prev => prev.map(b => b.id === bank.id ? bank : b));
    addAuditLog('تعديل بنك', 'BANK', `تعديل البنك: ${bank.name}`);
  };
  const disableBank = async (id: string) => {
    const bnk = banks.find(b => b.id === id);
    const newActive = !bnk?.isActive;
    try {
      await fetchAPI(`/banks/${id}`, { method: 'PUT', body: JSON.stringify({ id: bnk?.id, name: bnk?.name, code: bnk?.code || id, country: bnk?.country || '', city: bnk?.city || '', phone: bnk?.phone || '', notes: bnk?.notes || null, is_active: newActive }) });
    } catch (err) { console.error('disableBank failed:', err); }
    setBanks(prev => prev.map(b => b.id === id ? { ...b, isActive: newActive } : b));
    addAuditLog('تغيير حالة بنك', 'BANK', `تغيير حالة البنك ${bnk?.name}`);
  };
  const deleteBank = async (id: string): Promise<boolean> => {
    const hasAccounts = bankAccounts.some(a => a.bankId === id);
    if (hasAccounts) { addAuditLog('فشل حذف بنك', 'BANK', `بنك ${id} مرتبط بحسابات`); return false; }
    try { await fetchAPI(`/banks/${id}`, { method: 'DELETE' }); } catch (err) { console.error('deleteBank failed:', err); }
    setBanks(prev => prev.filter(b => b.id !== id));
    addAuditLog('حذف بنك', 'BANK', `حذف البنك ${id}`);
    return true;
  };

  const addBankBranch = async (branch: any) => {
    const newId = branch.id || `bb_${Date.now()}`;
    try {
      await fetchAPI('/bank_branches', { method: 'POST', body: JSON.stringify({ id: newId, bank_id: branch.bankId, bank_name: branch.bankName, name: branch.name, city: branch.city || '', address: branch.address || '', phone: branch.phone || '', manager: branch.manager || '' }) });
    } catch (err) { console.error('addBankBranch failed:', err); }
    setBankBranches(prev => [...prev, { ...branch, id: newId, isActive: true }]);
    addAuditLog('إضافة فرع بنك', 'BANK_BRANCH', `إضافة فرع ${branch.name}`);
  };
  const editBankBranch = async (branch: any) => {
    try {
      await fetchAPI(`/bank_branches/${branch.id}`, { method: 'PUT', body: JSON.stringify({ id: branch.id, bank_id: branch.bankId, bank_name: branch.bankName, name: branch.name, city: branch.city || '', address: branch.address || '', phone: branch.phone || '', manager: branch.manager || '' }) });
    } catch (err) { console.error('editBankBranch failed:', err); }
    setBankBranches(prev => prev.map(bb => bb.id === branch.id ? branch : bb));
    addAuditLog('تعديل فرع بنك', 'BANK_BRANCH', `تعديل فرع: ${branch.name}`);
  };
  const disableBankBranch = async (id: string) => {
    const bb = bankBranches.find(b => b.id === id);
    const newActive = !bb?.isActive;
    try {
      await fetchAPI(`/bank_branches/${id}`, { method: 'PUT', body: JSON.stringify({ id: bb?.id, bank_id: bb?.bankId, bank_name: bb?.bankName, name: bb?.name, city: bb?.city || '', address: bb?.address || '', phone: bb?.phone || '', manager: bb?.manager || '', is_active: newActive }) });
    } catch (err) { console.error('disableBankBranch failed:', err); }
    setBankBranches(prev => prev.map(b => b.id === id ? { ...b, isActive: newActive } : b));
    addAuditLog('تغيير حالة فرع بنك', 'BANK_BRANCH', `تغيير حالة ${bb?.name}`);
  };
  const deleteBankBranch = async (id: string): Promise<boolean> => {
    const hasAccounts = bankAccounts.some(a => a.branchId === id);
    if (hasAccounts) { addAuditLog('فشل حذف فرع بنك', 'BANK_BRANCH', `فرع ${id} مرتبط بحسابات`); return false; }
    try { await fetchAPI(`/bank_branches/${id}`, { method: 'DELETE' }); } catch (err) { console.error('deleteBankBranch failed:', err); }
    setBankBranches(prev => prev.filter(bb => bb.id !== id));
    addAuditLog('حذف فرع بنك', 'BANK_BRANCH', `حذف فرع ${id}`);
    return true;
  };

  const addBankAccount = async (account: any) => {
    const newId = account.id || `ba_${Date.now()}`;
    try {
      await fetchAPI('/bank_accounts', { method: 'POST', body: JSON.stringify({ id: newId, bank_id: account.bankId, bank_name: account.bankName, branch_id: account.branchId || '', branch_name: account.branchName || '', account_name: account.accountName, account_number: account.accountNumber, currency: account.currency, balance: Number(account.balance || 0), notes: account.notes || null }) });
    } catch (err) { console.error('addBankAccount failed:', err); }
    setBankAccounts(prev => [...prev, { ...account, id: newId, balance: Number(account.balance || 0), isActive: true, lastMovement: 'لا يوجد حركات' }]);
    addAuditLog('إضافة حساب بنكي', 'BANK_ACCOUNT', `إضافة حساب ${account.accountNumber}`);
  };
  const editBankAccount = async (account: any) => {
    try {
      await fetchAPI(`/bank_accounts/${account.id}`, { method: 'PUT', body: JSON.stringify({ id: account.id, bank_id: account.bankId, bank_name: account.bankName, branch_id: account.branchId || '', branch_name: account.branchName || '', account_name: account.accountName, account_number: account.accountNumber, currency: account.currency, balance: Number(account.balance || 0), notes: account.notes || null }) });
    } catch (err) { console.error('editBankAccount failed:', err); }
    setBankAccounts(prev => prev.map(ba => ba.id === account.id ? account : ba));
    addAuditLog('تعديل حساب بنكي', 'BANK_ACCOUNT', `تعديل الحساب ${account.accountNumber}`);
  };
  const disableBankAccount = async (id: string) => {
    const ba = bankAccounts.find(b => b.id === id);
    const newActive = !ba?.isActive;
    try {
      await fetchAPI(`/bank_accounts/${id}`, { method: 'PUT', body: JSON.stringify({ id: ba?.id, bank_id: ba?.bankId, bank_name: ba?.bankName, branch_id: ba?.branchId || '', branch_name: ba?.branchName || '', account_name: ba?.accountName, account_number: ba?.accountNumber, currency: ba?.currency, balance: ba?.balance || 0, notes: ba?.notes || null, is_active: newActive }) });
    } catch (err) { console.error('disableBankAccount failed:', err); }
    setBankAccounts(prev => prev.map(b => b.id === id ? { ...b, isActive: newActive } : b));
    addAuditLog('تغيير حالة حساب', 'BANK_ACCOUNT', `تغيير حالة الحساب ${ba?.accountNumber}`);
  };
  const deleteBankAccount = async (id: string): Promise<boolean> => {
    const hasMovements = movements.some(m => m.entityId === id && m.entityType === 'bank_account');
    if (hasMovements) { addAuditLog('فشل حذف حساب بنكي', 'BANK_ACCOUNT', `حساب ${id} مرتبط بحركات`); return false; }
    try { await fetchAPI(`/bank_accounts/${id}`, { method: 'DELETE' }); } catch (err) { console.error('deleteBankAccount failed:', err); }
    setBankAccounts(prev => prev.filter(ba => ba.id !== id));
    addAuditLog('حذف حساب بنكي', 'BANK_ACCOUNT', `حذف الحساب ${id}`);
    return true;
  };

  const addCustomer = async (customer: any) => {
    const newId = customer.id || `c_${Date.now()}`;
    const initBalances = customer.balances || { LYD: 0, USD: 0, EUR: 0, TRY: 0, GBP: 0 };
    try {
      await fetchAPI('/customers', { method: 'POST', body: JSON.stringify({ id: newId, name: customer.name, type: customer.type || 'individual', phone: customer.phone || '', id_number: customer.idNumber || '', address: customer.address || '', debt_limit: customer.debtLimit || 1000, balances: initBalances, notes: customer.notes || null, profit_pct: customer.profitPct || 0 }) });
    } catch (err) { console.error('addCustomer failed:', err); }
    setCustomers(prev => [...prev, { ...customer, id: newId, balances: initBalances, isActive: true, profitPct: customer.profitPct || 0 }]);
    addAuditLog('إضافة عميل', 'CUSTOMER', `إضافة عميل: ${customer.name}`);
  };
  const editCustomer = async (customer: any) => {
    try {
      await fetchAPI(`/customers/${customer.id}`, { method: 'PUT', body: JSON.stringify({ id: customer.id, name: customer.name, type: customer.type || 'individual', phone: customer.phone || '', id_number: customer.idNumber || '', address: customer.address || '', debt_limit: customer.debtLimit || 0, balances: customer.balances || {}, notes: customer.notes || null, profit_pct: customer.profitPct || 0 }) });
    } catch (err) { console.error('editCustomer failed:', err); }
    setCustomers(prev => prev.map(c => c.id === customer.id ? customer : c));
    addAuditLog('تعديل عميل', 'CUSTOMER', `تعديل بيانات: ${customer.name}`);
  };
  const disableCustomer = async (id: string) => {
    const cust = customers.find(c => c.id === id);
    const newActive = !cust?.isActive;
    try {
      await fetchAPI(`/customers/${id}`, { method: 'PUT', body: JSON.stringify({ id: cust?.id, name: cust?.name, type: cust?.type || 'individual', phone: cust?.phone || '', id_number: cust?.idNumber || '', address: cust?.address || '', debt_limit: cust?.debtLimit || 0, balances: cust?.balances || {}, notes: cust?.notes || null, profit_pct: cust?.profitPct || 0, is_active: newActive }) });
    } catch (err) { console.error('disableCustomer failed:', err); }
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, isActive: newActive } : c));
    addAuditLog('تغيير حالة عميل', 'CUSTOMER', `تغيير حالة ${cust?.name}`);
  };
  const deleteCustomer = async (id: string): Promise<boolean> => {
    const hasDebts = debts.some(d => d.customerId === id && d.status !== 'paid' && d.status !== 'cancelled');
    const hasTx = transactions.some(t => t.customerId === id);
    if (hasDebts || hasTx) { addAuditLog('فشل حذف عميل', 'CUSTOMER', `عميل ${id} مرتبط بعمليات`); return false; }
    try { await fetchAPI(`/customers/${id}`, { method: 'DELETE' }); } catch (err) { console.error('deleteCustomer failed:', err); }
    setCustomers(prev => prev.filter(c => c.id !== id));
    addAuditLog('حذف عميل', 'CUSTOMER', `حذف العميل ${id}`);
    return true;
  };

  const editVault = async (vault: any) => {
    try {
      await fetchAPI(`/vaults/${vault.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          id: vault.id,
          name: vault.name,
          type: vault.type,
          branch: vault.branch,
          manager: vault.manager || '',
          balances: vault.balances || {},
          opening_balances: vault.openingBalances || vault.balances || {},
          is_active: vault.isActive !== undefined ? vault.isActive : true
        })
      });
    } catch (err) {
      console.error('Failed to edit vault:', err);
    }
    setVaults(prev => prev.map(v => v.id === vault.id ? { ...v, ...vault } : v));
    addAuditLog('تعديل خزنة', 'VAULT', `تم تعديل بيانات الخزنة: ${vault.name}`);
  };

  const disableVault = async (id: string) => {
    const v = vaults.find(val => val.id === id);
    if (!v) return;
    const newActive = !v.isActive;
    try {
      await fetchAPI(`/vaults/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          id: v.id,
          name: v.name,
          type: v.type,
          branch: v.branch,
          manager: v.manager || '',
          balances: v.balances,
          opening_balances: v.openingBalances || v.balances,
          is_active: newActive
        })
      });
    } catch (err) {
      console.error('Failed to disable vault:', err);
    }
    setVaults(prev => prev.map(val => val.id === id ? { ...val, isActive: newActive } : val));
    addAuditLog('تغيير حالة خزنة', 'VAULT', `تغيير حالة الخزنة ${v.name} إلى ${newActive ? 'نشط' : 'معطل'}`);
  };

  const deleteUser = async (id: string): Promise<boolean> => {
    const user = users.find(u => u.id === id);
    if (user?.username === 'admin') { addAuditLog('فشل حذف مستخدم', 'USER', 'محاولة حذف المستخدم admin'); return false; }
    try { await fetchAPI(`/auth/users/${id}`, { method: 'DELETE' }); } catch (err) { console.error('deleteUser failed:', err); }
    setUsers(prev => prev.filter(u => u.id !== id));
    addAuditLog('حذف مستخدم', 'USER', `حذف المستخدم ${user?.name}`);
    return true;
  };
  const deleteBranch = async (id: string): Promise<boolean> => {
    const hasUsers = users.some(u => u.branch === id);
    if (hasUsers) { addAuditLog('فشل حذف فرع', 'BRANCH', `فرع ${id} مرتبط بمستخدمين`); return false; }
    try { await fetchAPI(`/branches/${id}`, { method: 'DELETE' }); } catch (err) { console.error('deleteBranch failed:', err); }
    setBranches(prev => prev.filter(b => b.id !== id));
    addAuditLog('حذف فرع', 'BRANCH', `حذف الفرع ${id}`);
    return true;
  };

  const updateRolePermissions = (role: string, permissions: string[] | null) => {
    setRolesPermissions(prev => {
      const updated = { ...prev };
      if (permissions === null) {
        delete updated[role];
      } else {
        updated[role] = permissions;
      }
      localStorage.setItem('rolesPermissions', JSON.stringify(updated));
      return updated;
    });
    if (permissions === null) {
      addAuditLog('حذف دور', 'ROLE_PERMISSIONS', `تم حذف دور الصلاحيات ${role}`);
    } else {
      addAuditLog('تعديل الصلاحيات', 'ROLE_PERMISSIONS', `تعديل جدول صلاحيات الدور ${role}`);
    }
  };

  const updateSettings = (newSettings: Record<string, any>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    addAuditLog('تعديل الإإعدادات', 'SETTINGS', `تم تعديل إإعدادات النظام وتفضيلات الصرافة والنسخ الاحتياطي`);
  };

  const triggerBackup = () => {
    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const newB: any = {
      id: `b_${Date.now()}`,
      timestamp: timestampStr,
      type: 'نسخة احتياطية يدوية (كاملة)',
      size: `${(Math.random() * 2 + 3).toFixed(1)} MB`,
      status: 'ناجحة',
      user: currentUser || 'غير معروف'
    };
    setBackups(prev => [newB, ...prev]);
    addAuditLog('إنشاء نسخة احتياطية', 'BACKUP', `تم بنجاح إنشاء نسخة احتياطية يدوية لقواعد البيانات والأأرصدة`);
  };

  // Fixed Assets Management Functions
  const addAsset = async (asset: FixedAsset, details?: { vehicle?: Omit<Vehicle, 'id' | 'assetId'>; realEstate?: Omit<RealEstate, 'id' | 'assetId'> }) => {
    try {
      // 1. Save general asset to backend
      await fetchAPI("/assets", {
        method: "POST",
        body: JSON.stringify({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          category: asset.category,
          branch: asset.branch,
          location: asset.location,
          purchase_date: asset.purchaseDate,
          purchase_price: asset.purchasePrice,
          currency: asset.currency,
          current_value: asset.currentValue,
          status: asset.status,
          responsible: asset.responsible,
          notes: asset.notes
        })
      });

      // 2. Save Vehicle details if it's a vehicle
      let finalVehicle: Vehicle | null = null;
      if (asset.type === 'سيارة' && details?.vehicle) {
        const vehicleId = `VEH-${Date.now()}`;
        finalVehicle = {
          ...details.vehicle,
          id: vehicleId,
          assetId: asset.id,
          status: 'نشط'
        };
        await fetchAPI("/vehicles", {
          method: "POST",
          body: JSON.stringify({
            id: vehicleId,
            asset_id: asset.id,
            car_name: details.vehicle.carName,
            plate_number: details.vehicle.plateNumber,
            type: details.vehicle.type,
            model: details.vehicle.model,
            make_year: details.vehicle.makeYear,
            vin: details.vehicle.vin,
            engine_number: details.vehicle.engineNumber,
            color: details.vehicle.color,
            mileage: details.vehicle.mileage || 0,
            insurance_date: details.vehicle.insuranceDate,
            insurance_expiry: details.vehicle.insuranceExpiry,
            license_date: details.vehicle.licenseDate,
            license_expiry: details.vehicle.licenseExpiry,
            driver: details.vehicle.driver,
            branch: details.vehicle.branch,
            status: 'نشط'
          })
        });
      }

      // 3. Save Real Estate details if it's real estate
      let finalRealEstate: RealEstate | null = null;
      if (['مبنى', 'مكتب', 'أرض', 'مخزن'].includes(asset.type) && details?.realEstate) {
        const estateId = `EST-${Date.now()}`;
        finalRealEstate = {
          ...details.realEstate,
          id: estateId,
          assetId: asset.id,
          status: 'نشط'
        };
        await fetchAPI("/real_estates", {
          method: "POST",
          body: JSON.stringify({
            id: estateId,
            asset_id: asset.id,
            property_name: details.realEstate.propertyName,
            property_type: details.realEstate.propertyType,
            city: details.realEstate.city,
            address: details.realEstate.address,
            area: details.realEstate.area,
            deed_number: details.realEstate.deedNumber,
            ownership_type: details.realEstate.ownershipType,
            acquisition_date: details.realEstate.acquisitionDate,
            purchase_price: details.realEstate.purchasePrice || 0,
            current_estimated_value: details.realEstate.currentEstimatedValue || 0,
            lease_start: details.realEstate.leaseStart || null,
            lease_end: details.realEstate.leaseEnd || null,
            monthly_rent: details.realEstate.monthlyRent || 0,
            status: 'نشط'
          })
        });
      }

      // Update React State on success
      setFixedAssets(prev => [...prev, asset]);
      if (finalVehicle) {
        setVehicles(prev => [...prev, finalVehicle!]);
      }
      if (finalRealEstate) {
        setRealEstates(prev => [...prev, finalRealEstate!]);
      }

      const isDepreciable = asset.type !== 'أرض' && asset.type !== 'مبنى' && asset.type !== 'خزنة';
      const usefulLife = isDepreciable ? (asset.type === 'سيارة' ? 5 : 3) : 0;
      const residualValue = isDepreciable ? asset.purchasePrice * 0.1 : asset.purchasePrice;
      const annualDepreciation = usefulLife > 0 ? (asset.purchasePrice - residualValue) / usefulLife : 0;
      const annualDepreciationRate = usefulLife > 0 ? (1 / usefulLife) * 100 : 0;

      const newDepRecord: DepreciationRecord = {
        assetId: asset.id,
        assetName: asset.name,
        depreciationMethod: isDepreciable ? 'القسط الثابت' : 'بدون إهلاك',
        purchasePrice: asset.purchasePrice,
        residualValue: residualValue,
        usefulLife: usefulLife,
        annualDepreciationRate: annualDepreciationRate,
        annualDepreciation: annualDepreciation,
        accumulatedDepreciation: 0,
        currentBookValue: asset.purchasePrice,
        lastCalculatedDate: new Date().toISOString().substring(0, 10)
      };
      setDepreciationRecords(prev => [...prev, newDepRecord]);

      addAuditLog('إضافة أصل', 'FIXED_ASSET', `إضافة أصل جديد: ${asset.name} (رقم الأصل: ${asset.id}) بقيمة ${asset.purchasePrice} ${asset.currency}`);
    } catch (err) {
      console.error("Failed to add asset on backend:", err);
      throw err;
    }
  };

  const editAsset = async (asset: FixedAsset, details?: { vehicle?: Omit<Vehicle, 'id' | 'assetId'>; realEstate?: Omit<RealEstate, 'id' | 'assetId'> }) => {
    try {
      await fetchAPI(`/assets/${asset.id}`, {
        method: "PUT",
        body: JSON.stringify({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          category: asset.category,
          branch: asset.branch,
          location: asset.location,
          purchase_date: asset.purchaseDate,
          purchase_price: asset.purchasePrice,
          currency: asset.currency,
          current_value: asset.currentValue,
          status: asset.status,
          responsible: asset.responsible,
          notes: asset.notes
        })
      });

      if (asset.type === 'سيارة' && details?.vehicle) {
        const existingVeh = vehicles.find(v => v.assetId === asset.id);
        const vehicleId = existingVeh?.id || `VEH-${Date.now()}`;
        const bodyData = {
          id: vehicleId,
          asset_id: asset.id,
          car_name: details.vehicle.carName,
          plate_number: details.vehicle.plateNumber,
          type: details.vehicle.type,
          model: details.vehicle.model,
          make_year: details.vehicle.makeYear,
          vin: details.vehicle.vin,
          engine_number: details.vehicle.engineNumber,
          color: details.vehicle.color,
          mileage: details.vehicle.mileage || 0,
          insurance_date: details.vehicle.insuranceDate,
          insurance_expiry: details.vehicle.insuranceExpiry,
          license_date: details.vehicle.licenseDate,
          license_expiry: details.vehicle.licenseExpiry,
          driver: details.vehicle.driver,
          branch: details.vehicle.branch,
          status: 'نشط'
        };
        if (existingVeh) {
          await fetchAPI(`/vehicles/${vehicleId}`, {
            method: "PUT",
            body: JSON.stringify(bodyData)
          });
        } else {
          await fetchAPI("/vehicles", {
            method: "POST",
            body: JSON.stringify(bodyData)
          });
        }
      }

      if (['مبنى', 'مكتب', 'أرض', 'مخزن'].includes(asset.type) && details?.realEstate) {
        const existingEst = realEstates.find(e => e.assetId === asset.id);
        const estateId = existingEst?.id || `EST-${Date.now()}`;
        const bodyData = {
          id: estateId,
          asset_id: asset.id,
          property_name: details.realEstate.propertyName,
          property_type: details.realEstate.propertyType,
          city: details.realEstate.city,
          address: details.realEstate.address,
          area: details.realEstate.area,
          deed_number: details.realEstate.deedNumber,
          ownership_type: details.realEstate.ownershipType,
          acquisition_date: details.realEstate.acquisitionDate,
          purchase_price: details.realEstate.purchasePrice || 0,
          current_estimated_value: details.realEstate.currentEstimatedValue || 0,
          lease_start: details.realEstate.leaseStart || null,
          lease_end: details.realEstate.leaseEnd || null,
          monthly_rent: details.realEstate.monthlyRent || 0,
          status: 'نشط'
        };
        if (existingEst) {
          await fetchAPI(`/real_estates/${estateId}`, {
            method: "PUT",
            body: JSON.stringify(bodyData)
          });
        } else {
          await fetchAPI("/real_estates", {
            method: "POST",
            body: JSON.stringify(bodyData)
          });
        }
      }

      setFixedAssets(prev => prev.map(a => a.id === asset.id ? asset : a));
      if (asset.type === 'سيارة' && details?.vehicle) {
        setVehicles(prev => {
          const exists = prev.some(v => v.assetId === asset.id);
          if (exists) {
            return prev.map(v => v.assetId === asset.id ? { ...v, ...details.vehicle } : v);
          } else {
            return [...prev, { ...details.vehicle, id: `VEH-${Date.now()}`, assetId: asset.id, status: 'نشط' } as Vehicle];
          }
        });
      } else if (['مبنى', 'مكتب', 'أرض', 'مخزن'].includes(asset.type) && details?.realEstate) {
        setRealEstates(prev => {
          const exists = prev.some(e => e.assetId === asset.id);
          if (exists) {
            return prev.map(e => e.assetId === asset.id ? { ...e, ...details.realEstate } : e);
          } else {
            return [...prev, { ...details.realEstate, id: `EST-${Date.now()}`, assetId: asset.id, status: 'نشط' } as RealEstate];
          }
        });
      }
      setDepreciationRecords(prev => prev.map(d => d.assetId === asset.id ? { ...d, assetName: asset.name, purchasePrice: asset.purchasePrice } : d));
      addAuditLog('تعديل أصل', 'FIXED_ASSET', `تعديل الأصل: ${asset.name} (رقم الأصل: ${asset.id})`);
    } catch (err) {
      console.error("Failed to edit asset on backend:", err);
      throw err;
    }
  };

  const disableAsset = async (id: string) => {
    try {
      const asset = fixedAssets.find(a => a.id === id);
      if (!asset) return;
      const newStatus = asset.status === 'نشط' ? 'متوقف' : 'نشط';
      await fetchAPI(`/assets/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          category: asset.category,
          branch: asset.branch,
          location: asset.location,
          purchase_date: asset.purchaseDate,
          purchase_price: asset.purchasePrice,
          currency: asset.currency,
          current_value: asset.currentValue,
          status: newStatus,
          responsible: asset.responsible,
          notes: asset.notes
        })
      });

      setFixedAssets(prev => prev.map(a => {
        if (a.id === id) {
          addAuditLog('تعطيل أصل', 'FIXED_ASSET', `تغيير حالة الأصل رقم ${id} إلى ${newStatus}`);
          return { ...a, status: newStatus as any };
        }
        return a;
      }));
    } catch (err) {
      console.error("Failed to disable asset:", err);
      throw err;
    }
  };

  const sellAsset = async (id: string, price: number, currency: string, buyer: string, notes?: string) => {
    try {
      await fetchAPI(`/assets/${id}/sell`, {
        method: "POST",
        body: JSON.stringify({ price, currency, buyer, notes })
      });
      setFixedAssets(prev => prev.map(a => a.id === id ? { ...a, status: 'مباع' as const, currentValue: 0, notes: `${notes || ''} (بيع للمشتري: ${buyer} بسعر ${price} ${currency})` } : a));
      setVehicles(prev => prev.map(v => v.assetId === id ? { ...v, status: 'مباع' as const } : v));
      setRealEstates(prev => prev.map(e => e.assetId === id ? { ...e, status: 'مباع' as const } : e));
      setDepreciationRecords(prev => prev.map(d => d.assetId === id ? { ...d, currentBookValue: 0 } : d));
      addAuditLog('بيع أصل', 'FIXED_ASSET', `بيع الأصل رقم ${id} للمشتري ${buyer} بقيمة ${price} ${currency}`);
    } catch (err) {
      console.error("Failed to sell asset:", err);
      throw err;
    }
  };

  const transferAsset = async (id: string, toBranch: string, toLocation: string, responsible: string) => {
    try {
      await fetchAPI(`/assets/${id}/transfer`, {
        method: "POST",
        body: JSON.stringify({ to_branch: toBranch, to_location: toLocation, responsible })
      });
      setFixedAssets(prev => prev.map(a => a.id === id ? { ...a, branch: toBranch, location: toLocation, responsible } : a));
      setVehicles(prev => prev.map(v => v.assetId === id ? { ...v, branch: toBranch, driver: responsible } : v));
      setRealEstates(prev => prev.map(e => e.assetId === id ? { ...e, city: toLocation, address: toLocation } : e));
      addAuditLog('نقل أصل', 'FIXED_ASSET', `نقل الأصل رقم ${id} إلى فرع ${toBranch} بمسؤولية ${responsible}`);
    } catch (err) {
      console.error("Failed to transfer asset:", err);
      throw err;
    }
  };

  const addMaintenanceRecord = () => {
    // Unused page components are deleted, keeping empty stub to satisfy the system context structure if needed.
  };

  const editMaintenanceRecord = () => {
    // Unused page components are deleted
  };

  const completeMaintenanceRecord = () => {
    // Unused page components are deleted
  };

  const calculateDepreciation = () => {
    // Unused page components are deleted
  };

  const addAssetDocument = async (doc: Omit<AssetDocument, 'id'>) => {
    try {
      const docId = `DOC-${Date.now()}`;
      await fetchAPI("/asset_documents", {
        method: "POST",
        body: JSON.stringify({
          id: docId,
          asset_id: doc.assetId,
          asset_name: doc.assetName,
          document_type: doc.documentType,
          file_name: doc.fileName,
          expiry_date: doc.expiryDate || null,
          status: doc.status,
          notes: doc.notes || ""
        })
      });
      const newDoc: AssetDocument = {
        ...doc,
        id: docId
      };
      setAssetDocuments(prev => [...prev, newDoc]);
      addAuditLog('رفع مستند', 'DOCUMENT', `رفع مستند جديد من نوع ${doc.documentType} للأصل ${doc.assetName}`);
    } catch (err) {
      console.error("Failed to add document:", err);
      throw err;
    }
  };

  const addVault = async (vault: any) => {
    const initialBals: Record<string, number> = {};
    currencies.forEach(c => {
      if (c.isActive) {
        initialBals[c.code] = 0;
      }
    });
    const newId = vault.id || `v_${Date.now()}`;
    const newV = {
      ...vault,
      id: newId,
      isActive: true,
      balances: initialBals,
      openingBalances: { ...initialBals },
      lastMovement: new Date().toISOString().substring(0, 19).replace('T', ' '),
      manager: currentUser || 'غير معروف'
    };
    try {
      await fetchAPI('/vaults', {
        method: 'POST',
        body: JSON.stringify({
          id: newId,
          name: vault.name,
          type: vault.type,
          branch: vault.branch,
          manager: newV.manager,
          balances: initialBals,
          opening_balances: initialBals
        })
      });
    } catch (err) {
      console.error('Failed to add vault:', err);
    }
    setVaults(prev => [...prev, newV]);
  };

  const updateVaultBalance = async (vaultId: string, currency: string, amount: number) => {
    const v = vaults.find(val => val.id === vaultId);
    if (!v) return;
    const newBals = {
      ...v.balances,
      [currency]: (v.balances[currency as keyof typeof v.balances] as number || 0) + amount
    };
    try {
      await fetchAPI(`/vaults/${vaultId}/balances`, {
        method: 'PATCH',
        body: JSON.stringify({ balances: newBals })
      });
    } catch (err) {
      console.error('Failed to update vault balances:', err);
    }
    setVaults(prev => prev.map(val => val.id === vaultId ? { ...val, balances: newBals } : val));
  };

  const addRate = (rate: any) => addExchangeRate(rate);
  const updateRate = (id: string, buy: number, sell: number) => updateExchangeRate(id, buy, sell);
  const settleDebt = (id: string, amount?: number) => payDebt(id, amount || 0);

  // ── Live Alerts: computed from live data (debts, vehicles, docs, leases, approvals, shifts)
  const liveAlerts = useMemo<SystemNotification[]>(() => {
    const today = new Date();
    const alerts: SystemNotification[] = [];
    const ts = today.toISOString().replace('T', ' ').substring(0, 19);

    const daysDiff = (dateStr: string) =>
      Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);

    // 1. Overdue debts
    debts.forEach(d => {
      if (d.status === 'paid') return;
      if (!d.dueDate) return;
      const diff = daysDiff(d.dueDate);
      if (diff < 0) {
        alerts.push({
          id: `live_debt_overdue_${d.id}`,
          title: 'دين متأخر السداد',
          message: `دين العميل "${d.customerName}" بمبلغ ${d.remainingAmount.toLocaleString()} ${d.currency} متأخر منذ ${Math.abs(diff)} يوم (تاريخ الاستحقاق: ${d.dueDate})`,
          timestamp: ts,
          isRead: false,
          type: 'error',
          role: 'مدير النظام'
        });
      } else if (diff <= 3) {
        alerts.push({
          id: `live_debt_due_soon_${d.id}`,
          title: 'دين يستحق قريباً',
          message: `دين العميل "${d.customerName}" بمبلغ ${d.remainingAmount.toLocaleString()} ${d.currency} يستحق خلال ${diff} يوم (${d.dueDate})`,
          timestamp: ts,
          isRead: false,
          type: 'warning',
          role: 'مدير النظام'
        });
      }
    });

    // 2. Vehicle insurance expiry
    vehicles.forEach(v => {
      if (v.insuranceExpiry) {
        const diff = daysDiff(v.insuranceExpiry);
        if (diff < 0) {
          alerts.push({
            id: `live_veh_ins_exp_${v.id}`,
            title: 'تأمين سيارة منتهي',
            message: `تأمين سيارة "${v.carName}" (${v.plateNumber}) منتهي منذ ${Math.abs(diff)} يوم — يجب التجديد فوراً`,
            timestamp: ts,
            isRead: false,
            type: 'error',
            role: 'مدير النظام'
          });
        } else if (diff <= 30) {
          alerts.push({
            id: `live_veh_ins_soon_${v.id}`,
            title: 'تأمين سيارة قارب على الانتهاء',
            message: `تأمين سيارة "${v.carName}" (${v.plateNumber}) ينتهي خلال ${diff} يوم (${v.insuranceExpiry})`,
            timestamp: ts,
            isRead: false,
            type: 'warning',
            role: 'مدير النظام'
          });
        }
      }
      // Vehicle license expiry
      if (v.licenseExpiry) {
        const diff = daysDiff(v.licenseExpiry);
        if (diff < 0) {
          alerts.push({
            id: `live_veh_lic_exp_${v.id}`,
            title: 'ترخيص سيارة منتهي',
            message: `ترخيص سيارة "${v.carName}" (${v.plateNumber}) منتهي منذ ${Math.abs(diff)} يوم — يجب التجديد فوراً`,
            timestamp: ts,
            isRead: false,
            type: 'error',
            role: 'مدير النظام'
          });
        } else if (diff <= 30) {
          alerts.push({
            id: `live_veh_lic_soon_${v.id}`,
            title: 'ترخيص سيارة قارب على الانتهاء',
            message: `ترخيص سيارة "${v.carName}" ينتهي خلال ${diff} يوم (${v.licenseExpiry})`,
            timestamp: ts,
            isRead: false,
            type: 'warning',
            role: 'مدير النظام'
          });
        }
      }
    });

    // 3. Asset document expiry
    assetDocuments.forEach(doc => {
      if (!doc.expiryDate) return;
      const diff = daysDiff(doc.expiryDate);
      if (diff < 0) {
        alerts.push({
          id: `live_doc_exp_${doc.id}`,
          title: 'مستند أصل منتهي الصلاحية',
          message: `مستند "${doc.documentType}" للأصل "${doc.assetName}" منتهي منذ ${Math.abs(diff)} يوم — يجب التجديد فوراً`,
          timestamp: ts,
          isRead: false,
          type: 'error',
          role: 'مدير النظام'
        });
      } else if (diff <= 30) {
        alerts.push({
          id: `live_doc_soon_${doc.id}`,
          title: 'مستند أصل قارب على الانتهاء',
          message: `مستند "${doc.documentType}" للأصل "${doc.assetName}" ينتهي خلال ${diff} يوم (${doc.expiryDate})`,
          timestamp: ts,
          isRead: false,
          type: 'warning',
          role: 'مدير النظام'
        });
      }
    });

    // 4. Real estate lease expiry
    realEstates.forEach(est => {
      if (est.ownershipType !== 'مؤجر' || !est.leaseEnd) return;
      const diff = daysDiff(est.leaseEnd);
      if (diff < 0) {
        alerts.push({
          id: `live_lease_exp_${est.id}`,
          title: 'عقد إيجار منتهي',
          message: `عقد إيجار "${est.propertyName}" منتهي منذ ${Math.abs(diff)} يوم — يجب التجديد أو الإخلاء`,
          timestamp: ts,
          isRead: false,
          type: 'error',
          role: 'مدير النظام'
        });
      } else if (diff <= 30) {
        alerts.push({
          id: `live_lease_soon_${est.id}`,
          title: 'عقد إيجار قارب على الانتهاء',
          message: `عقد إيجار "${est.propertyName}" ينتهي خلال ${diff} يوم (${est.leaseEnd})`,
          timestamp: ts,
          isRead: false,
          type: 'warning',
          role: 'مدير النظام'
        });
      }
    });

    // 5. Pending approvals (transfers, reversals)
    approvals.filter(a => a.status === 'pending').forEach(a => {
      alerts.push({
        id: `live_approval_${a.id}`,
        title: 'طلب يحتاج موافقة',
        message: `"${a.title}" — ${(a.amount ?? 0).toLocaleString()} ${a.currency ?? ''} — بواسطة: ${a.requestedBy} (${a.timestamp})`,
        timestamp: ts,
        isRead: false,
        type: 'warning',
        role: 'مدير النظام'
      });
    });

    // 6. Shifts awaiting closing approval
    shifts.filter(s => s.status === 'pending_approval').forEach(s => {
      alerts.push({
        id: `live_shift_approval_${s.id}`,
        title: 'وردية تنتظر اعتماد الإقفال',
        message: `وردية الصراف "${s.cashier}" في ${s.vaultName} في انتظار اعتماد مدير النظام`,
        timestamp: ts,
        isRead: false,
        type: 'info',
        role: 'مدير النظام'
      });
      // Also notify the cashier
      alerts.push({
        id: `live_shift_cashier_${s.id}`,
        title: 'في انتظار اعتماد إقفال الصندوق',
        message: `طلب إقفال صندوقك "${s.vaultName}" أُرسل إلى مدير النظام وفي انتظار الاعتماد`,
        timestamp: ts,
        isRead: false,
        type: 'info',
        role: 'صراف',
        user: s.cashier
      });
    });

    return alerts;
  }, [debts, vehicles, assetDocuments, realEstates, approvals, shifts]);

  return (
    <SystemContext.Provider value={{
      isHydrating,
      currentUser, currentRole, currentBranch, currentVaultId, login, logout, canAccessPage,
      notifications, liveAlerts, addNotification, markNotificationAsRead, clearNotifications,
      errorReports, addErrorReport,
      currencies, rates, rateHistories, vaults, banks, bankBranches, bankAccounts,
      customers, debts, shifts, transactions, movements, journalEntries, auditLogs,
      loginLogs, inventoryCounts, reconciliations, approvals, branches, users, rolesPermissions,
      settings, backups,
      
      transfers, addVault, updateVaultBalance, addRate, updateRate, settleDebt,

      fixedAssets, vehicles, realEstates, maintenanceRecords, depreciationRecords, assetDocuments,
      addAsset, editAsset, disableAsset, sellAsset, transferAsset,
      addMaintenanceRecord, editMaintenanceRecord, completeMaintenanceRecord,
      calculateDepreciation, addAssetDocument,
      
      addCurrency, editCurrency, disableCurrency, deleteCurrency,
      addExchangeRate, updateExchangeRate, disableExchangeRate,
      executePOSOperation, executeCustomerOperation, createTransfer, updateTransferStatus,
      addDebt, payDebt, openShift, closeShift, approveShift,
      submitInventoryCount, approveInventoryCount, rejectInventoryCount,
      requestReconciliation, approveReconciliation, requestReversal, approveReversal, rejectReversal,
      
      addBranch, editBranch, disableBranch, deleteBranch,
      addUser, editUser, disableUser, deleteUser,
      addBank, editBank, disableBank, deleteBank,
      addBankBranch, editBankBranch, disableBankBranch, deleteBankBranch,
      addBankAccount, editBankAccount, disableBankAccount, deleteBankAccount,
      addCustomer, editCustomer, disableCustomer, deleteCustomer,
      editVault, disableVault,
      updateRolePermissions, updateSettings, triggerBackup,
      addAuditLog
    }}>
      {children}
    </SystemContext.Provider>
  );
};

export const useSystem = () => {
  const context = useContext(SystemContext);
  if (context === undefined) {
    throw new Error('useSystem must be used within a SystemProvider');
  }
  return context;
};
