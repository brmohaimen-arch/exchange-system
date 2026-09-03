import { useState, useEffect } from 'react';
import { useSystem } from './context/SystemContext';
import Login from './modules/users/Login';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Toast from './components/Toast';
import RoleGuard from './components/RoleGuard';
import LoadingScreen from './components/LoadingScreen';
import Dashboard from './modules/dashboard/Dashboard';
import ExchangePOS from './modules/exchange/ExchangePOS';
import BuyCurrency from './modules/exchange/BuyCurrency';
import SellCurrency from './modules/exchange/SellCurrency';
import CustomerTransactions from './modules/customers/CustomerTransactions';
import Transfers from './modules/exchange/Transfers';
import Vaults from './modules/vaults/Vaults';
import BanksManagement from './modules/banks/BanksManagement';
import CustomersManagement from './modules/customers/CustomersManagement';
import DebtManagement from './modules/customers/DebtManagement';
import Currencies from './modules/settings/Currencies';
import AccountingLedger from './modules/reports/AccountingLedger';
import ReportsSection from './modules/reports/ReportsSection';
import ReportsHub from './modules/reports/ReportsHub';
import AdminPanel from './modules/users/AdminPanel';
import DailyClosings from './modules/vaults/DailyClosings';
import FixedAssetsDashboard from './modules/assets/FixedAssetsDashboard';
import Assets from './modules/assets/Assets';
import Vehicles from './modules/assets/Vehicles';
import RealEstate from './modules/assets/RealEstate';
import AssetDocuments from './modules/assets/AssetDocuments';
import AssetReports from './modules/assets/AssetReports';
import { ShieldAlert } from 'lucide-react';
import { PageId, PAGE_PERMISSIONS } from './config/permissions';

export interface ToastMessage {
  id: string;
  type: 'success' | 'danger' | 'warning' | 'info';
  message: string;
}

function App() {
  const { currentUser, logout, canAccessPage, isHydrating } = useSystem();
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [timeoutCountdown, setTimeoutCountdown] = useState(30);

  const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const WARNING_MS = TIMEOUT_MS - 30 * 1000; // 29 minutes and 30 seconds

  const showToast = (type: ToastMessage['type'], message: string) => {
    const id = `toast_${Date.now()}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // 30-min auto-logout inactivity timer with a warning modal
  useEffect(() => {
    if (!currentUser) return;

    let warningTimer: any;
    let countdownTimer: any;
    let finalLogoutTimer: any;

    const resetTimer = () => {
      setShowTimeoutWarning(false);
      setTimeoutCountdown(30);

      if (warningTimer) clearTimeout(warningTimer);
      if (countdownTimer) clearInterval(countdownTimer);
      if (finalLogoutTimer) clearTimeout(finalLogoutTimer);

      warningTimer = setTimeout(() => {
        setShowTimeoutWarning(true);
        let count = 30;
        countdownTimer = setInterval(() => {
          count -= 1;
          setTimeoutCountdown(count);
          if (count <= 0) {
            clearInterval(countdownTimer);
          }
        }, 1000);
      }, WARNING_MS);

      finalLogoutTimer = setTimeout(() => {
        logout();
        showToast('warning', 'تم تسجيل خروجك تلقائياً بسبب عدم النشاط لحماية بياناتك المالية');
      }, TIMEOUT_MS);
    };

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetTimer));

    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (warningTimer) clearTimeout(warningTimer);
      if (countdownTimer) clearInterval(countdownTimer);
      if (finalLogoutTimer) clearTimeout(finalLogoutTimer);
    };
  }, [currentUser]);

  if (isHydrating) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    return <Login showToast={showToast} />;
  }

  const renderPage = () => {
    const props = { showToast };

    if (!canAccessPage(activePage)) {
      const required = PAGE_PERMISSIONS[activePage] || [];
      return (
        <div className="page-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1.5rem', textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'var(--danger-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--danger)', marginBottom: '0.5rem'
          }}>
            <ShieldAlert size={40} />
          </div>
          <h2 style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.4rem' }}>وصول غير مصرح به</h2>
          <p style={{ color: 'var(--gray)', fontSize: '0.95rem', maxWidth: 450, lineHeight: 1.6 }}>
            ليس لديك صلاحية كافية لعرض هذه الصفحة. تقتصر هذه الصفحة على المستخدمين الذين لديهم صلاحية:
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {required.map(p => (
              <span key={p} className="badge pending" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', border: '1px solid var(--warning)' }}>
                {p}
              </span>
            ))}
          </div>
        </div>
      );
    }

    switch (activePage) {
      case 'dashboard': return <Dashboard onNavigate={setActivePage} {...props} />;
      case 'exchange-pos': return <ExchangePOS {...props} />;
      case 'buy-currency': return <BuyCurrency {...props} />;
      case 'sell-currency': return <SellCurrency {...props} />;
      case 'customer-transactions': return <CustomerTransactions {...props} />;
      case 'transfers': return <Transfers {...props} />;
      case 'vaults': return <Vaults {...props} />;
      case 'banks': return <BanksManagement {...props} />;
      case 'customers': return <CustomersManagement {...props} />;
      case 'debts': return <DebtManagement {...props} />;
      case 'currencies': return <Currencies {...props} />;
      case 'accounting': return <AccountingLedger {...props} />;
      case 'reports-hub': return <ReportsHub onNavigate={setActivePage} />;
      case 'reports-daily': return <ReportsSection {...props} section="daily" />;
      case 'reports-profit': return <ReportsSection {...props} section="profit" />;
      case 'reports-vaults': return <ReportsSection {...props} section="vaults" />;
      case 'reports-customers': return <ReportsSection {...props} section="customers" />;
      case 'reports-debts': return <ReportsSection {...props} section="debts" />;
      case 'reports-audit': return <ReportsSection {...props} section="audit" />;
      case 'daily-closings': return <DailyClosings {...props} />;
      case 'fixed-assets-dashboard': return <FixedAssetsDashboard {...props} />;
      case 'assets': return <Assets {...props} />;
      case 'vehicles': return <Vehicles {...props} />;
      case 'real-estate': return <RealEstate {...props} />;
      case 'asset-documents': return <AssetDocuments {...props} />;
      case 'asset-reports': return <AssetReports {...props} />;
      case 'admin':
        return (
          <RoleGuard allowedRoles={['مدير النظام']}>
            <AdminPanel mode="settings" {...props} />
          </RoleGuard>
        );
      case 'approvals':
        return (
          <AdminPanel mode="approvals" {...props} />
        );
      default: return <Dashboard onNavigate={setActivePage} {...props} />;
    }
  };

  return (
    <div className={`app-container${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
      />
      <div className="main-panel">
        <Topbar showToast={showToast} onNavigate={setActivePage} />
        {renderPage()}
      </div>
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* Premium Inactivity Warning Modal */}
      {showTimeoutWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(6px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="section-card" style={{ width: '100%', maxWidth: 400, border: '2px solid var(--warning)', animation: 'scale-up 0.25s ease-out', textAlign: 'center' }}>
            <div className="section-card-header" style={{ justifyContent: 'center', borderBottom: 'none' }}>
              <div className="section-card-title" style={{ color: 'var(--warning)', gap: '0.5rem', fontSize: '1.3rem' }}>
                تنبيه انتهاء الجلسة
              </div>
            </div>
            <div className="section-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <p style={{ fontSize: '0.95rem', color: 'var(--foreground)', lineHeight: 1.6 }}>
                لقد كنت غير نشط لفترة طويلة. لحماية حسابك وبياناتك المالية، سيتم تسجيل خروجك تلقائياً خلال:
              </p>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--danger)', margin: '0.5rem 0' }}>
                {timeoutCountdown} ثانية
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button className="btn btn-secondary" onClick={() => { logout(); setShowTimeoutWarning(false); }}>
                  تسجيل الخروج الآن
                </button>
                <button className="btn btn-primary" onClick={() => {
                  window.dispatchEvent(new Event('mousemove'));
                }}>
                  البقاء متصلاً
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
