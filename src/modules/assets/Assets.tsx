import { useState, useMemo } from 'react';
import { useSystem } from '../../context/SystemContext';
import { ToastMessage } from '../../App';
import {
  Building, Plus, Edit3, Trash2, Eye,
  DollarSign, CheckCircle, X, Shuffle
} from 'lucide-react';
import { FixedAsset, RealEstate } from '../../types';

interface Props {
  showToast: (type: ToastMessage['type'], message: string) => void;
}

const ASSET_TYPES = ['سيارة', 'مبنى', 'مكتب', 'أرض', 'مخزن', 'خزنة', 'كمبيوتر', 'كاميرات مراقبة', 'آلة عد نقود', 'طابعة', 'أثاث', 'أخرى'];
const ASSET_CATEGORIES = ['وسائل نقل', 'عقارات', 'آلات ومعدات', 'أجهزة مكتبية وتقنية', 'أثاث وتجهيزات', 'أخرى'];
const STATUSES = ['نشط', 'قيد الصيانة', 'متوقف', 'مباع', 'مؤجر', 'مفقود', 'مستهلك بالكامل'];

export default function Assets({ showToast }: Props) {
  const {
    fixedAssets, vehicles, realEstates, branches, currentRole,
    addAsset, editAsset, disableAsset, sellAsset, transferAsset
  } = useSystem();

  const isAdmin = currentRole === 'مدير النظام';

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Modal control
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferringAssetId, setTransferringAssetId] = useState<string | null>(null);
  
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellingAssetId, setSellingAssetId] = useState<string | null>(null);
  
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsAsset, setDetailsAsset] = useState<FixedAsset | null>(null);

  // Forms state
  const [assetForm, setAssetForm] = useState({
    id: '',
    name: '',
    type: 'سيارة',
    category: 'وسائل نقل',
    branch: 'الإدارة العامة',
    location: '',
    purchaseDate: new Date().toISOString().substring(0, 10),
    purchasePrice: 0,
    currency: 'LYD',
    currentValue: 0,
    status: 'نشط' as FixedAsset['status'],
    responsible: '',
    notes: ''
  });

  // Vehicle details state (nested)
  const [vehicleForm, setVehicleForm] = useState({
    plateNumber: '',
    type: 'صالون',
    model: '',
    makeYear: new Date().getFullYear(),
    vin: '',
    engineNumber: '',
    color: '',
    mileage: 0,
    insuranceDate: '',
    insuranceExpiry: '',
    licenseDate: '',
    licenseExpiry: ''
  });

  // Real estate details state (nested)
  const [estateForm, setEstateForm] = useState({
    propertyName: '',
    propertyType: 'مبنى' as RealEstate['propertyType'],
    city: 'طرابلس',
    address: '',
    area: 0,
    deedNumber: '',
    ownershipType: 'مملوك' as RealEstate['ownershipType'],
    leaseStart: '',
    leaseEnd: '',
    monthlyRent: 0
  });

  // Transfer Form State
  const [transferForm, setTransferForm] = useState({
    toBranch: 'فرع طرابلس',
    toLocation: '',
    responsible: ''
  });

  // Sell Form State
  const [sellForm, setSellForm] = useState({
    price: 0,
    currency: 'LYD',
    buyer: '',
    notes: ''
  });

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return fixedAssets.filter(a => {
      const matchesSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) || a.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || a.type === filterType;
      const matchesBranch = filterBranch === 'all' || a.branch === filterBranch;
      const matchesStatus = filterStatus === 'all' || a.status === filterStatus;
      return matchesSearch && matchesType && matchesBranch && matchesStatus;
    });
  }, [fixedAssets, searchTerm, filterType, filterBranch, filterStatus]);

  // Actions
  const openAddAsset = () => {
    if (!isAdmin) return;
    setEditingAsset(null);
    setAssetForm({
      id: `AST-${Math.floor(Math.random() * 9000 + 1000)}`,
      name: '',
      type: 'سيارة',
      category: 'وسائل نقل',
      branch: branches[0]?.id || 'الإدارة العامة',
      location: '',
      purchaseDate: new Date().toISOString().substring(0, 10),
      purchasePrice: 0,
      currency: 'LYD',
      currentValue: 0,
      status: 'نشط',
      responsible: '',
      notes: ''
    });
    setVehicleForm({
      plateNumber: '',
      type: 'صالون',
      model: '',
      makeYear: new Date().getFullYear(),
      vin: '',
      engineNumber: '',
      color: '',
      mileage: 0,
      insuranceDate: new Date().toISOString().substring(0, 10),
      insuranceExpiry: new Date().toISOString().substring(0, 10),
      licenseDate: new Date().toISOString().substring(0, 10),
      licenseExpiry: new Date().toISOString().substring(0, 10)
    });
    setEstateForm({
      propertyName: '',
      propertyType: 'مبنى',
      city: 'طرابلس',
      address: '',
      area: 0,
      deedNumber: '',
      ownershipType: 'مملوك',
      leaseStart: '',
      leaseEnd: '',
      monthlyRent: 0
    });
    setShowAddEditModal(true);
  };

  const openEditAsset = (asset: FixedAsset) => {
    if (!isAdmin) return;
    setEditingAsset(asset);
    setAssetForm({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      category: asset.category,
      branch: asset.branch,
      location: asset.location,
      purchaseDate: asset.purchaseDate,
      purchasePrice: asset.purchasePrice,
      currency: asset.currency,
      currentValue: asset.currentValue,
      status: asset.status,
      responsible: asset.responsible,
      notes: asset.notes || ''
    });

    if (asset.type === 'سيارة') {
      const v = vehicles.find(v => v.assetId === asset.id);
      if (v) {
        setVehicleForm({
          plateNumber: v.plateNumber,
          type: v.type,
          model: v.model,
          makeYear: v.makeYear,
          vin: v.vin,
          engineNumber: v.engineNumber,
          color: v.color,
          mileage: v.mileage,
          insuranceDate: v.insuranceDate,
          insuranceExpiry: v.insuranceExpiry,
          licenseDate: v.licenseDate,
          licenseExpiry: v.licenseExpiry
        });
      }
    } else if (['مبنى', 'مكتب', 'أرض', 'مخزن'].includes(asset.type)) {
      const e = realEstates.find(e => e.assetId === asset.id);
      if (e) {
        setEstateForm({
          propertyName: e.propertyName,
          propertyType: e.propertyType,
          city: e.city,
          address: e.address,
          area: e.area,
          deedNumber: e.deedNumber,
          ownershipType: e.ownershipType,
          leaseStart: e.leaseStart || '',
          leaseEnd: e.leaseEnd || '',
          monthlyRent: e.monthlyRent || 0
        });
      }
    }
    setShowAddEditModal(true);
  };

  const handleSaveAsset = () => {
    if (!assetForm.name.trim()) {
      showToast('danger', 'يرجى إدخال اسم الأصل');
      return;
    }
    const finalAsset: FixedAsset = {
      ...assetForm,
      currentValue: editingAsset ? assetForm.currentValue : assetForm.purchasePrice
    };

    const details: any = {};
    if (assetForm.type === 'سيارة') {
      details.vehicle = {
        ...vehicleForm,
        carName: assetForm.name,
        driver: assetForm.responsible,
        branch: assetForm.branch
      };
    } else if (['مبنى', 'مكتب', 'أرض', 'مخزن'].includes(assetForm.type)) {
      details.realEstate = {
        ...estateForm,
        propertyName: assetForm.name,
        propertyType: assetForm.type as any
      };
    }

    if (editingAsset) {
      editAsset(finalAsset, details);
      showToast('success', 'تم تعديل الأصل بنجاح');
    } else {
      addAsset(finalAsset, details);
      showToast('success', 'تمت إضافة الأصل بنجاح');
    }
    setShowAddEditModal(false);
  };

  const handleDisableAsset = (id: string) => {
    if (!isAdmin) return;
    disableAsset(id);
    showToast('info', 'تم تغيير حالة تنشيط الأصل');
  };

  const openTransferAsset = (asset: FixedAsset) => {
    if (!isAdmin) return;
    setTransferringAssetId(asset.id);
    setTransferForm({
      toBranch: asset.branch,
      toLocation: asset.location,
      responsible: asset.responsible
    });
    setShowTransferModal(true);
  };

  const handleTransfer = () => {
    if (transferringAssetId) {
      transferAsset(
        transferringAssetId,
        transferForm.toBranch,
        transferForm.toLocation,
        transferForm.responsible
      );
      showToast('success', 'تم نقل الأصل وتحديث المسؤولية');
      setShowTransferModal(false);
    }
  };

  const openSellAsset = (asset: FixedAsset) => {
    if (!isAdmin) return;
    setSellingAssetId(asset.id);
    setSellForm({
      price: asset.currentValue,
      currency: asset.currency,
      buyer: '',
      notes: ''
    });
    setShowSellModal(true);
  };

  const handleSell = () => {
    if (!sellForm.buyer.trim() || sellForm.price <= 0) {
      showToast('danger', 'يرجى إدخال اسم المشتري وقيمة البيع');
      return;
    }
    if (sellingAssetId) {
      sellAsset(
        sellingAssetId,
        sellForm.price,
        sellForm.currency,
        sellForm.buyer,
        sellForm.notes
      );
      showToast('success', 'تم تسجيل بيع الأصل بنجاح');
      setShowSellModal(false);
    }
  };

  const openDetails = (asset: FixedAsset) => {
    setDetailsAsset(asset);
    setShowDetailsModal(true);
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>إدارة الأصول الثابتة</h1>
          <p style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>
            قائمة بجميع الأصول الثابتة ومعدات الشركة وإجراء العمليات عليها
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAddAsset}>
            <Plus size={16} /> إضافة أصل جديد
          </button>
        )}
      </div>

      {/* Filters Box */}
      <div className="section-card">
        <div className="section-card-body">
          <div className="form-group-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="form-group">
              <label className="form-label">البحث باسم أو رقم الأصل</label>
              <input
                className="form-input"
                type="text"
                placeholder="ابحث..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">نوع الأصل</label>
              <select className="form-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="all">جميع الأنواع</option>
                {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">الفرع</label>
              <select className="form-select" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
                <option value="all">جميع الفروع</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">الحالة</label>
              <select className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">جميع الحالات</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Assets Table */}
      <div className="section-card">
        <div className="table-responsive">
          <table className="financial-table">
            <thead>
              <tr>
                <th>رقم الأصل</th>
                <th>اسم الأصل</th>
                <th>النوع / التصنيف</th>
                <th>الفرع / الموقع</th>
                <th>تاريخ الشراء</th>
                <th>قيمة الشراء</th>
                <th>القيمة الدفترية الحالية</th>
                <th>الحالة</th>
                <th>المسؤول</th>
                <th style={{ textAlign: 'center' }}>العمليات</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">
                      <Building size={32} />
                      <span>لا توجد أصول ثابتة مطابقة للفلاتر الحالية</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAssets.map(asset => (
                  <tr key={asset.id} style={{ opacity: asset.status === 'متوقف' ? 0.6 : 1 }}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{asset.id}</td>
                    <td style={{ fontWeight: 700 }}>{asset.name}</td>
                    <td>
                      <div>{asset.type}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>{asset.category}</div>
                    </td>
                    <td>
                      <div>{asset.branch}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>{asset.location || '—'}</div>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>{asset.purchaseDate}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {asset.purchasePrice.toLocaleString()} {asset.currency}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                      {asset.currentValue.toLocaleString()} {asset.currency}
                    </td>
                    <td>
                      <span className={`badge ${
                        asset.status === 'نشط' || asset.status === 'مؤجر' ? 'active' :
                        asset.status === 'قيد الصيانة' ? 'pending' : 'inactive'
                      }`}>
                        {asset.status}
                      </span>
                    </td>
                    <td>{asset.responsible || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                        <button className="btn btn-secondary" style={{ padding: '0.35rem' }} title="عرض التفاصيل" onClick={() => openDetails(asset)}>
                          <Eye size={14} />
                        </button>
                        {isAdmin && asset.status !== 'مباع' && (
                          <>
                            <button className="btn btn-secondary" style={{ padding: '0.35rem' }} title="تعديل" onClick={() => openEditAsset(asset)}>
                              <Edit3 size={14} />
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '0.35rem' }} title="نقل الملكية/الفرع" onClick={() => openTransferAsset(asset)}>
                              <Shuffle size={14} />
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '0.35rem', color: 'var(--danger)' }} title="بيع الأصل" onClick={() => openSellAsset(asset)}>
                              <DollarSign size={14} />
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '0.35rem' }} title={asset.status === 'متوقف' ? 'تفعيل' : 'تعطيل'} onClick={() => handleDisableAsset(asset.id)}>
                              <Trash2 size={14} color={asset.status === 'متوقف' ? 'var(--success)' : 'var(--danger)'} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Asset Modal */}
      {showAddEditModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 750 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editingAsset ? 'تعديل بيانات الأصل' : 'إضافة أصل ثابت جديد'}</h2>
              <button className="modal-close" onClick={() => setShowAddEditModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              <div className="form-group-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">رقم الأصل (تلقائي)</label>
                  <input className="form-input" type="text" value={assetForm.id} disabled />
                </div>
                <div className="form-group">
                  <label className="form-label">اسم الأصل</label>
                  <input
                    className="form-input" type="text"
                    value={assetForm.name}
                    onChange={e => setAssetForm(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">نوع الأصل</label>
                  <select
                    className="form-select"
                    value={assetForm.type}
                    onChange={e => {
                      const type = e.target.value;
                      let cat = 'أخرى';
                      if (type === 'سيارة') cat = 'وسائل نقل';
                      else if (['مبنى', 'مكتب', 'أرض', 'مخزن'].includes(type)) cat = 'عقارات';
                      else if (['خزنة', 'آلة عد نقود'].includes(type)) cat = 'آلات ومعدات';
                      else if (['كمبيوتر', 'كاميرات مراقبة', 'طابعة'].includes(type)) cat = 'أجهزة مكتبية وتقنية';
                      setAssetForm(p => ({ ...p, type, category: cat }));
                    }}
                  >
                    {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">التصنيف</label>
                  <select
                    className="form-select"
                    value={assetForm.category}
                    onChange={e => setAssetForm(p => ({ ...p, category: e.target.value }))}
                  >
                    {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">الفرع المسؤول</label>
                  <select
                    className="form-select"
                    value={assetForm.branch}
                    onChange={e => setAssetForm(p => ({ ...p, branch: e.target.value }))}
                  >
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">موقع الأصل بالتفصيل</label>
                  <input
                    className="form-input" type="text" placeholder="مثال: الدور الأرضي / كاونتر 3"
                    value={assetForm.location}
                    onChange={e => setAssetForm(p => ({ ...p, location: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">تاريخ الشراء / التملك</label>
                  <input
                    className="form-input" type="date"
                    value={assetForm.purchaseDate}
                    onChange={e => setAssetForm(p => ({ ...p, purchaseDate: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">قيمة الشراء</label>
                  <input
                    className="form-input" type="number"
                    value={assetForm.purchasePrice || ''}
                    onChange={e => setAssetForm(p => ({ ...p, purchasePrice: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">العملة</label>
                  <select
                    className="form-select"
                    value={assetForm.currency}
                    onChange={e => setAssetForm(p => ({ ...p, currency: e.target.value }))}
                  >
                    <option value="LYD">دينار ليبي</option>
                    <option value="USD">دولار أمريكي</option>
                    <option value="EUR">يورو</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">الموظف المسؤول</label>
                  <input
                    className="form-input" type="text"
                    value={assetForm.responsible}
                    onChange={e => setAssetForm(p => ({ ...p, responsible: e.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">ملاحظات عامة</label>
                  <textarea
                    className="form-input" style={{ minHeight: 60 }}
                    value={assetForm.notes}
                    onChange={e => setAssetForm(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>
              </div>

              {/* Vehicle specific fields */}
              {assetForm.type === 'سيارة' && (
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--primary)' }}>تفاصيل المركبة الإضافية</h3>
                  <div className="form-group-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <div className="form-group">
                      <label className="form-label">رقم اللوحة</label>
                      <input className="form-input" type="text" value={vehicleForm.plateNumber} onChange={e => setVehicleForm(p => ({ ...p, plateNumber: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">الموديل</label>
                      <input className="form-input" type="text" placeholder="إلنترا / هايلوكس" value={vehicleForm.model} onChange={e => setVehicleForm(p => ({ ...p, model: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">سنة الصنع</label>
                      <input className="form-input" type="number" value={vehicleForm.makeYear} onChange={e => setVehicleForm(p => ({ ...p, makeYear: parseInt(e.target.value) || 2024 }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">رقم الهيكل VIN</label>
                      <input className="form-input" type="text" value={vehicleForm.vin} onChange={e => setVehicleForm(p => ({ ...p, vin: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">رقم المحرك</label>
                      <input className="form-input" type="text" value={vehicleForm.engineNumber} onChange={e => setVehicleForm(p => ({ ...p, engineNumber: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">اللون</label>
                      <input className="form-input" type="text" value={vehicleForm.color} onChange={e => setVehicleForm(p => ({ ...p, color: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">عداد الكيلومترات</label>
                      <input className="form-input" type="number" value={vehicleForm.mileage || ''} onChange={e => setVehicleForm(p => ({ ...p, mileage: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">تاريخ انتهاء التأمين</label>
                      <input className="form-input" type="date" value={vehicleForm.insuranceExpiry} onChange={e => setVehicleForm(p => ({ ...p, insuranceExpiry: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">تاريخ انتهاء الترخيص</label>
                      <input className="form-input" type="date" value={vehicleForm.licenseExpiry} onChange={e => setVehicleForm(p => ({ ...p, licenseExpiry: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {/* Real Estate specific fields */}
              {['مبنى', 'مكتب', 'أرض', 'مخزن'].includes(assetForm.type) && (
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--primary)' }}>تفاصيل العقار والملكية</h3>
                  <div className="form-group-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <div className="form-group">
                      <label className="form-label">المدينة</label>
                      <input className="form-input" type="text" value={estateForm.city} onChange={e => setEstateForm(p => ({ ...p, city: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">العنوان الكامل</label>
                      <input className="form-input" type="text" value={estateForm.address} onChange={e => setEstateForm(p => ({ ...p, address: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">المساحة (م²)</label>
                      <input className="form-input" type="number" value={estateForm.area || ''} onChange={e => setEstateForm(p => ({ ...p, area: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">رقم الصك / الملكية</label>
                      <input className="form-input" type="text" value={estateForm.deedNumber} onChange={e => setEstateForm(p => ({ ...p, deedNumber: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">نوع الملكية</label>
                      <select className="form-select" value={estateForm.ownershipType} onChange={e => setEstateForm(p => ({ ...p, ownershipType: e.target.value as any }))}>
                        <option value="مملوك">مملوك للشركة</option>
                        <option value="مؤجر">مستأجر (مؤجر للشركة)</option>
                      </select>
                    </div>
                    
                    {estateForm.ownershipType === 'مؤجر' && (
                      <>
                        <div className="form-group">
                          <label className="form-label">تاريخ بداية الإيجار</label>
                          <input className="form-input" type="date" value={estateForm.leaseStart} onChange={e => setEstateForm(p => ({ ...p, leaseStart: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">تاريخ نهاية الإيجار</label>
                          <input className="form-input" type="date" value={estateForm.leaseEnd} onChange={e => setEstateForm(p => ({ ...p, leaseEnd: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">الإيجار الشهري</label>
                          <input className="form-input" type="number" value={estateForm.monthlyRent || ''} onChange={e => setEstateForm(p => ({ ...p, monthlyRent: parseFloat(e.target.value) || 0 }))} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddEditModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleSaveAsset}>
                <CheckCircle size={16} /> حفظ البيانات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Asset Modal */}
      {showTransferModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2 className="modal-title">نقل عهدة / موقع الأصل</h2>
              <button className="modal-close" onClick={() => setShowTransferModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">الفرع الوجهة</label>
                <select className="form-select" value={transferForm.toBranch} onChange={e => setTransferForm(p => ({ ...p, toBranch: e.target.value }))}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">الموقع الجديد</label>
                <input className="form-input" type="text" placeholder="مثال: مكتب الإدارة العامة الجديد" value={transferForm.toLocation} onChange={e => setTransferForm(p => ({ ...p, toLocation: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">المسؤول الجديد</label>
                <input className="form-input" type="text" placeholder="اسم الموظف المسؤول" value={transferForm.responsible} onChange={e => setTransferForm(p => ({ ...p, responsible: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTransferModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleTransfer}>تأكيد النقل</button>
            </div>
          </div>
        </div>
      )}

      {/* Sell Asset Modal */}
      {showSellModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 450 }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--danger)' }}>
              <h2 className="modal-title" style={{ color: 'var(--danger)' }}>تسجيل بيع الأصل الثابت</h2>
              <button className="modal-close" onClick={() => setShowSellModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: 8, fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                تحذير: بيع الأصل سيعني إخراجه من دفاتر الشركة وتصفية قيمته الدفترية إلى الصفر.
              </div>
              <div className="form-group">
                <label className="form-label">سعر البيع المتفق عليه</label>
                <input className="form-input" type="number" value={sellForm.price || ''} onChange={e => setSellForm(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="form-group">
                <label className="form-label">العملة</label>
                <select className="form-select" value={sellForm.currency} onChange={e => setSellForm(p => ({ ...p, currency: e.target.value }))}>
                  <option value="LYD">دينار ليبي</option>
                  <option value="USD">دولار أمريكي</option>
                  <option value="EUR">يورو</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">اسم المشتري / الجهة المشترية</label>
                <input className="form-input" type="text" placeholder="اسم المشتري" value={sellForm.buyer} onChange={e => setSellForm(p => ({ ...p, buyer: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">ملاحظات البيع</label>
                <input className="form-input" type="text" placeholder="أدخل أي ملاحظات (مثل رقم الشيك)" value={sellForm.notes} onChange={e => setSellForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSellModal(false)}>إلغاء</button>
              <button className="btn btn-danger" onClick={handleSell}>تأكيد عملية البيع</button>
            </div>
          </div>
        </div>
      )}

      {/* Details View Modal */}
      {showDetailsModal && detailsAsset && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2 className="modal-title">تفاصيل الأصل الثابت: {detailsAsset.name}</h2>
              <button className="modal-close" onClick={() => setShowDetailsModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', fontSize: '0.85rem' }}>
                <div><span style={{ color: 'var(--gray)' }}>رقم الأصل:</span> <strong>{detailsAsset.id}</strong></div>
                <div><span style={{ color: 'var(--gray)' }}>نوع الأصل:</span> <strong>{detailsAsset.type}</strong></div>
                <div><span style={{ color: 'var(--gray)' }}>التصنيف:</span> <span>{detailsAsset.category}</span></div>
                <div><span style={{ color: 'var(--gray)' }}>الفرع:</span> <span>{detailsAsset.branch}</span></div>
                <div><span style={{ color: 'var(--gray)' }}>الموقع:</span> <span>{detailsAsset.location || 'غير محدد'}</span></div>
                <div><span style={{ color: 'var(--gray)' }}>تاريخ الشراء:</span> <span>{detailsAsset.purchaseDate}</span></div>
                <div><span style={{ color: 'var(--gray)' }}>قيمة الشراء:</span> <span>{detailsAsset.purchasePrice.toLocaleString()} {detailsAsset.currency}</span></div>
                <div><span style={{ color: 'var(--gray)' }}>القيمة الحالية:</span> <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{detailsAsset.currentValue.toLocaleString()} {detailsAsset.currency}</span></div>
                <div><span style={{ color: 'var(--gray)' }}>المسؤول:</span> <span>{detailsAsset.responsible || 'لا يوجد'}</span></div>
                <div><span style={{ color: 'var(--gray)' }}>الحالة:</span> <span className="badge active">{detailsAsset.status}</span></div>
                <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--gray)' }}>ملاحظات:</span> <p style={{ margin: '0.25rem 0 0 0', padding: '0.5rem', background: 'var(--sidebar-hover)', borderRadius: 6 }}>{detailsAsset.notes || 'لا يوجد ملاحظات مسجلة'}</p></div>
              </div>

              {/* Nested info */}
              {detailsAsset.type === 'سيارة' && (
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 700, marginBottom: '0.5rem' }}>بيانات السيارة الإضافية</h4>
                  {(() => {
                    const v = vehicles.find(v => v.assetId === detailsAsset.id);
                    if (!v) return <p style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>لم يتم إدخال تفاصيل السيارة</p>;
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', fontSize: '0.82rem' }}>
                        <div><span style={{ color: 'var(--gray)' }}>رقم اللوحة:</span> <strong>{v.plateNumber}</strong></div>
                        <div><span style={{ color: 'var(--gray)' }}>الموديل:</span> <span>{v.model} ({v.makeYear})</span></div>
                        <div><span style={{ color: 'var(--gray)' }}>رقم الهيكل VIN:</span> <span style={{ fontFamily: 'monospace' }}>{v.vin}</span></div>
                        <div><span style={{ color: 'var(--gray)' }}>العداد:</span> <span>{v.mileage?.toLocaleString()} كم</span></div>
                        <div><span style={{ color: 'var(--gray)' }}>انتهاء التأمين:</span> <span>{v.insuranceExpiry}</span></div>
                        <div><span style={{ color: 'var(--gray)' }}>انتهاء الترخيص:</span> <span>{v.licenseExpiry}</span></div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {['مبنى', 'مكتب', 'أرض', 'مخزن'].includes(detailsAsset.type) && (
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 700, marginBottom: '0.5rem' }}>بيانات العقار الإضافية</h4>
                  {(() => {
                    const e = realEstates.find(e => e.assetId === detailsAsset.id);
                    if (!e) return <p style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>لم يتم إدخال تفاصيل العقار</p>;
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', fontSize: '0.82rem' }}>
                        <div><span style={{ color: 'var(--gray)' }}>المدينة / العنوان:</span> <span>{e.city} - {e.address}</span></div>
                        <div><span style={{ color: 'var(--gray)' }}>المساحة:</span> <span>{e.area} م²</span></div>
                        <div><span style={{ color: 'var(--gray)' }}>رقم الصك/الملكية:</span> <span>{e.deedNumber}</span></div>
                        <div><span style={{ color: 'var(--gray)' }}>نوع التملك:</span> <strong style={{ color: e.ownershipType === 'مملوك' ? 'var(--success)' : 'var(--warning)' }}>{e.ownershipType}</strong></div>
                        {e.ownershipType === 'مؤجر' && (
                          <>
                            <div><span style={{ color: 'var(--gray)' }}>عقد الإيجار ينتهي:</span> <span>{e.leaseEnd}</span></div>
                            <div><span style={{ color: 'var(--gray)' }}>الإيجار الشهري:</span> <span>{e.monthlyRent?.toLocaleString()} د.ل</span></div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDetailsModal(false)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
