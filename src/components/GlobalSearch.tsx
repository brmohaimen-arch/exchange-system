import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Users, ArrowLeftRight, Building2, Landmark } from 'lucide-react';
import { useSystem } from '../context/SystemContext';
import { PageId } from '../config/permissions';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
}

interface SearchResult {
  key: string;
  category: string;
  icon: typeof Users;
  primary: string;
  secondary: string;
  page: PageId;
}

/**
 * Ctrl+K quick search across data already loaded in SystemContext — no backend
 * round trip needed. The app had zero search of any kind before this; jumping
 * to a customer/transaction/vault/bank required knowing which page it lives
 * on and navigating the sidebar tree to get there.
 */
export default function GlobalSearch({ isOpen, onClose, onNavigate }: GlobalSearchProps) {
  const { customers, transactions, vaults, banks } = useSystem();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const out: SearchResult[] = [];

    customers.filter(c =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.idNumber.includes(q)
    ).slice(0, 6).forEach(c => out.push({
      key: `customer-${c.id}`, category: 'عميل', icon: Users,
      primary: c.name, secondary: `${c.phone} — ${c.idNumber}`, page: 'customers'
    }));

    transactions.filter(t =>
      t.id.toLowerCase().includes(q) || (t.customerName || '').toLowerCase().includes(q)
    ).slice(0, 6).forEach(t => out.push({
      key: `tx-${t.id}`, category: 'عملية', icon: ArrowLeftRight,
      primary: `${t.id} — ${t.customerName || ''}`, secondary: `${t.amount} ${t.fromCurrency} ← → ${t.toCurrency} (${t.timestamp})`, page: 'accounting'
    }));

    vaults.filter(v => v.name.toLowerCase().includes(q)).slice(0, 6).forEach(v => out.push({
      key: `vault-${v.id}`, category: 'خزنة', icon: Building2,
      primary: v.name, secondary: v.branch, page: 'vaults'
    }));

    banks.filter(b => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q)).slice(0, 6).forEach(b => out.push({
      key: `bank-${b.id}`, category: 'بنك', icon: Landmark,
      primary: b.name, secondary: `${b.code} — ${b.city}`, page: 'banks'
    }));

    return out;
  }, [query, customers, transactions, vaults, banks]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && results[0]) {
        onNavigate(results[0].page);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, results, onNavigate, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh' }}
      onClick={onClose}
    >
      <div
        className="section-card"
        style={{ width: '100%', maxWidth: 560, animation: 'scale-up 0.2s ease-out', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.9rem 1rem', borderBottom: '1px solid var(--border)' }}>
          <Search size={18} color="var(--gray)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث عن عميل، عملية، خزنة، أو بنك... (Ctrl+K)"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.95rem', color: 'var(--foreground)' }}
          />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)' }}><X size={18} /></button>
        </div>

        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {query.trim() === '' && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.85rem' }}>
              اكتب للبحث في العملاء والعمليات والخزنات والبنوك
            </div>
          )}
          {query.trim() !== '' && results.length === 0 && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.85rem' }}>
              لا توجد نتائج لـ "{query}"
            </div>
          )}
          {results.map(r => (
            <button
              key={r.key}
              onClick={() => { onNavigate(r.page); onClose(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%',
                padding: '0.7rem 1rem', border: 'none', borderBottom: '1px solid var(--border)',
                background: 'none', cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit'
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <r.icon size={16} color="var(--primary)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.primary}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.secondary}</div>
              </div>
              <span className="badge pending" style={{ fontSize: '0.7rem', flexShrink: 0 }}>{r.category}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
