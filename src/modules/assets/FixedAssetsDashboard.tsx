import { useMemo } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import {
  Building, Car, Wrench, FileWarning, TrendingDown,
  DollarSign, ListCollapse, Award
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

interface Props {
  showToast: (type: ToastMessage['type'], message: string) => void;
}

const COLORS = ['var(--accent)', '#089981', '#FF9800', '#F23645', '#7C5CFC', '#00BCD4', '#131722'];

export default function FixedAssetsDashboard({ showToast: _showToast }: Props) {
  const { fixedAssets, assetDocuments, depreciationRecords } = useSystem();

  // Calculations
  const totalAssetsCount = fixedAssets.length;
  
  const totalAssetsValue = useMemo(() => {
    return fixedAssets
      .filter(a => a.status !== 'مباع')
      .reduce((sum, a) => sum + a.purchasePrice, 0);
  }, [fixedAssets]);

  const carsCount = fixedAssets.filter(a => a.type === 'سيارة' && a.status !== 'مباع').length;
  
  const realEstatesCount = fixedAssets.filter(a => 
    ['مبنى', 'مكتب', 'أرض', 'مخزن'].includes(a.type) && a.status !== 'مباع'
  ).length;

  const underMaintenanceCount = fixedAssets.filter(a => a.status === 'قيد الصيانة').length;

  const expiringDocsCount = useMemo(() => {
    return assetDocuments.filter(d => d.status === 'قارب على الانتهاء' || d.status === 'منتهي').length;
  }, [assetDocuments]);

  const currentYearDepreciation = useMemo(() => {
    return depreciationRecords.reduce((sum, r) => sum + r.annualDepreciation, 0);
  }, [depreciationRecords]);

  // Chart Data: Assets by Category
  const categoryData = useMemo(() => {
    const counts: Record<string, { count: number; value: number }> = {};
    fixedAssets.filter(a => a.status !== 'مباع').forEach(a => {
      const cat = a.category || 'أخرى';
      if (!counts[cat]) {
        counts[cat] = { count: 0, value: 0 };
      }
      counts[cat].count += 1;
      counts[cat].value += a.purchasePrice;
    });
    return Object.entries(counts).map(([name, data]) => ({
      name,
      value: data.count,
      cost: data.value
    }));
  }, [fixedAssets]);

  // Chart Data: Assets by Branch
  const branchData = useMemo(() => {
    const counts: Record<string, { count: number; value: number }> = {};
    fixedAssets.filter(a => a.status !== 'مباع').forEach(a => {
      const br = a.branch || 'غير محدد';
      if (!counts[br]) {
        counts[br] = { count: 0, value: 0 };
      }
      counts[br].count += 1;
      counts[br].value += a.purchasePrice;
    });
    return Object.entries(counts).map(([name, data]) => ({
      name,
      value: data.count,
      cost: data.value
    }));
  }, [fixedAssets]);

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.25rem' }}>
            لوحة الأصول الثابتة
          </h1>
          <p style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>
            إحصائيات الأصول، الصيانة، والإهلاك للشركة
          </p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="dashboard-kpis-grid">
        <div className="kpi-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div className="kpi-card-header">
            <span>إجمالي عدد الأصول</span>
            <div className="kpi-icon-wrapper blue"><Award size={18} /></div>
          </div>
          <div className="kpi-value">{totalAssetsCount}</div>
          <div className="kpi-footer" style={{ color: 'var(--gray)' }}>
            <span>أصول مملوكة ومؤجرة</span>
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #089981' }}>
          <div className="kpi-card-header">
            <span>إجمالي قيمة الأصول</span>
            <div className="kpi-icon-wrapper green"><DollarSign size={18} /></div>
          </div>
          <div className="kpi-value" style={{ fontSize: '1.4rem' }}>
            {totalAssetsValue.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
          </div>
          <div className="kpi-footer" style={{ color: 'var(--gray)' }}>
            <span>تاريخ الشراء / التملك</span>
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #1652F0' }}>
          <div className="kpi-card-header">
            <span>عدد السيارات</span>
            <div className="kpi-icon-wrapper blue"><Car size={18} /></div>
          </div>
          <div className="kpi-value">{carsCount}</div>
          <div className="kpi-footer" style={{ color: 'var(--gray)' }}>
            <span>وسائل نقل وحركة نشطة</span>
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #8B5CF6' }}>
          <div className="kpi-card-header">
            <span>عدد المباني والعقارات</span>
            <div className="kpi-icon-wrapper blue"><Building size={18} /></div>
          </div>
          <div className="kpi-value">{realEstatesCount}</div>
          <div className="kpi-footer" style={{ color: 'var(--gray)' }}>
            <span>مكاتب، فروع، وأراضي</span>
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #F23645' }}>
          <div className="kpi-card-header">
            <span>أصول قيد الصيانة</span>
            <div className="kpi-icon-wrapper red"><Wrench size={18} /></div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>{underMaintenanceCount}</div>
          <div className="kpi-footer" style={{ color: 'var(--danger)' }}>
            <span>تتطلب متابعة سريعة</span>
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #FF9800' }}>
          <div className="kpi-card-header">
            <span>مستندات قاربت على الانتهاء</span>
            <div className="kpi-icon-wrapper yellow"><FileWarning size={18} /></div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>{expiringDocsCount}</div>
          <div className="kpi-footer" style={{ color: 'var(--warning)' }}>
            <span>تأمين، رخص، وعقود إيجار</span>
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid var(--accent)' }}>
          <div className="kpi-card-header">
            <span>إهلاك السنة الحالية</span>
            <div className="kpi-icon-wrapper yellow"><TrendingDown size={18} /></div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--accent)', fontSize: '1.4rem' }}>
            {currentYearDepreciation.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
          </div>
          <div className="kpi-footer" style={{ color: 'var(--gray)' }}>
            <span>طريقة القسط الثابت واليدوي</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="dashboard-row-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        {/* category pie chart */}
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title">
              <ListCollapse size={18} color="var(--accent)" /> الأصول حسب التصنيف
            </div>
          </div>
          <div className="section-card-body" style={{ height: 280 }}>
            {categoryData.length === 0 ? (
              <div className="empty-state" style={{ height: '100%' }}>
                <span>لا توجد بيانات متاحة</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} أصول`, 'العدد']} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem', fontFamily: 'var(--font-arabic)' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* branch bar chart */}
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-card-title">
              <Building size={18} color="var(--accent)" /> توزيع القيمة حسب الفروع
            </div>
          </div>
          <div className="section-card-body" style={{ height: 280 }}>
            {branchData.length === 0 ? (
              <div className="empty-state" style={{ height: '100%' }}>
                <span>لا توجد بيانات متاحة</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={branchData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--gray)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--gray)' }} />
                  <Tooltip
                    formatter={(value) => [`${Number(value).toLocaleString()} د.ل`, 'القيمة الكلية']}
                    contentStyle={{ fontFamily: 'var(--font-arabic)', fontSize: '0.8rem', borderRadius: 8 }}
                  />
                  <Bar dataKey="cost" name="قيمة الأصول" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
