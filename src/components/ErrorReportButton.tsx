import { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { LifeBuoy, X, Send } from 'lucide-react';

interface ErrorReportButtonProps {
  currentPage: string;
  defaultAction?: string;
  showToast: (type: 'success' | 'danger' | 'warning' | 'info', msg: string) => void;
}

export default function ErrorReportButton({ currentPage, defaultAction = '', showToast }: ErrorReportButtonProps) {
  const { addErrorReport } = useSystem();
  const [isOpen, setIsOpen] = useState(false);
  const [action, setAction] = useState(defaultAction);
  const [errMsg, setErrMsg] = useState('');

  const handleSubmit = () => {
    if (!action.trim() || !errMsg.trim()) {
      showToast('danger', 'يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    addErrorReport(currentPage, action.trim(), errMsg.trim());
    showToast('success', 'تم إرسال تقرير الخطأ بنجاح للدراسة والمتابعة');
    setErrMsg('');
    setAction(defaultAction);
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="btn btn-secondary"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.8rem',
          padding: '0.4rem 0.8rem',
          borderColor: 'var(--danger)',
          color: 'var(--danger)',
        }}
        title="إرسال تقرير خطأ"
      >
        <LifeBuoy size={14} color="var(--danger)" />
        <span>إرسال تقرير خطأ</span>
      </button>

      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="section-card" style={{ width: '100%', maxWidth: 450, border: '2px solid var(--danger)', animation: 'scale-up 0.25s ease-out' }}>
            <div className="section-card-header" style={{ borderBottom: 'none', paddingBottom: '0.5rem' }}>
              <div className="section-card-title" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LifeBuoy size={20} color="var(--danger)" />
                <span>الإبلاغ عن مشكلة أو خطأ بالنظام</span>
              </div>
              <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}><X size={20} /></button>
            </div>
            <div className="section-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.5rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                سيقوم هذا التقرير بحفظ اسم الصفحة والمستخدم مع تفاصيل المشكلة. لن يتم إرسال أي تفاصيل مالية أو سرية.
              </p>
              
              <div className="form-group">
                <label className="form-label">اسم الصفحة الحالية</label>
                <input className="form-input" type="text" value={currentPage} disabled style={{ backgroundColor: 'var(--border)' }} />
              </div>

              <div className="form-group">
                <label className="form-label">الإجراء الذي حاولت القيام به *</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="مثال: حفظ فاتورة شراء، إغلاق وردية"
                  value={action}
                  onChange={e => setAction(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">وصف الخطأ أو رسالة المشكلة بالتفصيل *</label>
                <textarea
                  className="form-input"
                  placeholder="أدخل رسالة الخطأ أو صِف المشكلة التي ظهرت لك..."
                  rows={4}
                  value={errMsg}
                  onChange={e => setErrMsg(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setIsOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <X size={15} />إلغاء
                </button>
                <button className="btn btn-danger" onClick={handleSubmit} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Send size={15} />إرسال التقرير
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
