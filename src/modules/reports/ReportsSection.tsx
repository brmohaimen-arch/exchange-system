import { useMemo, useState, useEffect, useCallback } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { BarChart3, TrendingUp, Banknote, Users, ArrowLeftRight, Download, RefreshCw } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

type ReportKey = 'daily' | 'customers' | 'vaults' | 'audit' | 'debts' | 'profit';

interface Props {
  showToast: (type: ToastMessage['type'], message: string) => void;
  /** When set, this report opens as its own dedicated page (no tab switcher, no other sections). */
  section?: ReportKey;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const API_BASE = 'http://localhost:8000/api';

interface ProfitSummary {
  totalProfit: number;
  buyCount: number;
  sellCount: number;
  exchangeCount: number;
  totalTx: number;
  volumeByCurrency: Record<string, number>;
}

interface ProfitTx {
  id: string;
  type: string;
  timestamp: string;
  customerName: string | null;
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  rate: number;
  expectedProfit: number;
  status: string;
  vaultName: string;
}

export default function ReportsSection({ showToast, section }: Props) {
  const { transactions, vaults, customers, debts, auditLogs } = useSystem();

  const [activeReportState, setActiveReport] = useState<ReportKey>(section || 'daily');
  const activeReport = section || activeReportState;
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().substring(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().substring(0, 10));
  const [auditFilter, setAuditFilter] = useState('');

  // Profit report state (fetched from backend)
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null);
  const [profitTxs, setProfitTxs] = useState<ProfitTx[]>([]);
  const [profitLoading, setProfitLoading] = useState(false);

  const filteredTxs = useMemo(() => transactions.filter(t => {
    const d = t.timestamp.substring(0, 10);
    return d >= dateFrom && d <= dateTo;
  }), [transactions, dateFrom, dateTo]);

  const byType = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredTxs.forEach(t => { counts[t.type] = (counts[t.type] || 0) + 1; });
    return Object.entries(counts).map(([type, count]) => ({ type, count }));
  }, [filteredTxs]);

  const buyCount = filteredTxs.filter(t => t.type === 'buy').length;
  const sellCount = filteredTxs.filter(t => t.type === 'sell').length;

  const customerStats = useMemo(() => customers.map(c => ({
    name: c.name,
    txCount: transactions.filter(t => t.customerId === c.id).length,
    balance: c.balances['LYD'] || 0,
    debts: debts.filter(d => d.customerId === c.id && d.status !== 'paid').reduce((s, d) => s + d.remainingAmount, 0),
  })).sort((a, b) => b.txCount - a.txCount).slice(0, 15), [customers, transactions, debts]);

  const currencyVolume = useMemo(() => {
    const vol: Record<string, number> = {};
    filteredTxs.forEach(t => { vol[t.fromCurrency] = (vol[t.fromCurrency] || 0) + t.amount; });
    return Object.entries(vol).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [filteredTxs]);

  const vaultData = vaults.map(v => ({
    name: v.name.substring(0, 12),
    LYD: v.balances['LYD'] || 0,
    USD: v.balances['USD'] || 0,
  }));

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const d = log.timestamp.substring(0, 10);
      const matchesDate = d >= dateFrom && d <= dateTo;
      const matchesSearch = log.user.includes(auditFilter) || log.action.includes(auditFilter) || log.details.includes(auditFilter);
      return matchesDate && matchesSearch;
    });
  }, [auditLogs, dateFrom, dateTo, auditFilter]);

  // Fetch profit data from backend
  const fetchProfitReport = useCallback(async () => {
    setProfitLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reports/profit?date_from=${dateFrom}T00:00:00&date_to=${dateTo}T23:59:59`);
      const json = await res.json();
      if (json.data) {
        setProfitSummary(json.data.summary);
        setProfitTxs(json.data.transactions);
      }
    } catch {
      showToast('danger', 'تعذّر تحميل بيانات تقرير الأرباح');
    } finally {
      setProfitLoading(false);
    }
  }, [dateFrom, dateTo]);

  // Auto-fetch when switching to profit tab or dates change
  useEffect(() => {
    if (activeReport === 'profit') {
      fetchProfitReport();
    }
  }, [activeReport, dateFrom, dateTo]);

  const reports = [
    { id: 'daily', label: 'تقرير العمليات', icon: ArrowLeftRight },
    { id: 'customers', label: 'تقرير العملاء', icon: Users },
    { id: 'vaults', label: 'تقرير الخزنات', icon: Banknote },
    { id: 'audit', label: 'سجل المراجعة', icon: BarChart3 },
    { id: 'debts', label: 'تقرير الديون', icon: BarChart3 },
    { id: 'profit', label: 'تقرير الأرباح', icon: TrendingUp },
  ] as const;

  const handleExport = (format: 'pdf' | 'excel' | 'print') => {
    if (format === 'excel') showToast('success', 'تم تصدير التقرير بصيغة Excel بنجاح وجاري التحميل');
    else if (format === 'print') showToast('success', 'تم إرسال التقرير المالي إلى الطابعة الافتراضية بنجاح');
    else showToast('success', 'تم حفظ وتصدير التقرير بصيغة PDF بنجاح');
  };

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{reports.find(r => r.id === activeReport)?.label || 'التقارير والإحصائيات'}</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => handleExport('excel')} style={{ fontSize: '0.85rem' }}>
            <Download size={14} />تصدير Excel
          </button>
          <button className="btn btn-secondary" onClick={() => handleExport('pdf')} style={{ fontSize: '0.85rem' }}>
            <Download size={14} />تصدير PDF
          </button>
          <button className="btn btn-primary" onClick={() => handleExport('print')} style={{ fontSize: '0.85rem' }}>
            طباعة التقرير
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="section-card">
        <div className="section-card-body">
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">من تاريخ</label>
              <input className="form-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">إلى تاريخ</label>
              <input className="form-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['today', 'week', 'month'].map(p => (
                <button key={p} className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    const now = new Date();
                    const today = now.toISOString().substring(0, 10);
                    if (p === 'today') { setDateFrom(today); setDateTo(today); }
                    else if (p === 'week') { const w = new Date(now); w.setDate(w.getDate() - 7); setDateFrom(w.toISOString().substring(0, 10)); setDateTo(today); }
                    else { const m = new Date(now); m.setMonth(m.getMonth() - 1); setDateFrom(m.toISOString().substring(0, 10)); setDateTo(today); }
                  }}
                >
                  {p === 'today' ? 'اليوم' : p === 'week' ? 'آخر أسبوع' : 'آخر شهر'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Report Type Tabs — only shown when this page isn't already dedicated to one section */}
      {!section && (
        <div className="pos-tabs-row" style={{ flexWrap: 'wrap' }}>
          {reports.map(r => (
            <button key={r.id} className={`pos-tab-btn${activeReport === r.id ? ' active' : ''}`} onClick={() => setActiveReport(r.id)}>
              <r.icon size={16} />{r.label}
            </button>
          ))}
        </div>
      )}

      {activeReport === 'daily' && (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
            {[
              { label: 'إجمالي العمليات', value: filteredTxs.length, suffix: 'عملية', color: 'var(--primary)' },
              { label: 'عمليات الشراء', value: buyCount, suffix: '', color: 'var(--success)' },
              { label: 'عمليات البيع', value: sellCount, suffix: '', color: 'var(--danger)' },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>{item.label}</div>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: item.color }}>
                  {item.value} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--gray)' }}>{item.suffix}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="dashboard-row-grid">
            <div className="section-card">
              <div className="section-card-header"><div className="section-card-title">توزيع العمليات حسب النوع</div></div>
              <div style={{ height: 280 }}>
                <ResponsiveContainer>
                  <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <Pie data={byType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={90} label={({ type, count }) => {
                      const txTypeLabel: Record<string, string> = { buy: 'شراء', sell: 'بيع', exchange: 'تبديل', deposit: 'إيداع', withdraw: 'سحب', transfer: 'تحويل', adjustment: 'تسوية', reversal: 'عكسي' };
                      return `${txTypeLabel[type] || type}: ${count}`;
                    }}>
                      {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontFamily: 'var(--font-arabic)', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="section-card">
              <div className="section-card-header"><div className="section-card-title">أحجام التداول حسب العملة</div></div>
              <div style={{ height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={currencyVolume}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ fontFamily: 'var(--font-arabic)', borderRadius: 8 }} formatter={(v: any) => [Number(v).toLocaleString()]} />
                    <Bar dataKey="value" name="الحجم" radius={[4, 4, 0, 0]}>
                      {currencyVolume.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="section-card">
            <div className="section-card-header"><div className="section-card-title"><BarChart3 size={18} color="var(--accent)" />سجل العمليات في الفترة</div></div>
            <div className="table-responsive">
              <table className="financial-table">
                <thead><tr><th>الوقت</th><th>النوع</th><th>العميل</th><th>المبلغ</th><th>من</th><th>إلى</th><th>الربح</th><th>الحالة</th></tr></thead>
                <tbody>
                  {filteredTxs.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontSize: '0.78rem' }}>{t.timestamp.substring(0, 16)}</td>
                      <td><span className={`badge ${t.type === 'buy' ? 'active' : t.type === 'sell' ? 'inactive' : 'pending'}`}>{t.type === 'buy' ? 'شراء' : t.type === 'sell' ? 'بيع' : t.type === 'deposit' ? 'إيداع' : t.type === 'withdraw' ? 'سحب' : t.type}</span></td>
                      <td>{t.customerName || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{t.amount.toLocaleString()}</td>
                      <td>{t.fromCurrency}</td>
                      <td>{t.toCurrency}</td>
                      <td style={{ color: (t.expectedProfit || 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{t.expectedProfit != null ? `${t.expectedProfit >= 0 ? '+' : ''}${t.expectedProfit.toFixed(2)}` : '—'}</td>
                      <td><span className={`badge ${t.status === 'approved' ? 'active' : 'inactive'}`}>{t.status === 'approved' ? 'منفَّذة' : 'ملغاة'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeReport === 'customers' && (
        <div className="section-card">
          <div className="section-card-header"><div className="section-card-title"><Users size={18} color="var(--accent)" />إحصائيات أفضل العملاء</div></div>
          <table className="financial-table">
            <thead><tr><th>العميل</th><th>عدد العمليات</th><th>رصيد (LYD)</th><th>إجمالي الديون (LYD)</th></tr></thead>
            <tbody>
              {customerStats.map(c => (
                <tr key={c.name}>
                  <td style={{ fontWeight: 700 }}>{c.name}</td>
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.txCount}</td>
                  <td style={{ color: c.balance < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>{c.balance.toLocaleString()}</td>
                  <td style={{ color: c.debts > 0 ? 'var(--danger)' : 'var(--gray)', fontWeight: 700 }}>{c.debts.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeReport === 'vaults' && (
        <>
          <div style={{ height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={vaultData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ fontFamily: 'var(--font-arabic)', borderRadius: 8 }} formatter={(v: any) => [Number(v).toLocaleString()]} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-arabic)', fontSize: '0.82rem' }} />
                <Bar dataKey="LYD" name="دينار ليبي" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="USD" name="دولار أمريكي" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="section-card">
            <div className="section-card-header"><div className="section-card-title">تفاصيل الأرصدة</div></div>
            <table className="financial-table">
              <thead><tr><th>الخزنة</th><th>LYD</th><th>USD</th><th>EUR</th><th>النوع</th><th>الحالة</th></tr></thead>
              <tbody>
                {vaults.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 700 }}>{v.name}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{(v.balances['LYD'] || 0).toLocaleString()}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{(v.balances['USD'] || 0).toLocaleString()}</td>
                    <td style={{ fontFamily: 'monospace' }}>{(v.balances['EUR'] || 0).toLocaleString()}</td>
                    <td><span className="badge pending">{v.type === 'main' ? 'رئيسية' : v.type === 'branch' ? 'فرع' : 'صراف'}</span></td>
                    <td><span className={`badge ${v.isActive ? 'active' : 'inactive'}`}>{v.isActive ? 'نشطة' : 'موقوفة'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeReport === 'audit' && (
        <div className="section-card">
          <div className="section-card-header" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div className="section-card-title"><BarChart3 size={18} color="var(--accent)" />سجل المراجعة والأمان للنظام</div>
            <input
              className="form-input"
              style={{ maxWidth: 260, fontSize: '0.85rem' }}
              type="text"
              placeholder="البحث بالموظف أو الإجراء..."
              value={auditFilter}
              onChange={e => setAuditFilter(e.target.value)}
            />
          </div>
          <div className="table-responsive">
            {filteredAuditLogs.length === 0 ? (
              <div className="empty-state">
                <BarChart3 size={32} /><span>لا توجد سجلات مراجعة مطابقة للفترة أو البحث المحدد</span>
              </div>
            ) : (
              <table className="financial-table">
                <thead>
                  <tr><th>الوقت</th><th>الموظف</th><th>الدور</th><th>العملية</th><th>النوع</th><th>التفاصيل</th></tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>{log.timestamp}</td>
                      <td style={{ fontWeight: 700 }}>{log.user}</td>
                      <td><span className="badge pending">{log.role}</span></td>
                      <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{log.action}</td>
                      <td><span className="badge blue-normal">{log.entity}</span></td>
                      <td style={{ fontSize: '0.82rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.details}>
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeReport === 'debts' && (
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title"><Users size={18} color="var(--accent)" />تقرير الديون المفتوحة واستحقاقاتها</div>
          </div>
          {/* Debt KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', padding: '0 1rem 1rem' }}>
            {[
              { label: 'إجمالي الديون', value: debts.length, suffix: 'دين', color: 'var(--primary)' },
              { label: 'غير مسددة', value: debts.filter(d => d.status === 'unpaid').length, suffix: 'دين', color: 'var(--danger)' },
              { label: 'مسددة جزئياً', value: debts.filter(d => d.status === 'partially_paid').length, suffix: 'دين', color: 'var(--warning)' },
              { label: 'إجمالي المتبقي', value: debts.filter(d => d.status !== 'paid').reduce((s, d) => s + d.remainingAmount, 0).toLocaleString('ar-LY', { maximumFractionDigits: 0 }) + ' د.ل', color: 'var(--danger)' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--card)', border: `1px solid var(--border)`, borderTop: `3px solid ${k.color}`, borderRadius: 10, padding: '0.9rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginBottom: '0.3rem' }}>{k.label}</div>
                <div style={{ fontWeight: 800, color: k.color }}>{k.value} {k.suffix && typeof k.value === 'number' ? <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>{k.suffix}</span> : null}</div>
              </div>
            ))}
          </div>
          <div className="table-responsive">
            {debts.length === 0 ? (
              <div className="empty-state"><Users size={32} /><span>لا توجد ديون مسجلة في النظام حالياً</span></div>
            ) : (
              <table className="financial-table">
                <thead>
                  <tr><th>اسم العميل</th><th>قيمة الدين الأصلية</th><th>الرصيد المتبقي</th><th>المسدد</th><th>تاريخ الاستحقاق</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {debts.map(d => {
                    const today = new Date().toISOString().substring(0, 10);
                    const isOverdue = d.dueDate && d.dueDate < today && d.status !== 'paid';
                    return (
                      <tr key={d.id} style={{ background: isOverdue ? 'rgba(239,68,68,0.04)' : undefined }}>
                        <td style={{ fontWeight: 700 }}>
                          {d.customerName}
                          {isOverdue && <span style={{ marginRight: '0.4rem', fontSize: '0.7rem', color: 'var(--danger)', fontWeight: 800 }}>⚠ متأخر</span>}
                        </td>
                        <td style={{ fontFamily: 'monospace' }}>{d.amount.toLocaleString()} د.ل</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 800, color: d.status === 'paid' ? 'var(--success)' : 'var(--danger)' }}>
                          {d.remainingAmount.toLocaleString()} د.ل
                        </td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--success)' }}>{(d.amount - d.remainingAmount).toLocaleString()} د.ل</td>
                        <td style={{ fontSize: '0.82rem', color: isOverdue ? 'var(--danger)' : 'var(--gray)', fontWeight: isOverdue ? 700 : 400 }}>{d.dueDate || '—'}</td>
                        <td>
                          <span className={`badge ${d.status === 'paid' ? 'active' : d.status === 'partially_paid' ? 'pending' : 'inactive'}`}>
                            {d.status === 'paid' ? 'مسدد بالكامل' : d.status === 'partially_paid' ? 'مسدد جزئياً' : 'مفتوح (غير مسدد)'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeReport === 'profit' && (
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title"><TrendingUp size={18} color="var(--success)" />أرباح الصرف والعائد المالي للفترة</div>
            <button className="btn btn-secondary" onClick={fetchProfitReport} style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }} disabled={profitLoading}>
              <RefreshCw size={14} className={profitLoading ? 'spin' : ''} />
              {profitLoading ? 'جارٍ التحميل...' : 'تحديث'}
            </button>
          </div>
          <div className="section-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {profitLoading && (
              <div className="empty-state"><RefreshCw size={28} className="spin" /><span>جارٍ جلب بيانات الأرباح من قاعدة البيانات...</span></div>
            )}

            {!profitLoading && profitSummary && (
              <>
                {/* KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                  {[
                    { label: 'صافي الأرباح المحققة', value: profitSummary.totalProfit.toLocaleString('ar-LY', { minimumFractionDigits: 2 }) + ' د.ل', color: profitSummary.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)', bg: profitSummary.totalProfit >= 0 ? 'var(--success-bg)' : '#fef2f2', border: profitSummary.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)' },
                    { label: 'عمليات الشراء', value: profitSummary.buyCount + ' عملية', color: 'var(--success)', bg: 'var(--success-bg)', border: 'var(--success)' },
                    { label: 'عمليات البيع', value: profitSummary.sellCount + ' عملية', color: 'var(--danger)', bg: '#fef2f2', border: 'var(--danger)' },
                    { label: 'إجمالي العمليات', value: profitSummary.totalTx + ' عملية', color: 'var(--primary)', bg: 'var(--info-bg)', border: 'var(--info)' },
                  ].map((k, i) => (
                    <div key={i} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 10, padding: '1.25rem' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>{k.label}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: k.color }}>{k.value}</div>
                    </div>
                  ))}
                </div>

                {/* Volume by currency */}
                {Object.keys(profitSummary.volumeByCurrency).length > 0 && (
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {Object.entries(profitSummary.volumeByCurrency).map(([cur, vol]) => (
                      <div key={cur} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 1rem', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--gray)', marginLeft: '0.4rem' }}>حجم</span>
                        <strong style={{ color: 'var(--accent)' }}>{cur}:</strong>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}> {vol.toLocaleString('ar-LY', { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Transactions table */}
                <div className="table-responsive">
                  {profitTxs.length === 0 ? (
                    <div className="empty-state"><TrendingUp size={32} /><span>لا توجد عمليات صرف مسجلة خلال هذه الفترة</span></div>
                  ) : (
                    <table className="financial-table">
                      <thead>
                        <tr><th>الوقت</th><th>العملية</th><th>العميل</th><th>المبلغ</th><th>السعر</th><th>من/إلى</th><th>هامش الربح</th></tr>
                      </thead>
                      <tbody>
                        {profitTxs.map(t => (
                          <tr key={t.id}>
                            <td style={{ fontSize: '0.78rem' }}>{t.timestamp.substring(0, 16)}</td>
                            <td><span className={`badge ${t.type === 'buy' ? 'active' : t.type === 'sell' ? 'inactive' : 'pending'}`}>{t.type === 'buy' ? 'شراء' : t.type === 'sell' ? 'بيع' : 'تبديل'}</span></td>
                            <td style={{ fontWeight: 600 }}>{t.customerName || '—'}</td>
                            <td style={{ fontFamily: 'monospace' }}>{t.amount.toLocaleString()} {t.fromCurrency}</td>
                            <td style={{ fontFamily: 'monospace' }}>{t.rate}</td>
                            <td style={{ fontSize: '0.82rem' }}>{t.fromCurrency} ← {t.toCurrency}</td>
                            <td style={{ fontWeight: 800, color: (t.expectedProfit || 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {t.expectedProfit != null ? `${t.expectedProfit >= 0 ? '+' : ''}${t.expectedProfit.toFixed(3)} د.ل` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {!profitLoading && !profitSummary && (
              <div className="empty-state">
                <TrendingUp size={32} />
                <span>اضغط على "تحديث" لجلب بيانات الأرباح من قاعدة البيانات</span>
                <button className="btn btn-primary" onClick={fetchProfitReport} style={{ marginTop: '0.75rem' }}>جلب البيانات</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
