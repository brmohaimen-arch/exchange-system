import { useState } from 'react';
import { Wallet, ChevronDown } from 'lucide-react';
import { useSystem } from '../context/SystemContext';

/**
 * Live running-total of what should be in the current cashier's drawer right
 * now (shift.expectedBalances, updated by the backend on every POS operation
 * and reversal — see execute_pos_operation / reverse_transaction in
 * business.py). Previously a cashier had no way to check this mid-shift
 * without jumping to the full close-shift/reconciliation screen.
 */
export default function CashDrawerWidget() {
  const { shifts, currentUser } = useSystem();
  const [open, setOpen] = useState(false);

  const activeShift = shifts.find(s => s.status === 'open' && s.cashier === currentUser);
  if (!activeShift) return null;

  const currencies = Object.keys(activeShift.expectedBalances || {});
  const primaryCurrency = currencies.includes('LYD') ? 'LYD' : currencies[0];
  const primaryValue = primaryCurrency ? (activeShift.expectedBalances[primaryCurrency] || 0) : 0;

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="topbar-action-btn"
        onClick={() => setOpen(o => !o)}
        title="رصيد الصندوق الحالي (تقديري)"
        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', width: 'auto', padding: '0 0.6rem' }}
      >
        <Wallet size={16} />
        {primaryCurrency && <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{primaryValue.toFixed(2)} {primaryCurrency}</span>}
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute', top: '48px', left: 0, minWidth: 240,
              backgroundColor: 'var(--card-bg, #fff)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
              zIndex: 1000, overflow: 'hidden'
            }}
          >
            <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.82rem' }}>
              <Wallet size={14} color="var(--primary)" /> رصيد الصندوق التقديري — {activeShift.vaultName}
            </div>
            <div style={{ padding: '0.5rem 0' }}>
              {currencies.length === 0 && (
                <div style={{ padding: '0.75rem 0.9rem', fontSize: '0.8rem', color: 'var(--gray)' }}>لا توجد أرصدة بعد في هذه الوردية</div>
              )}
              {currencies.map(code => (
                <div key={code} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.9rem', fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--gray)' }}>{code}</span>
                  <strong>{(activeShift.expectedBalances[code] || 0).toFixed(2)}</strong>
                </div>
              ))}
            </div>
            <div style={{ padding: '0.5rem 0.9rem', borderTop: '1px solid var(--border)', fontSize: '0.7rem', color: 'var(--gray)' }}>
              يُحدَّث تلقائياً مع كل عملية — قد يختلف عن الرصيد الفعلي حتى الإقفال والتسوية.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
