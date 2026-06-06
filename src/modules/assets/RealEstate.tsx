import { useMemo } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { Building2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface Props {
  showToast: (type: ToastMessage['type'], message: string) => void;
}

export default function RealEstatePage({ showToast: _showToast }: Props) {
  const { realEstates, fixedAssets, maintenanceRecords } = useSystem();

  // Current Date: 2026-06-02
  const currentDate = useMemo(() => new Date('2026-06-02'), []);

  // Compute Alerts
  const alerts = useMemo(() => {
    const list: { type: 'lease' | 'deed' | 'maintenance'; message: string; propertyName: string; key: string }[] = [];

    realEstates.forEach(e => {
      // Lease Expiry Check
      if (e.ownershipType === 'مؤجر' && e.leaseEnd) {
        const leaseEnd = new Date(e.leaseEnd);
        const diffTime = leaseEnd.getTime() - currentDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 30) {
          list.push({
            type: 'lease',
            message: `عقد الإيجار ينتهي خلال ${diffDays} يوم بتاريخ (${e.leaseEnd})`,
            propertyName: e.propertyName,
            key: `lease-${e.id}`
          });
        } else if (diffDays < 0) {
          list.push({
            type: 'lease',
            message: `عقد الإيجار منتهي تماماً منذ ${Math.abs(diffDays)} يوم (${e.leaseEnd})`,
            propertyName: e.propertyName,
            key: `lease-${e.id}`
          });
        }
      }

      // Deed/Ownership Check
      if (!e.deedNumber || e.deedNumber.trim() === '') {
        list.push({
          type: 'deed',
          message: 'مستند صك الملكية / العقد ناقص أو غير مسجل بالنظام',
          propertyName: e.propertyName,
          key: `deed-${e.id}`
        });
      }

      // Maintenance Check
      const asset = fixedAssets.find(a => a.id === e.assetId);
      const hasPendingMnt = maintenanceRecords.some(m => m.assetId === e.assetId && ['مجدولة', 'قيد التنفيذ'].includes(m.status));

      if (asset?.status === 'قيد الصيانة' || hasPendingMnt) {
        list.push({
          type: 'maintenance',
          message: 'هذا العقار يتطلب صيانة أو تجري به أعمال صيانة حالياً',
          propertyName: e.propertyName,
          key: `mnt-${e.id}`
        });
      }
    });

    return list;
  }, [realEstates, fixedAssets, maintenanceRecords, currentDate]);

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
              {realEstates.length === 0 ? (
                <tr>
                  <td colSpan={15}>
                    <div className="empty-state">
                      <Building2 size={32} />
                      <span>لا توجد عقارات أو مبانٍ مسجلة حالياً</span>
                    </div>
                  </td>
                </tr>
              ) : (
                realEstates.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{e.assetId}</td>
                    <td style={{ fontWeight: 700 }}>{e.propertyName}</td>
                    <td><span className="badge pending">{e.propertyType}</span></td>
                    <td>{e.city}</td>
                    <td style={{ fontSize: '0.8rem', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.address}>{e.address}</td>
                    <td style={{ fontFamily: 'monospace' }}>{e.area} م²</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{e.deedNumber || <span style={{ color: 'var(--danger)' }}>ناقص ⚠️</span>}</td>
                    <td>
                      <span className={`badge ${e.ownershipType === 'مملوك' ? 'active' : 'pending'}`}>
                        {e.ownershipType}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>{e.acquisitionDate || '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {e.purchasePrice ? `${e.purchasePrice.toLocaleString()} د.ل` : '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 700 }}>
                      {e.currentEstimatedValue ? `${e.currentEstimatedValue.toLocaleString()} د.ل` : '—'}
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>{e.leaseStart || '—'}</td>
                    <td style={{ fontSize: '0.78rem', fontWeight: e.ownershipType === 'مؤجر' ? 700 : 400 }}>{e.leaseEnd || '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {e.monthlyRent ? `${e.monthlyRent.toLocaleString()} د.ل` : '—'}
                    </td>
                    <td>
                      <span className={`badge ${
                        e.status === 'نشط' || e.status === 'مؤجر' ? 'active' :
                        e.status === 'قيد الصيانة' ? 'pending' : 'inactive'
                      }`}>
                        {e.status}
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
