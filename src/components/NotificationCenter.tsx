import { Bell, Check, Trash2, X, AlertCircle, AlertTriangle, Info, CheckCircle2, Zap } from 'lucide-react';
import { useSystem, SystemNotification } from '../context/SystemContext';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const { notifications, liveAlerts, markNotificationAsRead, clearNotifications, currentRole, currentUser } = useSystem();

  if (!isOpen) return null;

  // Filter stored notifications by role
  const storedFiltered = notifications.filter(
    n => !n.role || n.role === currentRole
  );

  // Filter live alerts by role and user
  const liveFiltered = liveAlerts.filter(n => {
    const roleMatch = !n.role || n.role === currentRole;
    const userMatch = !n.user || n.user === currentUser;
    return roleMatch && userMatch;
  });

  // Combine: live alerts first (always unread), then stored notifications
  const combined: (SystemNotification & { isLive?: boolean })[] = [
    ...liveFiltered.map(n => ({ ...n, isLive: true })),
    ...storedFiltered,
  ];

  // Sort: errors first, then warnings, then others
  const typePriority = (type: string) => {
    if (type === 'error') return 0;
    if (type === 'warning') return 1;
    if (type === 'info') return 2;
    return 3;
  };
  combined.sort((a, b) => {
    if (!a.isRead && b.isRead) return -1;
    if (a.isRead && !b.isRead) return 1;
    return typePriority(a.type) - typePriority(b.type);
  });

  const totalUnread = liveFiltered.length + storedFiltered.filter(n => !n.isRead).length;

  const getIcon = (type: SystemNotification['type']) => {
    switch (type) {
      case 'success': return <CheckCircle2 size={15} color="var(--success)" />;
      case 'error':   return <AlertCircle size={15} color="var(--danger)" />;
      case 'warning': return <AlertTriangle size={15} color="var(--warning)" />;
      default:        return <Info size={15} color="var(--info, #1652f0)" />;
    }
  };

  const getBorderColor = (type: SystemNotification['type']) => {
    switch (type) {
      case 'error':   return 'var(--danger)';
      case 'warning': return 'var(--warning)';
      case 'success': return 'var(--success)';
      default:        return 'var(--primary)';
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '60px',
        left: '1rem',
        width: '400px',
        maxWidth: 'calc(100vw - 2rem)',
        backgroundColor: 'var(--card-bg, #fff)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        zIndex: 1000,
        overflow: 'hidden',
        animation: 'scale-up 0.2s ease-out',
        direction: 'rtl',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '0.875rem 1rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--sidebar-hover)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, color: 'var(--primary)', fontSize: '0.92rem' }}>
          <Bell size={17} />
          <span>مركز الإشعارات</span>
          {totalUnread > 0 && (
            <span style={{
              background: 'var(--danger)',
              color: '#fff',
              fontSize: '0.68rem',
              fontWeight: 800,
              borderRadius: 20,
              padding: '0.1rem 0.45rem',
              lineHeight: 1.4,
            }}>
              {totalUnread}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {storedFiltered.length > 0 && (
            <button
              onClick={clearNotifications}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--danger)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.25rem 0.4rem',
                borderRadius: 6,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              title="مسح الإشعارات المحفوظة"
            >
              <Trash2 size={13} />
              <span>مسح</span>
            </button>
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', padding: '0.25rem', borderRadius: 6 }}
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {liveFiltered.length > 0 && (
        <div style={{
          padding: '0.5rem 1rem',
          background: 'rgba(239,68,68,0.05)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.75rem',
          color: 'var(--danger)',
          fontWeight: 700,
        }}>
          <Zap size={13} />
          <span>{liveFiltered.length} تنبيه حي متولّد تلقائياً من بيانات النظام</span>
        </div>
      )}

      {/* Body */}
      <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
        {combined.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--gray)' }}>
            <Bell size={34} style={{ opacity: 0.2, marginBottom: '0.6rem' }} />
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>لا توجد إشعارات أو تنبيهات حالياً</div>
            <div style={{ fontSize: '0.72rem', marginTop: '0.3rem', opacity: 0.7 }}>ستظهر هنا تلقائياً عند وجود استحقاقات أو طلبات</div>
          </div>
        ) : (
          combined.map((n, idx) => (
            <div
              key={n.id + idx}
              style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--border)',
                backgroundColor: n.isRead && !n.isLive ? 'transparent' : 'rgba(59,130,246,0.03)',
                borderRight: `3px solid ${getBorderColor(n.type)}`,
                display: 'flex',
                gap: '0.65rem',
                transition: 'background 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => { if (!n.isRead) e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = n.isRead && !n.isLive ? 'transparent' : 'rgba(59,130,246,0.03)'; }}
            >
              {/* Type icon */}
              <div style={{ marginTop: '0.1rem', flexShrink: 0 }}>{getIcon(n.type)}</div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.83rem', color: 'var(--foreground)' }}>
                    {n.title}
                  </span>
                  {(n as any).isLive && (
                    <span style={{
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      background: 'rgba(59,130,246,0.1)',
                      color: 'var(--primary)',
                      padding: '0.05rem 0.35rem',
                      borderRadius: 4,
                      border: '1px solid rgba(59,130,246,0.2)',
                    }}>
                      تلقائي
                    </span>
                  )}
                  {!n.isRead && !((n as any).isLive) && (
                    <span style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      flexShrink: 0,
                      display: 'inline-block',
                    }} />
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--gray)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                  {n.message}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--gray)', opacity: 0.7 }}>
                  {(n as any).isLive ? 'تنبيه حي — الآن' : n.timestamp}
                </div>
              </div>

              {/* Mark as read (only for stored) */}
              {!n.isRead && !(n as any).isLive && (
                <button
                  onClick={() => markNotificationAsRead(n.id)}
                  style={{
                    alignSelf: 'center',
                    background: 'rgba(34,197,94,0.1)',
                    border: '1px solid rgba(34,197,94,0.25)',
                    color: 'var(--success)',
                    padding: '0.25rem',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'background 0.15s',
                  }}
                  title="تحديد كمقروء"
                >
                  <Check size={11} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {combined.length > 0 && (
        <div style={{
          padding: '0.5rem 1rem',
          borderTop: '1px solid var(--border)',
          background: 'var(--sidebar-hover)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.72rem',
          color: 'var(--gray)',
        }}>
          <span>{combined.length} إشعار إجمالي ({liveFiltered.length} تلقائي + {storedFiltered.length} محفوظ)</span>
          <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
            {totalUnread} غير مقروء
          </span>
        </div>
      )}
    </div>
  );
}
