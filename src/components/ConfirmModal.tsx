import { AlertTriangle, Check, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  onConfirm,
  onCancel,
  danger = false
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="section-card" style={{ width: '100%', maxWidth: 420, border: `2px solid ${danger ? 'var(--danger)' : 'var(--accent)'}`, animation: 'scale-up 0.25s ease-out' }}>
        <div className="section-card-header" style={{ borderBottom: 'none', paddingBottom: '0.5rem' }}>
          <div className="section-card-title" style={{ color: danger ? 'var(--danger)' : 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={20} color={danger ? 'var(--danger)' : 'var(--accent)'} />
            <span>{title}</span>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}><X size={20} /></button>
        </div>
        <div className="section-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '0.5rem' }}>
          <p style={{ fontSize: '0.92rem', color: 'var(--foreground)', lineHeight: 1.6 }}>{message}</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <X size={15} />{cancelLabel}
            </button>
            <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Check size={15} />{confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
