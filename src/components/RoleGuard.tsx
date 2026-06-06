import { ShieldAlert } from 'lucide-react';
import { useSystem } from '../context/SystemContext';

interface RoleGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export default function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { currentRole } = useSystem();

  if (!allowedRoles.includes(currentRole)) {
    return (
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem', textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'var(--danger-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--danger)', marginBottom: '0.5rem'
        }}>
          <ShieldAlert size={40} />
        </div>
        <h2 style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.4rem' }}>وصول غير مصرح به</h2>
        <p style={{ color: 'var(--gray)', fontSize: '0.95rem', maxWidth: 400, lineHeight: 1.6 }}>
          ليس لديك صلاحية كافية لعرض هذه الصفحة. تقتصر هذه الصفحة على المستخدمين ذوي صلاحية: {allowedRoles.join(' أو ')}.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
