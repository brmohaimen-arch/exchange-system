import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { ToastMessage } from '../App';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  if (toasts.length === 0) return null;

  const icons = {
    success: <CheckCircle size={18} color="var(--success)" />,
    danger: <XCircle size={18} color="var(--danger)" />,
    warning: <AlertTriangle size={18} color="var(--warning)" />,
    info: <Info size={18} color="var(--info)" />,
  };

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          {icons[t.type]}
          <span style={{ flex: 1, fontSize: '0.9rem' }}>{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', display: 'flex', alignItems: 'center' }}
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
