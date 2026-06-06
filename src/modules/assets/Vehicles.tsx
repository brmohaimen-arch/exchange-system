import { useMemo } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import { Car, AlertTriangle, ShieldAlert } from 'lucide-react';

interface Props {
  showToast: (type: ToastMessage['type'], message: string) => void;
}

export default function Vehicles({ showToast: _showToast }: Props) {
  const { vehicles, fixedAssets, maintenanceRecords } = useSystem();

  // Current Date context: 2026-06-02
  const currentDate = useMemo(() => new Date('2026-06-02'), []);

  // Compute Alerts
  const alerts = useMemo(() => {
    const list: { type: 'insurance' | 'license' | 'maintenance'; message: string; carName: string; key: string }[] = [];
    
    vehicles.forEach(v => {
      // Insurance Check
      if (v.insuranceExpiry) {
        const insExp = new Date(v.insuranceExpiry);
        const diffTime = insExp.getTime() - currentDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 30) {
          list.push({
            type: 'insurance',
            message: `تأمين السيارة ينتهي خلال ${diffDays} يوم (${v.insuranceExpiry})`,
            carName: v.carName,
            key: `ins-${v.id}`
          });
        } else if (diffDays < 0) {
          list.push({
            type: 'insurance',
            message: `تأمين السيارة منتهي منذ ${Math.abs(diffDays)} يوم (${v.insuranceExpiry})`,
            carName: v.carName,
            key: `ins-${v.id}`
          });
        }
      }

      // License Check
      if (v.licenseExpiry) {
        const licExp = new Date(v.licenseExpiry);
        const diffTime = licExp.getTime() - currentDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 30) {
          list.push({
            type: 'license',
            message: `ترخيص السيارة ينتهي خلال ${diffDays} يوم (${v.licenseExpiry})`,
            carName: v.carName,
            key: `lic-${v.id}`
          });
        } else if (diffDays < 0) {
          list.push({
            type: 'license',
            message: `ترخيص السيارة منتهي منذ ${Math.abs(diffDays)} يوم (${v.licenseExpiry})`,
            carName: v.carName,
            key: `lic-${v.id}`
          });
        }
      }

      // Maintenance Check: if asset status is 'قيد الصيانة' or there is a pending maintenance
      const asset = fixedAssets.find(a => a.id === v.assetId);
      const hasPendingMnt = maintenanceRecords.some(m => m.assetId === v.assetId && ['مجدولة', 'قيد التنفيذ'].includes(m.status));
      
      if (asset?.status === 'قيد الصيانة' || hasPendingMnt) {
        list.push({
          type: 'maintenance',
          message: `السيارة تحتاج صيانة أو قيد الصيانة الفعالة حالياً`,
          carName: v.carName,
          key: `mnt-${v.id}`
        });
      }
    });

    return list;
  }, [vehicles, fixedAssets, maintenanceRecords, currentDate]);

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>أسطول سيارات الشركة</h1>
          <p style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>
            متابعة السيارات، التراخيص، التأمين، وسائقي الحركة في فروع الشركة
          </p>
        </div>
      </div>

      {/* Alerts Panel */}
      {alerts.length > 0 && (
        <div className="section-card" style={{ border: '1px solid var(--warning)' }}>
          <div className="section-card-header" style={{ background: 'rgba(245, 158, 11, 0.05)' }}>
            <div className="section-card-title" style={{ color: 'var(--warning)' }}>
              <AlertTriangle size={18} /> إشعارات وتنبيهات السيارات العاجلة
            </div>
            <span className="badge pending">{alerts.length} تنبيهات</span>
          </div>
          <div className="section-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {alerts.map(a => (
              <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', background: 'var(--sidebar-hover)', borderRadius: 8, fontSize: '0.85rem' }}>
                <ShieldAlert size={16} color={a.type === 'maintenance' ? 'var(--danger)' : 'var(--warning)'} />
                <div>
                  <strong style={{ color: 'var(--primary)' }}>{a.carName}:</strong> <span style={{ color: 'var(--gray)' }}>{a.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vehicles Table */}
      <div className="section-card">
        <div className="table-responsive">
          <table className="financial-table">
            <thead>
              <tr>
                <th>رقم الأصل</th>
                <th>اسم السيارة</th>
                <th>رقم اللوحة</th>
                <th>النوع / الموديل</th>
                <th>سنة الصنع</th>
                <th>رقم الهيكل VIN</th>
                <th>رقم المحرك</th>
                <th>اللون</th>
                <th>عداد (كم)</th>
                <th>تاريخ التأمين</th>
                <th>تاريخ الترخيص</th>
                <th>السائق المسؤول</th>
                <th>الفرع</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr>
                  <td colSpan={14}>
                    <div className="empty-state">
                      <Car size={32} />
                      <span>لا توجد سيارات مسجلة في النظام حالياً</span>
                    </div>
                  </td>
                </tr>
              ) : (
                vehicles.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{v.assetId}</td>
                    <td style={{ fontWeight: 700 }}>{v.carName}</td>
                    <td style={{ fontWeight: 700 }}>{v.plateNumber || '—'}</td>
                    <td>{v.type} / {v.model || '—'}</td>
                    <td>{v.makeYear || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{v.vin || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{v.engineNumber || '—'}</td>
                    <td>{v.color || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {v.mileage ? v.mileage.toLocaleString() : 0} كم
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>{v.insuranceExpiry || '—'}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--gray)' }}>بدء: {v.insuranceDate || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>{v.licenseExpiry || '—'}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--gray)' }}>بدء: {v.licenseDate || '—'}</div>
                    </td>
                    <td style={{ fontWeight: 500 }}>{v.driver || '—'}</td>
                    <td>{v.branch}</td>
                    <td>
                      <span className={`badge ${
                        v.status === 'نشط' ? 'active' :
                        v.status === 'قيد الصيانة' ? 'pending' : 'inactive'
                      }`}>
                        {v.status}
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
