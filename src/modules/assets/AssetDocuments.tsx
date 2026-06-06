import { useState, useMemo } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import {
  FileText, Plus, Eye, AlertTriangle, CheckCircle, Clock,
  Upload, X, Download, Search
} from 'lucide-react';
import { AssetDocument } from '../../types';

interface Props {
  showToast: (type: ToastMessage['type'], message: string) => void;
}

const DOC_TYPES: AssetDocument['documentType'][] = ['التأمين', 'الرخصة', 'عقد الملكية', 'عقد الإيجار', 'فاتورة الشراء', 'صورة الأصل', 'مستند الصيانة', 'صور إضافية'];
const DOC_STATUSES = ['ساري', 'قارب على الانتهاء', 'منتهي'];

export default function AssetDocuments({ showToast }: Props) {
  const {
    assetDocuments, fixedAssets, currentRole,
    addAssetDocument, addAuditLog
  } = useSystem();

  const isAdmin = currentRole === 'مدير النظام';

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsDoc, setDetailsDoc] = useState<AssetDocument | null>(null);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [filterType, setFilterType] = useState('الكل');

  // Form
  const [docForm, setDocForm] = useState<{
    assetId: string;
    documentType: AssetDocument['documentType'];
    fileName: string;
    expiryDate: string;
    status: AssetDocument['status'];
    notes: string;
  }>({
    assetId: fixedAssets[0]?.id || '',
    documentType: 'التأمين',
    fileName: '',
    expiryDate: '',
    status: 'ساري',
    notes: '',
  });

  const handleSaveDoc = () => {
    if (!docForm.assetId || !docForm.fileName.trim()) {
      showToast('danger', 'يرجى تعبئة رقم الأصل واسم الملف');
      return;
    }
    const assetName = fixedAssets.find(a => a.id === docForm.assetId)?.name || 'أصل غير معروف';
    addAssetDocument({ ...docForm, assetName });
    addAuditLog(
      'رفع مستند أصل',
      'ASSET_DOCUMENT',
      `تم رفع مستند "${docForm.documentType}" للأصل "${assetName}" - اسم الملف: ${docForm.fileName}`
    );
    showToast('success', 'تم رفع المستند وحفظه بنجاح');
    setShowAddModal(false);
    setDocForm({
      assetId: fixedAssets[0]?.id || '',
      documentType: 'التأمين' as AssetDocument['documentType'],
      fileName: '',
      expiryDate: '',
      status: 'ساري',
      notes: '',
    });
  };

  // Derived data
  const today = new Date();
  const expiringDocs = assetDocuments.filter(d => {
    if (!d.expiryDate) return false;
    const diff = (new Date(d.expiryDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  });
  const expiredDocs = assetDocuments.filter(d => {
    if (!d.expiryDate) return false;
    return new Date(d.expiryDate) < today;
  });

  const filteredDocs = useMemo(() => {
    return assetDocuments.filter(d => {
      const matchSearch = !searchText ||
        d.assetName.toLowerCase().includes(searchText.toLowerCase()) ||
        d.fileName.toLowerCase().includes(searchText.toLowerCase()) ||
        d.documentType.toLowerCase().includes(searchText.toLowerCase());
      const matchStatus = filterStatus === 'الكل' || d.status === filterStatus;
      const matchType = filterType === 'الكل' || d.documentType === filterType;
      return matchSearch && matchStatus && matchType;
    });
  }, [assetDocuments, searchText, filterStatus, filterType]);

  const getStatusColor = (status: string) => {
    if (status === 'ساري') return 'active';
    if (status === 'قارب على الانتهاء') return 'pending';
    return 'inactive';
  };

  const getDaysLeft = (expiryDate?: string) => {
    if (!expiryDate) return null;
    const diff = Math.ceil((new Date(expiryDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>مستندات الأصول</h1>
          <p style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>
            إدارة وثائق التأمين والرخص وعقود الملكية والإيجار لجميع الأصول الثابتة
          </p>
        </div>
        {isAdmin && (
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={16} /> رفع مستند جديد
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', margin: '1.25rem 0' }}>
        {[
          {
            label: 'إجمالي المستندات',
            value: assetDocuments.length,
            icon: <FileText size={20} />,
            color: 'var(--primary)',
          },
          {
            label: 'مستندات سارية',
            value: assetDocuments.filter(d => d.status === 'ساري').length,
            icon: <CheckCircle size={20} />,
            color: 'var(--success)',
          },
          {
            label: 'قاربت على الانتهاء',
            value: expiringDocs.length,
            icon: <Clock size={20} />,
            color: 'var(--warning)',
          },
          {
            label: 'مستندات منتهية',
            value: expiredDocs.length,
            icon: <AlertTriangle size={20} />,
            color: 'var(--danger)',
          },
        ].map((kpi, i) => (
          <div
            key={i}
            className="section-card"
            style={{ padding: '1rem 1.2rem', borderTop: `3px solid ${kpi.color}` }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: kpi.color, marginBottom: '0.4rem' }}>
              {kpi.icon}
              <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{kpi.label}</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'monospace' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Alerts for expiring docs */}
      {expiringDocs.length > 0 && (
        <div style={{
          background: 'var(--warning-bg, #fffbeb)',
          border: '1px solid var(--warning)',
          borderRadius: 10,
          padding: '0.9rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'flex-start'
        }}>
          <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.82rem' }}>
            <strong style={{ color: 'var(--warning)' }}>تنبيه: </strong>
            {expiringDocs.length} مستند(ات) ستنتهي خلال 30 يوماً:&nbsp;
            {expiringDocs.map(d => (
              <span key={d.id} style={{ marginLeft: '0.3rem' }}>
                {d.assetName} ({d.documentType} - {getDaysLeft(d.expiryDate)} يوم)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="section-card" style={{ padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)' }} />
            <input
              className="form-input"
              style={{ paddingRight: '2rem', margin: 0, height: 36 }}
              placeholder="بحث بالاسم أو نوع الوثيقة..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>
          <select
            className="form-select"
            style={{ width: 'auto', height: 36, margin: 0 }}
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="الكل">كل الحالات</option>
            {DOC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            className="form-select"
            style={{ width: 'auto', height: 36, margin: 0 }}
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
          >
            <option value="الكل">كل الأنواع</option>
            {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Documents Table */}
      <div className="section-card">
        <div className="table-responsive">
          <table className="financial-table">
            <thead>
              <tr>
                <th>رقم المستند</th>
                <th>اسم الأصل</th>
                <th>نوع الوثيقة</th>
                <th>اسم الملف</th>
                <th>تاريخ الانتهاء</th>
                <th>الأيام المتبقية</th>
                <th>الحالة</th>
                <th>الملاحظات</th>
                <th style={{ textAlign: 'center' }}>العمليات</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <FileText size={32} />
                      <span>لا توجد مستندات مطابقة لمعايير البحث</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDocs.map(doc => {
                  const daysLeft = getDaysLeft(doc.expiryDate);
                  const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;
                  const isExpired = daysLeft !== null && daysLeft < 0;
                  return (
                    <tr key={doc.id} style={isExpired ? { background: 'rgba(239,68,68,0.04)' } : isExpiringSoon ? { background: 'rgba(245,158,11,0.04)' } : {}}>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--gray)' }}>{doc.id}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{doc.assetName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{doc.assetId}</div>
                      </td>
                      <td>
                        <span style={{
                          background: 'var(--sidebar-hover)',
                          borderRadius: 6,
                          padding: '0.2rem 0.6rem',
                          fontSize: '0.78rem',
                          fontWeight: 600
                        }}>
                          {doc.documentType}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <FileText size={13} color="var(--primary)" />
                          <span style={{ fontSize: '0.8rem' }}>{doc.fileName}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {doc.expiryDate || <span style={{ color: 'var(--gray)' }}>بدون انتهاء</span>}
                      </td>
                      <td>
                        {daysLeft === null ? (
                          <span style={{ color: 'var(--gray)', fontSize: '0.78rem' }}>—</span>
                        ) : isExpired ? (
                          <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.8rem' }}>
                            منتهي منذ {Math.abs(daysLeft)} يوم
                          </span>
                        ) : isExpiringSoon ? (
                          <span style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '0.8rem' }}>
                            {daysLeft} يوم
                          </span>
                        ) : (
                          <span style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600 }}>
                            {daysLeft} يوم
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${getStatusColor(doc.status)}`}>{doc.status}</span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--gray)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.notes}>
                        {doc.notes || '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem' }}
                            title="عرض التفاصيل"
                            onClick={() => { setDetailsDoc(doc); setShowDetailsModal(true); }}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem' }}
                            title="تحميل الملف"
                            onClick={() => showToast('info', `تحميل الملف: ${doc.fileName} (الخاصية ستُفعَّل بعد ربط الـ Backend)`)}
                          >
                            <Download size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Document Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2 className="modal-title">
                <Upload size={18} style={{ marginLeft: '0.4rem' }} />
                رفع مستند جديد
              </h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">الأصل الثابت</label>
                <select
                  className="form-select"
                  value={docForm.assetId}
                  onChange={e => setDocForm(p => ({ ...p, assetId: e.target.value }))}
                >
                  {fixedAssets.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                  ))}
                </select>
              </div>
              <div className="form-group-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">نوع الوثيقة</label>
                  <select
                    className="form-select"
                    value={docForm.documentType}
                    onChange={e => setDocForm(p => ({ ...p, documentType: e.target.value as AssetDocument['documentType'] }))}
                  >
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">الحالة</label>
                  <select
                    className="form-select"
                    value={docForm.status}
                    onChange={e => setDocForm(p => ({ ...p, status: e.target.value as AssetDocument['status'] }))}
                  >
                    {DOC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">اسم الملف</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="مثال: hyundai_insurance_2026.pdf"
                    value={docForm.fileName}
                    onChange={e => setDocForm(p => ({ ...p, fileName: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">تاريخ الانتهاء (اختياري)</label>
                  <input
                    className="form-input"
                    type="date"
                    value={docForm.expiryDate}
                    onChange={e => setDocForm(p => ({ ...p, expiryDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">ملاحظات</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: 60 }}
                  placeholder="أي معلومات إضافية عن المستند..."
                  value={docForm.notes}
                  onChange={e => setDocForm(p => ({ ...p, notes: e.target.value }))}
                />
              </div>
              {/* Simulated file upload zone */}
              <div style={{
                border: '2px dashed var(--border)',
                borderRadius: 10,
                padding: '1.25rem',
                textAlign: 'center',
                color: 'var(--gray)',
                fontSize: '0.82rem',
                cursor: 'pointer',
                background: 'var(--sidebar-hover)'
              }}>
                <Upload size={22} style={{ marginBottom: '0.4rem', opacity: 0.6 }} />
                <div>اسحب الملف هنا أو انقر للرفع</div>
                <div style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>PDF, JPG, PNG - بحد أقصى 10MB</div>
                <div style={{ fontSize: '0.7rem', marginTop: '0.5rem', color: 'var(--primary)' }}>
                  (ستُفعَّل عند ربط الـ Backend)
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleSaveDoc}>
                <Upload size={14} /> حفظ المستند
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && detailsDoc && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 className="modal-title">تفاصيل المستند</h2>
              <button className="modal-close" onClick={() => setShowDetailsModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ fontSize: '0.85rem' }}>
              {/* Status banner */}
              {(() => {
                const daysLeft = getDaysLeft(detailsDoc.expiryDate);
                if (daysLeft !== null && daysLeft < 0) {
                  return (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 8, padding: '0.6rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <AlertTriangle size={15} /> هذا المستند منتهي الصلاحية منذ {Math.abs(daysLeft)} يوم — يرجى التجديد فوراً
                    </div>
                  );
                }
                if (daysLeft !== null && daysLeft <= 30) {
                  return (
                    <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid var(--warning)', color: 'var(--warning)', borderRadius: 8, padding: '0.6rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Clock size={15} /> سينتهي خلال {daysLeft} يوم فقط — يُنصح بالتجديد
                    </div>
                  );
                }
                return null;
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div><span style={{ color: 'var(--gray)' }}>رقم المستند:</span> <strong style={{ fontFamily: 'monospace' }}>{detailsDoc.id}</strong></div>
                <div><span style={{ color: 'var(--gray)' }}>رقم الأصل:</span> <strong style={{ fontFamily: 'monospace' }}>{detailsDoc.assetId}</strong></div>
                <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--gray)' }}>اسم الأصل:</span> <strong>{detailsDoc.assetName}</strong></div>
                <div><span style={{ color: 'var(--gray)' }}>نوع الوثيقة:</span> <strong>{detailsDoc.documentType}</strong></div>
                <div><span style={{ color: 'var(--gray)' }}>الحالة:</span> <span className={`badge ${getStatusColor(detailsDoc.status)}`}>{detailsDoc.status}</span></div>
                <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--gray)' }}>اسم الملف:</span> <strong>{detailsDoc.fileName}</strong></div>
                <div><span style={{ color: 'var(--gray)' }}>تاريخ الانتهاء:</span> <strong>{detailsDoc.expiryDate || '—'}</strong></div>
                <div><span style={{ color: 'var(--gray)' }}>الأيام المتبقية:</span> <strong style={{ color: getDaysLeft(detailsDoc.expiryDate) !== null && getDaysLeft(detailsDoc.expiryDate)! < 0 ? 'var(--danger)' : getDaysLeft(detailsDoc.expiryDate) !== null && getDaysLeft(detailsDoc.expiryDate)! <= 30 ? 'var(--warning)' : 'var(--success)' }}>
                  {detailsDoc.expiryDate ? `${getDaysLeft(detailsDoc.expiryDate)} يوم` : '—'}
                </strong></div>
                {detailsDoc.notes && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--gray)' }}>الملاحظات:</span>
                    <p style={{ margin: '0.25rem 0 0 0', padding: '0.5rem', background: 'var(--sidebar-hover)', borderRadius: 6 }}>{detailsDoc.notes}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDetailsModal(false)}>إغلاق</button>
              <button className="btn btn-primary" onClick={() => showToast('info', `تحميل: ${detailsDoc.fileName}`)}>
                <Download size={14} /> تحميل الملف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
