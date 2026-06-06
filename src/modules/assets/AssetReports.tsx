import { useState, useMemo } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import {
  BarChart2, PieChart, Package, Filter, Download, Printer
} from 'lucide-react';

interface Props {
  showToast: (type: ToastMessage['type'], message: string) => void;
}

const CATEGORY_COLORS = ['var(--primary)', 'var(--success)', 'var(--warning)', 'var(--danger)', 'var(--info)', '#8b5cf6', '#ec4899'];

export default function AssetReports({ showToast }: Props) {
  const { fixedAssets, maintenanceRecords } = useSystem();

  const [filterBranch, setFilterBranch] = useState('الكل');
  const [filterCategory, setFilterCategory] = useState('الكل');

  const branches = useMemo(() => {
    const set = new Set(fixedAssets.map(a => a.branch));
    return ['الكل', ...Array.from(set)];
  }, [fixedAssets]);

  const categories = useMemo(() => {
    const set = new Set(fixedAssets.map(a => a.category));
    return ['الكل', ...Array.from(set)];
  }, [fixedAssets]);

  const filteredAssets = useMemo(() => {
    return fixedAssets.filter(a => {
      const matchBranch = filterBranch === 'الكل' || a.branch === filterBranch;
      const matchCat = filterCategory === 'الكل' || a.category === filterCategory;
      return matchBranch && matchCat;
    });
  }, [fixedAssets, filterBranch, filterCategory]);

  // Aggregates
  const totalCost = filteredAssets.reduce((s, a) => s + a.purchasePrice, 0);
  const totalCurrentValue = filteredAssets.reduce((s, a) => s + a.currentValue, 0);

  // Maintenance costs by asset
  const maintenanceCosts = useMemo(() => {
    const byAsset: Record<string, number> = {};
    maintenanceRecords.forEach(r => {
      byAsset[r.assetId] = (byAsset[r.assetId] || 0) + r.cost;
    });
    return byAsset;
  }, [maintenanceRecords]);

  // Category distribution
  const categoryDist = useMemo(() => {
    const dist: Record<string, { count: number; value: number }> = {};
    filteredAssets.forEach(a => {
      if (!dist[a.category]) dist[a.category] = { count: 0, value: 0 };
      dist[a.category].count += 1;
      dist[a.category].value += a.purchasePrice;
    });
    return Object.entries(dist).map(([cat, data]) => ({ category: cat, ...data }));
  }, [filteredAssets]);

  // Branch distribution
  const branchDist = useMemo(() => {
    const dist: Record<string, { count: number; value: number }> = {};
    filteredAssets.forEach(a => {
      if (!dist[a.branch]) dist[a.branch] = { count: 0, value: 0 };
      dist[a.branch].count += 1;
      dist[a.branch].value += a.purchasePrice;
    });
    return Object.entries(dist).map(([branch, data]) => ({ branch, ...data })).sort((a, b) => b.value - a.value);
  }, [filteredAssets]);

  const maxBranchValue = Math.max(...branchDist.map(b => b.value), 1);
  const maxCatValue = Math.max(...categoryDist.map(c => c.value), 1);

  const handlePrint = () => showToast('info', 'جارٍ تجهيز التقرير للطباعة...');
  const handleExport = () => showToast('info', 'جارٍ تصدير التقرير بصيغة Excel...');

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>تقرير جرد الأصول</h1>
          <p style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>
            <Package size={14} style={{ verticalAlign: 'middle', marginLeft: '0.3rem' }} />
            قائمة شاملة بجميع الأصول مع تفاصيل التكلفة والموقع والحالة
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn btn-secondary" onClick={handlePrint}>
            <Printer size={15} /> طباعة
          </button>
          <button className="btn btn-primary" onClick={handleExport}>
            <Download size={15} /> تصدير Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="section-card" style={{ padding: '0.75rem 1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--gray)', fontSize: '0.8rem' }}>
            <Filter size={14} /> تصفية:
          </div>
          <select
            className="form-select"
            style={{ width: 'auto', height: 36, margin: 0 }}
            value={filterBranch}
            onChange={e => setFilterBranch(e.target.value)}
          >
            {branches.map(b => <option key={b} value={b}>{b === 'الكل' ? 'كل الفروع' : b}</option>)}
          </select>
          <select
            className="form-select"
            style={{ width: 'auto', height: 36, margin: 0 }}
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            {categories.map(c => <option key={c} value={c}>{c === 'الكل' ? 'كل الفئات' : c}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
        {[
          { label: 'إجمالي عدد الأصول', value: filteredAssets.length, suffix: 'أصل', color: 'var(--primary)' },
          { label: 'نشط', value: filteredAssets.filter(a => a.status === 'نشط').length, suffix: 'أصل', color: 'var(--success)' },
          { label: 'قيد الصيانة', value: filteredAssets.filter(a => a.status === 'قيد الصيانة').length, suffix: 'أصل', color: 'var(--warning)' },
          { label: 'مباع / متوقف', value: filteredAssets.filter(a => a.status === 'مباع' || a.status === 'متوقف' || a.status === 'مستهلك بالكامل').length, suffix: 'أصل', color: 'var(--danger)' },
        ].map((kpi, i) => (
          <div key={i} className="section-card" style={{ padding: '0.9rem 1.1rem', borderTop: `3px solid ${kpi.color}` }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>{kpi.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: kpi.color }}>
              {kpi.value} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>{kpi.suffix}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Distribution Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="section-card">
          <div style={{ fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <BarChart2 size={16} color="var(--primary)" /> توزيع الأصول حسب الفئة
          </div>
          {categoryDist.length === 0 ? (
            <div className="empty-state" style={{ padding: '1.5rem' }}><span>لا توجد بيانات</span></div>
          ) : categoryDist.map((cat, i) => (
            <div key={cat.category} style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: 600 }}>{cat.category}</span>
                <span style={{ color: 'var(--gray)' }}>{cat.count} أصل — {cat.value.toLocaleString('ar-LY')} د.ل</span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{
                  width: `${(cat.value / maxCatValue) * 100}%`,
                  height: '100%',
                  background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                  borderRadius: 5,
                  transition: 'width 0.5s ease'
                }} />
              </div>
            </div>
          ))}
        </div>

        <div className="section-card">
          <div style={{ fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <PieChart size={16} color="var(--primary)" /> توزيع قيمة الأصول حسب الفرع
          </div>
          {branchDist.length === 0 ? (
            <div className="empty-state" style={{ padding: '1.5rem' }}><span>لا توجد بيانات</span></div>
          ) : branchDist.map((b, i) => (
            <div key={b.branch} style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: 600 }}>{b.branch}</span>
                <span style={{ color: 'var(--gray)' }}>{b.count} — {b.value.toLocaleString('ar-LY')} د.ل</span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{
                  width: `${(b.value / maxBranchValue) * 100}%`,
                  height: '100%',
                  background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                  borderRadius: 5,
                  transition: 'width 0.5s ease'
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Assets Table */}
      <div className="section-card">
        <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>تفاصيل الأصول</div>
        <div className="table-responsive">
          <table className="financial-table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>الأصل</th>
                <th>الفئة</th>
                <th>الفرع</th>
                <th>تاريخ الاقتناء</th>
                <th>تكلفة الشراء</th>
                <th>القيمة الدفترية</th>
                <th>تكاليف الصيانة</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map(a => {
                const mCost = maintenanceCosts[a.id] || 0;
                return (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--gray)' }}>{a.id}</td>
                    <td style={{ fontWeight: 700 }}>{a.name}</td>
                    <td><span style={{ background: 'var(--sidebar-hover)', borderRadius: 5, padding: '0.15rem 0.5rem', fontSize: '0.78rem' }}>{a.category}</span></td>
                    <td style={{ fontSize: '0.82rem' }}>{a.branch}</td>
                    <td style={{ fontSize: '0.8rem' }}>{a.purchaseDate}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{a.purchasePrice.toLocaleString('ar-LY')} {a.currency}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--success)', fontWeight: 700 }}>{a.currentValue.toLocaleString('ar-LY')} {a.currency}</td>
                    <td style={{ fontFamily: 'monospace', color: mCost > 0 ? 'var(--warning)' : 'var(--gray)' }}>{mCost.toLocaleString('ar-LY')} {a.currency}</td>
                    <td><span className={`badge ${a.status === 'نشط' ? 'active' : a.status === 'قيد الصيانة' ? 'pending' : 'inactive'}`}>{a.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 800, background: 'var(--sidebar-hover)' }}>
                <td colSpan={5} style={{ textAlign: 'right', padding: '0.6rem' }}>الإجمالي</td>
                <td style={{ fontFamily: 'monospace', padding: '0.6rem' }}>{totalCost.toLocaleString('ar-LY')} د.ل</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--success)', padding: '0.6rem' }}>{totalCurrentValue.toLocaleString('ar-LY')} د.ل</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--warning)', padding: '0.6rem' }}>{Object.values(maintenanceCosts).reduce((s, c) => s + c, 0).toLocaleString('ar-LY')} د.ل</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
