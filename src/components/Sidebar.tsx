import {
  LayoutDashboard, ArrowLeftRight, Users, Wallet, Building2,
  TrendingUp, BarChart3, ShieldCheck, RefreshCw, ChevronRight,
  ChevronLeft, CalendarDays, Wrench, Car, Building,
  CreditCard
} from 'lucide-react';
import { PageId } from '../config/permissions';
import { useSystem } from '../context/SystemContext';

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const navSections = [
  {
    title: 'لوحة التحكم',
    items: [
      { id: 'dashboard' as PageId, label: 'لوحة التحكم', icon: LayoutDashboard },
    ]
  },
  {
    title: 'العمل اليومي',
    items: [
      { id: 'exchange-pos' as PageId, label: 'عمليات الصرافة', icon: ArrowLeftRight },
      { id: 'customers' as PageId, label: 'العملاء', icon: Users },
      { id: 'debts' as PageId, label: 'الديون والأقساط', icon: CreditCard },
      { id: 'customer-transactions' as PageId, label: 'إيداع وسحب', icon: Wallet },
      { id: 'transfers' as PageId, label: 'التحويلات', icon: RefreshCw },
      { id: 'daily-closings' as PageId, label: 'صناديق الصرافين', icon: CalendarDays },
    ]
  },
  {
    title: 'الخزنات والأرصدة',
    items: [
      { id: 'vaults' as PageId, label: 'الخزنات', icon: Building2 },
      { id: 'daily-closings' as PageId, label: 'الإقفالات اليومية', icon: CalendarDays },
    ]
  },
  {
    title: 'العملات والبنوك',
    items: [
      { id: 'currencies' as PageId, label: 'العملات وأسعار الصرف', icon: TrendingUp },
      { id: 'banks' as PageId, label: 'البنوك والحسابات البنكية', icon: Building },
    ]
  },
  {
    title: 'الأصول الثابتة',
    items: [
      { id: 'assets' as PageId, label: 'الأصول', icon: Building },
      { id: 'vehicles' as PageId, label: 'السيارات', icon: Car },
      { id: 'real-estate' as PageId, label: 'المباني والعقارات', icon: Building2 },
    ]
  },
  {
    title: 'التقارير',
    items: [
      { id: 'reports-hub' as PageId, label: 'التقارير', icon: BarChart3 },
    ]
  },
  {
    title: 'الإدارة',
    items: [
      { id: 'approvals' as PageId, label: 'الموافقات', icon: ShieldCheck },
      { id: 'admin' as PageId, label: 'الإعدادات', icon: Wrench },
    ]
  },
];

export default function Sidebar({ activePage, onNavigate, collapsed, onToggleCollapse }: SidebarProps) {
  const { currentUser, currentRole, currentBranch, approvals, canAccessPage, settings } = useSystem();
  const pendingCount = approvals.filter(a => a.status === 'pending').length;
  const initials = currentUser ? currentUser.split(' ').map(w => w[0]).slice(0, 2).join('') : '؟';
  const companyName = settings?.companyName || 'نظام الصرافة';
  const logoLetter = companyName.trim().charAt(0) || 'ص';

  return (
    <div className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="logo-wrapper">
          <div className="logo-icon">{logoLetter}</div>
          <span className="logo-text">{companyName}</span>
        </div>
        <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="طي / توسيع القائمة">
          {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-menu">
        {navSections.map(section => {
          const visibleItems = section.items.filter(item => canAccessPage(item.id));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title} className="sidebar-menu-section">
              <div className="sidebar-menu-section-title">{section.title}</div>
              {visibleItems.map(item => {
                const Icon = item.icon;
                const isActive = item.id === 'reports-hub' ? activePage.startsWith('reports') : activePage === item.id;
                return (
                  <button
                    key={`${item.id}-${item.label}`}
                    className={`sidebar-nav-item${isActive ? ' active' : ''}`}
                    onClick={() => onNavigate(item.id)}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="sidebar-nav-item-content">
                      <Icon size={18} />
                      <span className="nav-text">{item.label}</span>
                    </span>
                    {item.id === 'approvals' && pendingCount > 0 && (
                      <span className="nav-badge">{pendingCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="user-avatar sidebar-user-avatar">
          {initials}
        </div>
        <div className="sidebar-footer-text">
          <div className="sidebar-user-name">{currentUser}</div>
          <div className="sidebar-user-meta">{currentRole} · {currentBranch}</div>
        </div>
      </div>
    </div>
  );
}
