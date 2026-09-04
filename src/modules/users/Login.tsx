import { useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { LogIn, Landmark, Eye, EyeOff, User, KeyRound, ShieldCheck, Lock, ArrowLeftRight, Banknote } from 'lucide-react';

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
      <div className="login-card">
        {/* Left: brand + icon collage */}
        <div className="login-illustration-panel">
          <div className="login-brand-row">
            <div className="login-brand-mark"><Landmark size={18} /></div>
            <span className="login-brand-name">{settings?.companyName || 'نظام الصرافة'}</span>
          </div>

          <div className="login-illustration">
            <div className="login-illustration-glow" />
            <div className="login-orbit-badge" style={{ width: 88, height: 88, top: 88, right: 100, transform: 'rotate(-5deg)' }}>
              <Landmark size={38} color="#5B93F8" />
            </div>
            <div className="login-orbit-badge" style={{ width: 60, height: 60, top: 8, right: 16, transform: 'rotate(8deg)' }}>
              <ShieldCheck size={26} color="#33D6E0" />
            </div>
            <div className="login-orbit-badge" style={{ width: 52, height: 52, top: 14, right: 190, transform: 'rotate(-10deg)' }}>
              <Lock size={22} color="#FFFFFF" />
            </div>
            <div className="login-orbit-badge" style={{ width: 58, height: 58, top: 178, right: 195, transform: 'rotate(6deg)' }}>
              <ArrowLeftRight size={24} color="#5B93F8" />
            </div>
            <div className="login-orbit-badge" style={{ width: 54, height: 54, top: 186, right: 24, transform: 'rotate(-8deg)' }}>
              <Banknote size={22} color="#33D6E0" />
            </div>
            <div className="login-orbit-badge" style={{ width: 42, height: 42, top: 130, right: 4, transform: 'rotate(12deg)' }}>
              <KeyRound size={18} color="#FFFFFF" />
            </div>
          </div>
        </div>

        {/* Right: login form */}
        <div className="login-form-panel">
          <div className="login-title-subtitle">
            <div className="login-main-title">تسجيل الدخول</div>
            <div className="login-sub-title">أدخل بيانات حسابك للوصول إلى النظام</div>
          </div>

          <div className="login-input-group">
            <div className="login-input-wrap">
              <input
                className="login-input" type="text" placeholder="اسم المستخدم"
                value={username} onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              <span className="login-input-icon"><User size={14} /></span>
            </div>
            <div className="login-input-wrap">
              <input
                className="login-input" type={showPw ? 'text' : 'password'}
                placeholder="كلمة المرور" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={{ paddingLeft: '2.75rem' }}
              />
              <span className="login-input-icon"><KeyRound size={14} /></span>
              <button className="login-input-toggle" onClick={() => setShowPw(s => !s)} type="button">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button className="login-submit-btn" onClick={handleLogin} disabled={loading}>
            <LogIn size={18} />
            {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
          </button>
        </div>
      </div>
    </div>
  );
}
