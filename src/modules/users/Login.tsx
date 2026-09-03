import { useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { LogIn, Landmark, Eye, EyeOff } from 'lucide-react';

interface LoginProps {
  showToast: (type: ToastMessage['type'], message: string) => void;
}

export default function Login({ showToast }: LoginProps) {
  const { login, settings } = useSystem();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim()) { showToast('danger', 'يرجى إدخال اسم المستخدم'); return; }
    if (!password) { showToast('danger', 'يرجى إدخال كلمة المرور'); return; }

    setLoading(true);
    const res = await login(username.trim(), password);
    setLoading(false);
    if (!res.success) {
      showToast('danger', res.error || 'فشل تسجيل الدخول');
    } else {
      showToast('success', `مرحباً بك في ${settings?.companyName || 'نظام الصرافة'}`);
    }
  };

  return (
    <div className="login-bg">
      {/* Decorative circles */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute', borderRadius: '50%',
            background: `rgba(173,138,61,${0.025 + i * 0.008})`,
            width: `${300 + i * 120}px`, height: `${300 + i * 120}px`,
            top: `${10 + i * 15}%`, right: `${-5 + i * 10}%`,
          }} />
        ))}
      </div>

      <div className="login-card">
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(150deg, var(--gold) 0%, #8A6B26 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(173,138,61,0.3)'
          }}>
            <Landmark size={32} color="var(--primary)" />
          </div>
          <div className="login-title-subtitle">
            <div className="login-main-title">نظام إدارة الصرافة</div>
            <div className="login-sub-title">الخزنات والحسابات البنكية — للموظفين فقط</div>
          </div>
        </div>

        {/* Manual Login */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">اسم المستخدم</label>
            <input
              className="form-input" type="text" placeholder="أدخل اسم المستخدم"
              value={username} onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <div className="form-group">
            <label className="form-label">كلمة المرور</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input" type={showPw ? 'text' : 'password'}
                placeholder="أدخل كلمة المرور" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={{ paddingLeft: '2.5rem' }}
              />
              <button onClick={() => setShowPw(s => !s)} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button
            className="btn btn-primary" onClick={handleLogin} disabled={loading}
            style={{ marginTop: '0.5rem', fontSize: '1rem', padding: '0.85rem' }}
          >
            <LogIn size={18} />
            {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
          </button>
        </div>
      </div>
    </div>
  );
}
