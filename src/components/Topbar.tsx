import { useState, useEffect } from 'react';
import { Bell, LogOut, Clock, MapPin, Search } from 'lucide-react';
import { useSystem } from '../context/SystemContext';
import { ToastMessage } from '../App';
import NotificationCenter from './NotificationCenter';
import GlobalSearch from './GlobalSearch';
import CashDrawerWidget from './CashDrawerWidget';
import { PageId } from '../config/permissions';

interface TopbarProps {
  showToast: (type: ToastMessage['type'], message: string) => void;
  onNavigate: (page: PageId) => void;
}

export default function Topbar({ showToast, onNavigate }: TopbarProps) {
  const { currentUser, currentRole, currentBranch, logout, notifications, liveAlerts } = useSystem();
  const [now, setNow] = useState(new Date());
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Global Ctrl+K / Cmd+K shortcut to open the quick search from anywhere
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleLogout = () => {
    logout();
    showToast('info', 'تم تسجيل الخروج بنجاح');
  };

  const dateStr = now.toLocaleDateString('ar-LY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' });
  const initials = currentUser ? currentUser.split(' ').map(w => w[0]).slice(0, 2).join('') : '؟';

  // Stored unread + all live alerts for this role/user
  const storedUnread = notifications.filter(n => (!n.role || n.role === currentRole) && !n.isRead).length;
  const liveCount = liveAlerts.filter(n => {
    const roleMatch = !n.role || n.role === currentRole;
    const userMatch = !n.user || n.user === currentUser;
    return roleMatch && userMatch;
  }).length;
  const unreadCount = storedUnread + liveCount;

  return (
    <div className="topbar">
      {/* Right side: branch + date */}
      <div className="topbar-right">
        <div className="branch-selector-wrapper">
          <MapPin size={16} color="var(--accent)" />
          <span>{currentBranch}</span>
        </div>
        <div className="topbar-divider" />
        <div className="topbar-datetime">
          <Clock size={14} />
          <span>{dateStr} — {timeStr}</span>
        </div>
      </div>

      {/* Left side: actions + user */}
      <div className="topbar-left">
        <CashDrawerWidget />
        <button
          className="topbar-action-btn"
          onClick={() => setShowSearch(true)}
          title="بحث سريع (Ctrl+K)"
        >
          <Search size={18} />
        </button>
        <div className="topbar-actions" style={{ position: 'relative' }}>
          <button
            className="topbar-action-btn"
            onClick={() => setShowNotifications(s => !s)}
            title={`الإشعارات (${unreadCount} غير مقروء)`}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-5px',
                  background: 'var(--danger)',
                  color: 'white',
                  fontSize: '0.65rem',
                  fontWeight: 'bold',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid white'
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>
          <NotificationCenter isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
        </div>
        <div className="topbar-divider" />
        <div className="user-profile-widget">
          <div className="user-avatar">{initials}</div>
          <div className="user-details">
            <span className="user-display-name">{currentUser}</span>
            <span className="user-role-badge">{currentRole}</span>
          </div>
        </div>
        <div className="topbar-divider" />
        <button className="logout-btn" onClick={handleLogout} title="تسجيل الخروج">
          <LogOut size={18} />
        </button>
      </div>
      <GlobalSearch isOpen={showSearch} onClose={() => setShowSearch(false)} onNavigate={onNavigate} />
    </div>
  );
}
