import { useMemo } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import {
  Banknote, TrendingUp, TrendingDown, ArrowLeftRight, AlertTriangle,
  Clock, CheckCircle, XCircle, Building2, ArrowUpDown, Wallet, Landmark
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';

interface Props { showToast: (type: ToastMessage['type'], message: string) => void; }

export default function Dashboard({ showToast, onNavigate }: Props & { onNavigate: (page: any) => void; }) {
  const {
    vaults, transactions, bankAccounts, debts, approvals,
    rates, currencies, shifts, currentUser, currentRole,
    vehicles, realEstates,
    approveReversal, rejectReversal, approveShift, approveInventoryCount, updateTransferStatus
  } = useSystem();

  const isAdmin = currentRole === 'مدير النظام';

  const todayTxs = useMemo(() => {
    const today = new Date().toISOString().substring(0, 10);
    return transactions.filter(t => t.timestamp.startsWith(today));
  }, [transactions]);

  const totalVaultLYD = useMemo(() => vaults.reduce((s, v) => s + (v.balances['LYD'] || 0), 0), [vaults]);
  const totalVaultUSD = useMemo(() => vaults.reduce((s, v) => s + (v.balances['USD'] || 0), 0), [vaults]);
  const totalBankLYD = useMemo(() => bankAccounts.filter(b => b.currency === 'LYD').reduce((s, b) => s + b.balance, 0), [bankAccounts]);
  const buyToday = todayTxs.filter(t => t.type === 'buy').length;
  const sellToday = todayTxs.filter(t => t.type === 'sell').length;
  const totalProfit = todayTxs.reduce((s, t) => s + (t.expectedProfit || 0), 0);
  const openDebts = debts.filter(d => d.status !== 'paid' && d.status !== 'cancelled');
  const totalDebt = openDebts.reduce((s, d) => s + d.remainingAmount, 0);
  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const activeShift = shifts.find(s => s.status === 'open');

  // Expiry alerts for debts, vehicle licenses, insurance, and rent leases
  const alerts = useMemo(() => {
    const list: Array<{ type: 'danger' | 'warning', text: string, category: 'debt' | 'asset' }> = [];
    const today = new Date();

    // ─── Debt alerts ───────────────────────────────────────────────────────────
    debts.forEach(d => {
      if (d.status === 'paid' || d.status === 'cancelled') return;
      if (d.dueDate) {
        const due = new Date(d.dueDate);
        const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          list.push({ type: 'danger', category: 'debt', text: `الدين على العميل "${d.customerName}" متأخر منذ ${Math.abs(diffDays)} يوم — المتبقي: ${d.remainingAmount.toLocaleString()} د.ل` });
        } else if (diffDays <= 7) {
          list.push({ type: 'warning', category: 'debt', text: `اقترب موعد سداد دين العميل "${d.customerName}" — خلال ${diffDays} يوم (${d.remainingAmount.toLocaleString()} د.ل)` });
        }
      } else {
        // No due date but still open — flag only if large
        if (d.remainingAmount > 500) {
          list.push({ type: 'warning', category: 'debt', text: `دين مفتوح بدون موعد سداد على العميل "${d.customerName}" — المتبقي: ${d.remainingAmount.toLocaleString()} د.ل` });
        }
      }
    });

    // ─── Asset / vehicle alerts ─────────────────────────────────────────────
    vehicles.forEach(v => {
      if (v.insuranceExpiry) {
        const ins = new Date(v.insuranceExpiry);
        const diffDays = Math.ceil((ins.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          list.push({ type: 'danger', category: 'asset', text: `تأمين السيارة "${v.carName}" منتهي منذ ${Math.abs(diffDays)} يوم!` });
        } else if (diffDays <= 30) {
          list.push({ type: 'warning', category: 'asset', text: `تأمين السيارة "${v.carName}" ينتهي خلال ${diffDays} يوم` });
        }
      }
      if (v.licenseExpiry) {
        const lic = new Date(v.licenseExpiry);
        const diffDays = Math.ceil((lic.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          list.push({ type: 'danger', category: 'asset', text: `ترخيص السيارة "${v.carName}" منتهي منذ ${Math.abs(diffDays)} يوم!` });
        } else if (diffDays <= 30) {
          list.push({ type: 'warning', category: 'asset', text: `ترخيص السيارة "${v.carName}" ينتهي خلال ${diffDays} يوم` });
        }
      }
    });

    realEstates.forEach(r => {
      if (r.ownershipType === 'مؤجر' && r.leaseEnd) {
        const end = new Date(r.leaseEnd);
        const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          list.push({ type: 'danger', category: 'asset', text: `عقد إيجار العقار "${r.propertyName}" منتهي منذ ${Math.abs(diffDays)} يوم!` });
        } else if (diffDays <= 30) {
          list.push({ type: 'warning', category: 'asset', text: `عقد إيجار العقار "${r.propertyName}" ينتهي خلال ${diffDays} يوم` });
        }
      }
    });

    return list;
  }, [debts, vehicles, realEstates]);

  const debtAlerts = alerts.filter(a => a.category === 'debt');
  const assetAlerts = alerts.filter(a => a.category === 'asset');

  const chartData = [
    { name: 'الأحد', buy: 12000, sell: 18000 },
    { name: 'الاثنين', buy: 15000, sell: 22000 },
    { name: 'الثلاثاء', buy: 9000, sell: 14000 },
    { name: 'الأربعاء', buy: 20000, sell: 28000 },
    { name: 'الخميس', buy: 17000, sell: 24000 },
    { name: 'الجمعة', buy: 8000, sell: 11000 },
    { name: 'اليوم', buy: buyToday * 7200, sell: sellToday * 7350 },
  ];

  const currencyBalances = currencies.filter(c => c.isActive).map(c => ({
    code: c.code, flag: c.flag, nameAr: c.nameAr,
    total: vaults.reduce((s, v) => s + (v.balances[c.code] || 0), 0),
  }));

  const statusIcon = (status: string) => {
    if (status === 'pending') return <Clock size={14} color="var(--warning)" />;
    if (status === 'approved') return <CheckCircle size={14} color="var(--success)" />;
    return <XCircle size={14} color="var(--danger)" />;
  };

  const txTypeLabel: Record<string, string> = {
    buy: 'شراء', sell: 'بيع', deposit: 'إيداع', withdraw: 'سحب',
    transfer: 'تحويل', reversal: 'عكسي', exchange: 'تبديل'
  };

  return (
    <div className="page-content" style={{ gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.25rem' }}>
            لوحة التحكم الرئيسية
          </h1>
          <p style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>
            مرحباً {currentUser} — نظرة شاملة على حركة اليوم
          </p>
        </div>
        {activeShift && (
          <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', animation: 'pulse 2s infinite' }} />
            <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.85rem' }}>صندوق الصراف مفتوح — {activeShift.vaultName}</span>
          </div>
        )}
      </div>

      {/* KPI Stats */}
      <div className="dashboard-kpis-grid">
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>أرصدة الخزنات (د.ل)</span>
            <div className="kpi-icon-wrapper blue"><Wallet size={17} /></div>
          </div>
          <div className="kpi-value">{totalVaultLYD.toLocaleString('ar-LY', { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>أرصدة الخزنات (USD)</span>
            <div className="kpi-icon-wrapper gold"><Banknote size={17} /></div>
          </div>
          <div className="kpi-value">{totalVaultUSD.toLocaleString('ar-LY', { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>أرصدة الحسابات البنكية (د.ل)</span>
            <div className="kpi-icon-wrapper blue"><Landmark size={17} /></div>
          </div>
          <div className="kpi-value">{totalBankLYD.toLocaleString('ar-LY', { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>أرباح اليوم (د.ل)</span>
            <div className="kpi-icon-wrapper green"><TrendingUp size={17} /></div>
          </div>
          <div className="kpi-value" style={{ color: totalProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{totalProfit.toLocaleString('ar-LY', { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>ديون مفتوحة (د.ل)</span>
            <div className="kpi-icon-wrapper red"><AlertTriangle size={17} /></div>
          </div>
          <div className="kpi-value">{totalDebt.toLocaleString('ar-LY', { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span>عمليات اليوم</span>
            <div className="kpi-icon-wrapper gray"><ArrowLeftRight size={17} /></div>
          </div>
          <div className="kpi-value">{buyToday + sellToday}</div>
        </div>
      </div>

      {/* Debt Alerts */}
      {debtAlerts.length > 0 && (
        <div className="section-card" style={{ border: '1px solid #FCA5A5', background: '#FEF2F2', padding: '1.25rem', borderRadius: 'var(--radius)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontWeight: 800, color: '#B91C1C', fontSize: '0.95rem' }}>
            <AlertTriangle size={18} />
            <span>تنبيهات الديون ({debtAlerts.length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 150, overflowY: 'auto' }}>
            {debtAlerts.map((alert, i) => (
              <div key={i} style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: alert.type === 'danger' ? '#991B1B' : '#92400E', fontWeight: alert.type === 'danger' ? 'bold' : 'normal' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: alert.type === 'danger' ? '#EF4444' : '#F59E0B', flexShrink: 0 }} />
                <span>{alert.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Asset / Expiry Alerts */}
      {assetAlerts.length > 0 && (
        <div className="section-card" style={{ border: '1px solid #FCD34D', background: '#FFFBEB', padding: '1.25rem', borderRadius: 'var(--radius)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontWeight: 800, color: '#92400E', fontSize: '0.95rem' }}>
            <AlertTriangle size={18} />
            <span>تنبيهات استحقاق المواعيد والأصول ({assetAlerts.length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 150, overflowY: 'auto' }}>
            {assetAlerts.map((alert, i) => (
              <div key={i} style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: alert.type === 'danger' ? '#991B1B' : '#92400E', fontWeight: alert.type === 'danger' ? 'bold' : 'normal' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: alert.type === 'danger' ? '#EF4444' : '#F59E0B', flexShrink: 0 }} />
                <span>{alert.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.75rem' }}>إجراءات سريعة</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
          <button className="btn btn-primary" onClick={() => onNavigate('exchange-pos')} style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            <TrendingDown size={20} /><span>بيع عملة</span>
          </button>
          <button className="btn btn-success" onClick={() => onNavigate('exchange-pos')} style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            <TrendingUp size={20} /><span>شراء عملة</span>
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('transfers')} style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center', background: 'var(--bg)', color: 'var(--primary)', border: '1px solid var(--border)' }}>
            <ArrowLeftRight size={20} /><span>تحويل من خزنة</span>
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('customers')} style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center', background: 'var(--bg)', color: 'var(--primary)', border: '1px solid var(--border)' }}>
            <Building2 size={20} /><span>إضافة عميل</span>
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('customer-transactions')} style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center', background: 'var(--bg)', color: 'var(--primary)', border: '1px solid var(--border)' }}>
            <AlertTriangle size={20} /><span>تسجيل دين</span>
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('daily-closings')} style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center', background: 'var(--bg)', color: 'var(--primary)', border: '1px solid var(--border)' }}>
            <Clock size={20} /><span>فتح صندوق صراف</span>
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('daily-closings')} style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center', background: 'var(--bg)', color: 'var(--primary)', border: '1px solid var(--border)' }}>
            <XCircle size={20} /><span>إقفال صندوق صراف</span>
          </button>
          {isAdmin && (
            <button className="btn btn-secondary" onClick={() => onNavigate('currencies')} style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center', background: 'var(--bg)', color: 'var(--primary)', border: '1px solid var(--border)' }}>
              <ArrowUpDown size={20} /><span>تحديث سعر الصرف</span>
            </button>
          )}
        </div>
      </div>


      {/* Charts + Approvals */}
      <div className="dashboard-row-grid">
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title"><ArrowUpDown size={18} color="var(--accent)" />حركة الشراء والبيع (7 أيام)</div>
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="buyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="sellGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--danger)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--gray)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--gray)' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: any) => [`${Number(v).toLocaleString()} د.ل`]}
                  contentStyle={{ fontFamily: 'var(--font-arabic)', fontSize: '0.8rem', borderRadius: 8, border: '1px solid var(--border)' }}
                />
                <Legend wrapperStyle={{ fontSize: '0.8rem', fontFamily: 'var(--font-arabic)' }} />
                <Area type="monotone" dataKey="buy" name="شراء" stroke="var(--success)" fill="url(#buyGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="sell" name="بيع" stroke="var(--danger)" fill="url(#sellGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title"><Clock size={18} color="var(--warning)" />طلبات الموافقة</div>
            <span className="badge pending">{pendingApprovals.length} معلق</span>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {pendingApprovals.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <CheckCircle size={32} color="var(--success)" /><span>لا يوجد طلبات معلقة</span>
              </div>
            ) : pendingApprovals.map(a => (
              <div key={a.id} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)' }}>{a.title}</span>
                  {statusIcon(a.status)}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                  {a.details.substring(0, 70)}
                </div>
                {a.amount && <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '0.5rem' }}>{a.amount.toLocaleString()} {a.currency}</div>}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-success" style={{ flex: 1, padding: '0.35rem', fontSize: '0.78rem' }}
                    onClick={() => {
                      if (a.type === 'transfer') updateTransferStatus(a.referenceId, 'approve');
                      else if (a.type === 'reversal') approveReversal(a.id);
                      else if (a.type === 'shift_close') approveShift(a.referenceId);
                      else if (a.type === 'inventory') approveInventoryCount(a.referenceId);
                      showToast('success', 'تمت الموافقة بنجاح');
                    }}>موافقة</button>
                  <button className="btn btn-danger" style={{ flex: 1, padding: '0.35rem', fontSize: '0.78rem' }}
                    onClick={() => {
                      if (a.type === 'transfer') updateTransferStatus(a.referenceId, 'reject');
                      else if (a.type === 'reversal') rejectReversal(a.id);
                      showToast('danger', 'تم الرفض');
                    }}>رفض</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Currency Balances + Rates */}
      <div className="dashboard-row-grid">
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title"><Banknote size={18} color="var(--accent)" />أرصدة العملات (إجمالي الخزنات)</div>
          </div>
          <div className="section-card-body">
            <div className="currencies-grid">
              {currencyBalances.map(c => (
                <div key={c.code} className="currency-balance-card">
                  <div className="currency-flag-code"><span>{c.flag}</span><span style={{ fontSize: '0.9rem', fontWeight: 800 }}>{c.code}</span></div>
                  <div className="currency-symbol">{c.nameAr}</div>
                  <div className="currency-bal-value">{c.total.toLocaleString('ar-LY', { maximumFractionDigits: 0 })}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title"><TrendingUp size={18} color="var(--accent)" />أسعار الصرف اليوم</div>
          </div>
          <div style={{ padding: 0 }}>
            <table className="financial-table">
              <thead><tr><th>الزوج</th><th>شراء</th><th>بيع</th></tr></thead>
              <tbody>
                {rates.filter(r => r.isActive).map(r => (
                  <tr key={r.id}>
                    <td><strong>{r.fromCurrency}</strong> / {r.toCurrency}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 700 }}>{r.buyRate}</td>
                    <td style={{ color: 'var(--danger)', fontWeight: 700 }}>{r.sellRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="section-card">
        <div className="section-card-header">
          <div className="section-card-title"><ArrowLeftRight size={18} color="var(--accent)" />آخر العمليات</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>أحدث 10 عمليات</span>
        </div>
        <div style={{ padding: 0 }}>
          <div className="table-responsive">
            <table className="financial-table">
              <thead>
                <tr><th>الوقت</th><th>النوع</th><th>العميل</th><th>المبلغ</th><th>العملة</th><th>الخزنة</th><th>الحالة</th></tr>
              </thead>
              <tbody>
                {transactions.slice(0, 15).map(t => (
                  <tr key={t.id}>
                    <td style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>{t.timestamp.substring(11, 16)}</td>
                    <td>
                      <span className={`badge ${t.type === 'buy' ? 'active' : t.type === 'sell' ? 'inactive' : 'pending'}`}>
                        {txTypeLabel[t.type] || t.type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{t.customerName || '—'}</td>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{t.amount.toLocaleString()}</td>
                    <td>{t.fromCurrency} → {t.toCurrency}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{t.vaultName || '—'}</td>
                    <td>
                      <span className={`badge ${t.status === 'approved' ? 'active' : t.status === 'pending' ? 'pending' : 'inactive'}`}>
                        {t.status === 'approved' ? 'منفَّذة' : t.status === 'pending' ? 'معلقة' : t.status === 'reversed' ? 'ملغاة' : 'مرفوضة'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
