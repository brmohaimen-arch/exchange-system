import {
  LayoutDashboard, ArrowLeftRight, Users, Wallet, Building2,
  TrendingUp, BookOpen, BarChart3, ShieldCheck, RefreshCw, ChevronRight,
  ChevronLeft, CalendarDays, Wrench, Car, Building, FileText,
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
      { id: 'currencies' as PageId, label: 'العملات', icon: TrendingUp },
      { id: 'currencies' as PageId, label: 'أسعار الصرف', icon: TrendingUp },
      { id: 'banks' as PageId, label: 'البنوك', icon: Building },
      { id: 'banks' as PageId, label: 'الحسابات البنكية', icon: BookOpen },
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
      { id: 'reports' as PageId, label: 'تقارير الخزنات', icon: BarChart3 },
      { id: 'reports' as PageId, label: 'تقارير البيع والشراء', icon: BarChart3 },
      { id: 'reports' as PageId, label: 'تقارير البنوك', icon: BarChart3 },
      { id: 'reports' as PageId, label: 'تقارير الديون', icon: BarChart3 },
      { id: 'asset-reports' as PageId, label: 'تقارير الأصول', icon: BarChart3 },
      { id: 'accounting' as PageId, label: 'سجل العمليات', icon: FileText },
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
  const { currentUser, currentRole, currentBranch, approvals, canAccessPage } = useSystem();
  const pendingCount = approvals.filter(a => a.status === 'pending').length;
  const initials = currentUser ? currentUser.split(' ').map(w => w[0]).slice(0, 2).join('') : '؟';

  return (
    <div className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="logo-wrapper">
          <div className="logo-icon">ص</div>
          <span className="logo-text">نظام الصرافة</span>
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
                const isActive = activePage === item.id;
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
                    {item.id === 'admin' && pendingCount > 0 && (
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
        <div className="user-avatar" style={{ width: 36, height: 36, fontSize: '0.85rem', flexShrink: 0 }}>
          {initials}
        </div>
        <div className="sidebar-footer-text" style={{ overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentUser}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
            {currentRole} · {currentBranch}
          </div>
        </div>
      </div>
    </div>
  );
}
