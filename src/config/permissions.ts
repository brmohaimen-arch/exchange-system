export type PageId =
  | 'dashboard'
  | 'exchange-pos'
  | 'buy-currency'
  | 'sell-currency'
  | 'customer-transactions'
  | 'transfers'
  | 'vaults'
  | 'banks'
  | 'customers'
  | 'debts'
  | 'currencies'
  | 'accounting'
  | 'reports'
  | 'daily-closings'
  | 'admin'
  | 'approvals'
  | 'fixed-assets-dashboard'
  | 'assets'
  | 'vehicles'
  | 'real-estate'
  | 'asset-documents'
  | 'asset-reports';

export const PAGE_PERMISSIONS: Record<PageId, string[]> = {
  'dashboard':              [],   // everyone

  // Daily operations
  'exchange-pos':           ['تنفيذ بيع عملة', 'تنفيذ شراء عملة'],
  'buy-currency':           ['تنفيذ شراء عملة'],
  'sell-currency':          ['تنفيذ بيع عملة'],
  'customers':              ['إدارة العملاء'],
  'debts':                  ['إدارة الديون'],
  'customer-transactions':  ['إدارة الديون'],
  'transfers':              ['تحويل بين الخزنات', 'الموافقة على التحويلات'],
  'daily-closings':         ['فتح وردية', 'إغلاق وردية', 'اعتماد الإقفالات'],

  // Vaults & Banks
  'vaults':                 ['إدارة الخزنات'],
  'currencies':             ['إدارة العملات', 'تعديل أسعار الصرف'],
  'banks':                  ['إدارة البنوك'],

  // Reports
  'reports':                ['رؤية التقارير'],
  'accounting':             ['رؤية سجل العمليات'],

  // Fixed assets
  'fixed-assets-dashboard': ['إدارة الأصول'],
  'assets':                 ['إدارة الأصول'],
  'vehicles':               ['إدارة الأصول'],
  'real-estate':            ['إدارة الأصول'],
  'asset-documents':        ['إدارة الأصول'],
  'asset-reports':          ['إدارة الأصول'],

  // Admin panel
  'admin':                  ['إدارة المستخدمين', 'إدارة الفروع', 'إدارة الإعدادات'],
  'approvals':              [],
};

/** All available permission strings in the system */
export const ALL_PERMISSIONS: string[] = [
  // Operations
  'تنفيذ بيع عملة',
  'تنفيذ شراء عملة',
  'تحويل بين الخزنات',
  'الموافقة على التحويلات',
  'إلغاء عملية',
  'إنشاء عملية عكسية',

  // Customers & Debts
  'إدارة العملاء',
  'إدارة الديون',

  // Vaults & Shifts
  'إدارة الخزنات',
  'فتح وردية',
  'إغلاق وردية',
  'اعتماد الإقفالات',

  // Currencies & Banks
  'إدارة العملات',
  'تعديل أسعار الصرف',
  'إدارة البنوك',

  // Reports
  'رؤية التقارير',
  'رؤية سجل العمليات',
  'رؤية الأرباح',

  // Fixed Assets
  'إدارة الأصول',

  // Administration
  'إدارة المستخدمين',
  'إدارة الفروع',
  'إدارة الإعدادات',
];
