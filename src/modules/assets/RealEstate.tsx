import { useMemo } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { Building2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { RealEstate } from '../../types';

interface Props {
  showToast: (type: ToastMessage['type'], message: string) => void;
}

export default function RealEstatePage({ showToast: _showToast }: Props) {
  const { realEstates, fixedAssets, maintenanceRecords } = useSystem();

  // Current Date: 2026-06-02
  const currentDate = useMemo(() => new Date('2026-06-02'), []);

  const realEstateAssets = useMemo(() => {
    const estateByAssetId = new Map(realEstates.map(e => [e.assetId, e]));
    return fixedAssets
      .filter(a => ['مبنى', 'مكتب', 'أرض', 'مخزن'].includes(a.type))
      .map(asset => {
        const estate = estateByAssetId.get(asset.id) || {
          id: `EST-${asset.id}`,
          assetId: asset.id,
          propertyName: asset.name,
          propertyType: asset.type as RealEstate['propertyType'],
          city: asset.location || '',
          address: asset.location || '',
          area: 0,
          deedNumber: '',
          ownershipType: 'مملوك' as RealEstate['ownershipType'],
          acquisitionDate: asset.purchaseDate,
          purchasePrice: asset.purchasePrice,
          currentEstimatedValue: asset.currentValue,
          leaseStart: '',
          leaseEnd: '',
          monthlyRent: 0,
          status: asset.status as any
        } as RealEstate;
        return { asset, estate };
      });
  }, [fixedAssets, realEstates]);

  // Compute Alerts
  const alerts = useMemo(() => {
    const list: { type: 'lease' | 'deed' | 'maintenance'; message: string; propertyName: string; key: string }[] = [];

    realEstateAssets.forEach(({ asset, estate }) => {
      if (estate.ownershipType === 'مؤجر' && estate.leaseEnd) {
        const leaseEnd = new Date(estate.leaseEnd);
        const diffTime = leaseEnd.getTime() - currentDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 30) {
          list.push({
            type: 'lease',
            message: `عقد الإيجار ينتهي خلال ${diffDays} يوم بتاريخ (${estate.leaseEnd})`,
            propertyName: estate.propertyName,
            key: `lease-${estate.id}`
          });
        } else if (diffDays < 0) {
          list.push({
            type: 'lease',
            message: `عقد الإيجار منتهي تماماً منذ ${Math.abs(diffDays)} يوم (${estate.leaseEnd})`,
            propertyName: estate.propertyName,
            key: `lease-${estate.id}`
          });
        }
      }

      if (!estate.deedNumber || estate.deedNumber.trim() === '') {
        list.push({
          type: 'deed',
          message: 'مستند صك الملكية / العقد ناقص أو غير مسجل بالنظام',
          propertyName: estate.propertyName,
          key: `deed-${estate.id}`
        });
      }

      const hasPendingMnt = maintenanceRecords.some(m => m.assetId === asset.id && ['مجدولة', 'قيد التنفيذ'].includes(m.status));
      if (asset.status === 'قيد الصيانة' || hasPendingMnt) {
        list.push({
          type: 'maintenance',
          message: 'هذا العقار يتطلب صيانة أو تجري به أعمال صيانة حالياً',
          propertyName: estate.propertyName,
          key: `mnt-${estate.id}`
        });
      }
    });

    return list;
  }, [realEstateAssets, maintenanceRecords, currentDate]);

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>سجل المباني والعقارات والملكيات</h1>
          <p style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>
            متابعة العقارات المملوكة، المكاتب المستأجرة، عقود الإيجار، وصكوك الملكية للشركة
          </p>
        </div>
      </div>

      {/* Alerts Panel */}
      {alerts.length > 0 && (
        <div className="section-card" style={{ border: '1px solid var(--warning)' }}>
          <div className="section-card-header" style={{ background: 'rgba(245, 158, 11, 0.05)' }}>
            <div className="section-card-title" style={{ color: 'var(--warning)' }}>
              <AlertTriangle size={18} /> تنبيهات العقارات وعقود الإيجار والوثائق
            </div>
            <span className="badge pending">{alerts.length} تنبيهات</span>
          </div>
          <div className="section-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {alerts.map(a => (
              <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', background: 'var(--sidebar-hover)', borderRadius: 8, fontSize: '0.85rem' }}>
                <ShieldCheck size={16} color={a.type === 'deed' ? 'var(--danger)' : 'var(--warning)'} />
                <div>
                  <strong style={{ color: 'var(--primary)' }}>{a.propertyName}:</strong> <span style={{ color: 'var(--gray)' }}>{a.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real Estate Table */}
      <div className="section-card">
        <div className="table-responsive">
          <table className="financial-table">
            <thead>
              <tr>
                <th>رقم الأصل</th>
                <th>اسم العقار</th>
                <th>نوع العقار</th>
                <th>المدينة</th>
                <th>العنوان بالتفصيل</th>
                <th>المساحة</th>
                <th>رقم الصك / الملكية</th>
                <th>نوع الملكية</th>
                <th>تاريخ التملك</th>
                <th>قيمة الشراء</th>
                <th>القيمة التقديرية</th>
                <th>بداية الإيجار</th>
                <th>نهاية الإيجار</th>
                <th>الإيجار الشهري</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {realEstateAssets.length === 0 ? (
                <tr>
                  <td colSpan={15}>
                    <div className="empty-state">
                      <Building2 size={32} />
                      <span>لا توجد عقارات أو مبانٍ مسجلة حالياً</span>
                    </div>
                  </td>
                </tr>
              ) : (
                realEstateAssets.map(({ asset, estate }) => (
                  <tr key={estate.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{estate.assetId}</td>
                    <td style={{ fontWeight: 700 }}>{estate.propertyName}</td>
                    <td><span className="badge pending">{estate.propertyType}</span></td>
                    <td>{estate.city || asset.branch}</td>
                    <td style={{ fontSize: '0.8rem', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={estate.address || asset.location}>{estate.address || asset.location}</td>
                    <td style={{ fontFamily: 'monospace' }}>{estate.area} م²</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{estate.deedNumber || <span style={{ color: 'var(--danger)' }}>ناقص ⚠️</span>}</td>
                    <td>
                      <span className={`badge ${estate.ownershipType === 'مملوك' ? 'active' : 'pending'}`}>
                        {estate.ownershipType}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>{estate.acquisitionDate || asset.purchaseDate || '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {estate.purchasePrice ? `${estate.purchasePrice.toLocaleString()} د.ل` : `${asset.purchasePrice.toLocaleString()} د.ل`}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 700 }}>
                      {estate.currentEstimatedValue ? `${estate.currentEstimatedValue.toLocaleString()} د.ل` : `${asset.currentValue.toLocaleString()} د.ل`}
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>{estate.leaseStart || '—'}</td>
                    <td style={{ fontSize: '0.78rem', fontWeight: estate.ownershipType === 'مؤجر' ? 700 : 400 }}>{estate.leaseEnd || '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {estate.monthlyRent ? `${estate.monthlyRent.toLocaleString()} د.ل` : '—'}
                    </td>
                    <td>
                      <span className={`badge ${
                        estate.status === 'نشط' || estate.status === 'مؤجر' ? 'active' :
                        estate.status === 'قيد الصيانة' ? 'pending' : 'inactive'
                      }`}>
                        {estate.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
