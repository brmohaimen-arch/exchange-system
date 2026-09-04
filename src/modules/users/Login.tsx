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
    <main className="login-bg">
      <div className="login-ambient login-ambient-one" />
      <div className="login-ambient login-ambient-two" />
      <section className="login-card">
        <div className="login-brand-panel">
          <div className="login-brand-mark"><Landmark size={22} /></div>
          <span className="login-brand-name">صرافة أفق</span>
          <span className="login-brand-kicker">منصة العمليات المالية</span>
          <div className="login-orbit"><span>د</span><span>€</span><span>$</span></div>
          <div className="login-brand-copy">
            <span className="dashboard-eyebrow">ثقة · دقة · سيولة</span>
            <h1>حرّك أموالك<br /><em>بثقة أكبر.</em></h1>
            <p>مساحة عمل موحّدة لإدارة الصناديق والعملات والحسابات البنكية في لحظة واحدة.</p>
          </div>
          <div className="login-trust-line"><span className="login-live-dot" /> النظام التشغيلي آمن ومتاح الآن</div>
        </div>

        <div className="login-form-panel">
          <div className="login-form-heading">
            <span className="login-overline">بوابة الموظفين</span>
            <h2>مرحباً بعودتك</h2>
            <p>سجّل الدخول لمتابعة عمليات الصرافة اليومية.</p>
          </div>
          <div className="login-form-fields">
            <div className="form-group">
              <label className="form-label">اسم المستخدم</label>
              <input className="form-input" type="text" placeholder="أدخل اسم المستخدم" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && handleLogin()} />
            </div>
            <div className="form-group">
              <label className="form-label">كلمة المرور</label>
              <div className="login-password-wrap">
                <input className="form-input" type={showPw ? 'text' : 'password'} placeholder="أدخل كلمة المرور" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && handleLogin()} />
                <button className="login-password-toggle" type="button" aria-label={showPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShowPw(s => !s)}>{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </div>
            <button className="btn btn-primary login-submit" onClick={handleLogin} disabled={loading}><LogIn size={17} />{loading ? 'جاري التحقق...' : 'الدخول إلى مساحة العمل'}</button>
          </div>
          <div className="login-form-footer"><span>الوصول مخصص للموظفين المعتمدين</span><span className="login-lock">محمي</span></div>
        </div>
      </section>
    </main>
  );
}
