'use client'

import { useEffect, useMemo, useState, FormEvent } from 'react'
import { Plus, Pencil, Wrench, Car, Building2, Package, X, Loader2, CheckCircle2, DollarSign, ArrowRightLeft, FileText, TrendingDown } from 'lucide-react'
import { api, newId, FixedAsset, Vehicle, RealEstate, MaintenanceRecord, Currency, AssetDocument, DepreciationRecord } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'
import { TablePagination, paginate } from '@/components/TablePagination'

interface BranchLite { id: string; name: string }

const assetStatusClass: Record<string, string> = {
  'نشط': 'bg-success/10 text-success',
  'تم البيع': 'bg-muted text-muted-foreground',
  'مستبعد': 'bg-danger/10 text-danger',
}

const tabs = [
  { key: 'assets', label: 'الأصول الثابتة', icon: Package },
  { key: 'vehicles', label: 'المركبات', icon: Car },
  { key: 'realEstate', label: 'العقارات', icon: Building2 },
  { key: 'maintenance', label: 'سجلات الصيانة', icon: Wrench },
  { key: 'documents', label: 'المستندات', icon: FileText },
  { key: 'depreciation', label: 'الإهلاك', icon: TrendingDown },
] as const

type TabKey = typeof tabs[number]['key']

function emptyAssetForm() {
  return { id: '', name: '', type: 'معدات', category: '', branch: '', location: '', purchaseDate: new Date().toISOString().slice(0, 10), purchasePrice: '', currency: 'LYD', currentValue: '', status: 'نشط', responsible: '', notes: '' }
}

function emptyVehicleForm() {
  return { assetId: '', carName: '', plateNumber: '', type: 'سيدان', model: '', makeYear: String(new Date().getFullYear()), vin: '', engineNumber: '', color: '', mileage: '0', insuranceDate: '', insuranceExpiry: '', licenseDate: '', licenseExpiry: '', driver: '', branch: '', status: 'نشط' }
}

function emptyEstateForm() {
  return { assetId: '', propertyName: '', propertyType: 'مكتب', city: '', address: '', area: '', deedNumber: '', ownershipType: 'مملوك', acquisitionDate: new Date().toISOString().slice(0, 10), purchasePrice: '', currentEstimatedValue: '', leaseStart: '', leaseEnd: '', monthlyRent: '0', status: 'نشط' }
}

function emptyMaintForm() {
  return { assetId: '', maintenanceType: '', date: new Date().toISOString().slice(0, 10), cost: '', currency: 'LYD', provider: '', description: '', responsibleEmployee: '' }
}

function emptySellForm() {
  return { price: '', currency: 'LYD', buyer: '', notes: '' }
}
function emptyTransferAssetForm() {
  return { toBranch: '', toLocation: '', responsible: '' }
}
function emptyDocumentForm() {
  return { assetId: '', documentType: '', fileName: '', expiryDate: '', status: 'ساري', notes: '' }
}

export default function AssetsPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('إدارة الأصول')

  const [tab, setTab] = useState<TabKey>('assets')
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [estates, setEstates] = useState<RealEstate[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([])
  const [branches, setBranches] = useState<BranchLite[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showAssetModal, setShowAssetModal] = useState(false)
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null)
  const [assetForm, setAssetForm] = useState(emptyAssetForm())

  const [showVehicleModal, setShowVehicleModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm())

  const [showEstateModal, setShowEstateModal] = useState(false)
  const [editingEstate, setEditingEstate] = useState<RealEstate | null>(null)
  const [estateForm, setEstateForm] = useState(emptyEstateForm())

  const [showMaintModal, setShowMaintModal] = useState(false)
  const [maintForm, setMaintForm] = useState(emptyMaintForm())

  const [sellingAsset, setSellingAsset] = useState<FixedAsset | null>(null)
  const [sellForm, setSellForm] = useState(emptySellForm())
  const [sellError, setSellError] = useState('')

  const [transferringAsset, setTransferringAsset] = useState<FixedAsset | null>(null)
  const [transferAssetForm, setTransferAssetForm] = useState(emptyTransferAssetForm())
  const [transferAssetError, setTransferAssetError] = useState('')

  const [documents, setDocuments] = useState<AssetDocument[]>([])
  const [depreciation, setDepreciation] = useState<DepreciationRecord[]>([])
  const [showDocModal, setShowDocModal] = useState(false)
  const [docForm, setDocForm] = useState(emptyDocumentForm())
  const [docFormError, setDocFormError] = useState('')

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [completingMaint, setCompletingMaint] = useState<MaintenanceRecord | null>(null)
  const [finalCostInput, setFinalCostInput] = useState('')
  const [completeError, setCompleteError] = useState('')
  const [completingSaving, setCompletingSaving] = useState(false)

  const sortedAssets = useMemo(() => [...assets].sort((a, b) => (a.purchaseDate < b.purchaseDate ? 1 : -1)), [assets])
  const sortedVehicles = useMemo(() => [...vehicles].reverse(), [vehicles])
  const sortedEstates = useMemo(() => [...estates].sort((a, b) => (a.acquisitionDate < b.acquisitionDate ? 1 : -1)), [estates])
  const sortedMaintenance = useMemo(() => [...maintenance].sort((a, b) => (a.date < b.date ? 1 : -1)), [maintenance])
  const sortedAssetDocs = useMemo(() => [...documents].reverse(), [documents])
  const sortedDepreciation = useMemo(() => [...depreciation].sort((a, b) => (a.lastCalculatedDate < b.lastCalculatedDate ? 1 : -1)), [depreciation])

  const [assetsPage, setAssetsPage] = useState(1)
  const [vehiclesPage, setVehiclesPage] = useState(1)
  const [estatesPage, setEstatesPage] = useState(1)
  const [maintenancePage, setMaintenancePage] = useState(1)
  const [assetDocsPage, setAssetDocsPage] = useState(1)
  const [depreciationPage, setDepreciationPage] = useState(1)

  const pagedAssets = paginate(sortedAssets, assetsPage)
  const pagedVehicles = paginate(sortedVehicles, vehiclesPage)
  const pagedEstates = paginate(sortedEstates, estatesPage)
  const pagedMaintenance = paginate(sortedMaintenance, maintenancePage)
  const pagedAssetDocs = paginate(sortedAssetDocs, assetDocsPage)
  const pagedDepreciation = paginate(sortedDepreciation, depreciationPage)

  const load = async () => {
    try {
      const [a, v, r, m, b, c, d, dep] = await Promise.all([
        api.get<FixedAsset[]>('/assets'),
        api.get<Vehicle[]>('/vehicles'),
        api.get<RealEstate[]>('/real_estates'),
        api.get<MaintenanceRecord[]>('/maintenance_records'),
        api.get<BranchLite[]>('/branches'),
        api.get<Currency[]>('/currencies'),
        api.get<AssetDocument[]>('/asset_documents'),
        api.get<DepreciationRecord[]>('/depreciation_records'),
      ])
      setAssets(a); setVehicles(v); setEstates(r); setMaintenance(m); setBranches(b); setCurrencies(c)
      setDocuments(d); setDepreciation(dep)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات الأصول')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ---------------- Fixed Assets ----------------
  const openCreateAsset = () => {
    setEditingAsset(null)
    setAssetForm(emptyAssetForm())
    setFormError('')
    setShowAssetModal(true)
  }
  const openEditAsset = (a: FixedAsset) => {
    setEditingAsset(a)
    setAssetForm({
      id: a.id, name: a.name, type: a.type, category: a.category, branch: a.branch, location: a.location,
      purchaseDate: a.purchaseDate, purchasePrice: String(a.purchasePrice), currency: a.currency,
      currentValue: String(a.currentValue), status: a.status, responsible: a.responsible, notes: a.notes || '',
    })
    setFormError('')
    setShowAssetModal(true)
  }
  const submitAsset = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!assetForm.name.trim() || !assetForm.branch || !assetForm.purchasePrice) {
      setFormError('الاسم والفرع وسعر الشراء حقول مطلوبة')
      return
    }
    setSaving(true)
    const payload = {
      id: editingAsset?.id || newId('asset'),
      name: assetForm.name.trim(),
      type: assetForm.type,
      category: assetForm.category.trim() || assetForm.type,
      branch: assetForm.branch,
      location: assetForm.location.trim(),
      purchase_date: assetForm.purchaseDate,
      purchase_price: parseFloat(assetForm.purchasePrice) || 0,
      currency: assetForm.currency,
      current_value: parseFloat(assetForm.currentValue) || parseFloat(assetForm.purchasePrice) || 0,
      status: assetForm.status,
      responsible: assetForm.responsible.trim(),
      notes: assetForm.notes.trim() || null,
    }
    try {
      if (editingAsset) await api.put(`/assets/${editingAsset.id}`, payload)
      else await api.post('/assets', payload)
      setShowAssetModal(false)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذر حفظ الأصل')
    } finally {
      setSaving(false)
    }
  }

  // ---------------- Vehicles ----------------
  const openEditVehicle = (v: Vehicle) => {
    setEditingVehicle(v)
    setVehicleForm({
      assetId: v.assetId, carName: v.carName, plateNumber: v.plateNumber, type: v.type, model: v.model,
      makeYear: String(v.makeYear), vin: v.vin, engineNumber: v.engineNumber, color: v.color, mileage: String(v.mileage),
      insuranceDate: v.insuranceDate, insuranceExpiry: v.insuranceExpiry, licenseDate: v.licenseDate, licenseExpiry: v.licenseExpiry,
      driver: v.driver, branch: v.branch, status: v.status,
    })
    setFormError('')
    setShowVehicleModal(true)
  }

  const submitVehicle = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!vehicleForm.assetId || !vehicleForm.carName.trim() || !vehicleForm.plateNumber.trim()) {
      setFormError('الأصل المرتبط واسم السيارة ورقم اللوحة حقول مطلوبة')
      return
    }
    setSaving(true)
    const payload = {
      asset_id: vehicleForm.assetId,
      car_name: vehicleForm.carName.trim(),
      plate_number: vehicleForm.plateNumber.trim(),
      type: vehicleForm.type,
      model: vehicleForm.model.trim(),
      make_year: parseInt(vehicleForm.makeYear) || new Date().getFullYear(),
      vin: vehicleForm.vin.trim(),
      engine_number: vehicleForm.engineNumber.trim(),
      color: vehicleForm.color.trim(),
      mileage: parseInt(vehicleForm.mileage) || 0,
      insurance_date: vehicleForm.insuranceDate,
      insurance_expiry: vehicleForm.insuranceExpiry,
      license_date: vehicleForm.licenseDate,
      license_expiry: vehicleForm.licenseExpiry,
      driver: vehicleForm.driver.trim(),
      branch: vehicleForm.branch,
      status: vehicleForm.status,
    }
    try {
      if (editingVehicle) await api.put(`/vehicles/${editingVehicle.id}`, { id: editingVehicle.id, ...payload })
      else await api.post('/vehicles', { id: newId('veh'), ...payload })
      setShowVehicleModal(false)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذر حفظ المركبة')
    } finally {
      setSaving(false)
    }
  }

  // ---------------- Real Estate ----------------
  const openEditEstate = (r: RealEstate) => {
    setEditingEstate(r)
    setEstateForm({
      assetId: r.assetId, propertyName: r.propertyName, propertyType: r.propertyType, city: r.city, address: r.address,
      area: String(r.area), deedNumber: r.deedNumber, ownershipType: r.ownershipType, acquisitionDate: r.acquisitionDate,
      purchasePrice: String(r.purchasePrice), currentEstimatedValue: String(r.currentEstimatedValue),
      leaseStart: r.leaseStart || '', leaseEnd: r.leaseEnd || '', monthlyRent: String(r.monthlyRent), status: r.status,
    })
    setFormError('')
    setShowEstateModal(true)
  }

  const submitEstate = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!estateForm.assetId || !estateForm.propertyName.trim() || !estateForm.city.trim()) {
      setFormError('الأصل المرتبط واسم العقار والمدينة حقول مطلوبة')
      return
    }
    setSaving(true)
    const payload = {
      asset_id: estateForm.assetId,
      property_name: estateForm.propertyName.trim(),
      property_type: estateForm.propertyType,
      city: estateForm.city.trim(),
      address: estateForm.address.trim(),
      area: parseFloat(estateForm.area) || 0,
      deed_number: estateForm.deedNumber.trim(),
      ownership_type: estateForm.ownershipType,
      acquisition_date: estateForm.acquisitionDate,
      purchase_price: parseFloat(estateForm.purchasePrice) || 0,
      current_estimated_value: parseFloat(estateForm.currentEstimatedValue) || 0,
      lease_start: estateForm.leaseStart || null,
      lease_end: estateForm.leaseEnd || null,
      monthly_rent: parseFloat(estateForm.monthlyRent) || 0,
      status: estateForm.status,
    }
    try {
      if (editingEstate) await api.put(`/real_estates/${editingEstate.id}`, { id: editingEstate.id, ...payload })
      else await api.post('/real_estates', { id: newId('re'), ...payload })
      setShowEstateModal(false)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذر حفظ العقار')
    } finally {
      setSaving(false)
    }
  }

  // ---------------- Maintenance ----------------
  const submitMaint = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    const asset = assets.find((a) => a.id === maintForm.assetId)
    if (!asset || !maintForm.maintenanceType.trim() || !maintForm.cost) {
      setFormError('الأصل ونوع الصيانة والتكلفة حقول مطلوبة')
      return
    }
    setSaving(true)
    try {
      // add_maintenance_record repurposes FixedAssetCreate fields — map explicitly to match backend contract
      await api.post('/maintenance_records', {
        id: newId('maint'),
        name: asset.name,
        type: maintForm.maintenanceType.trim(),
        category: maintForm.assetId,
        branch: asset.branch,
        location: '',
        purchase_date: maintForm.date,
        purchase_price: parseFloat(maintForm.cost) || 0,
        currency: maintForm.currency,
        current_value: 0,
        status: 'نشط',
        responsible: maintForm.responsibleEmployee.trim(),
        notes: maintForm.description.trim() || null,
      })
      setShowMaintModal(false)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذر حفظ سجل الصيانة')
    } finally {
      setSaving(false)
    }
  }

  const openCompleteMaintenance = (m: MaintenanceRecord) => {
    setCompletingMaint(m)
    setFinalCostInput(String(m.cost))
    setCompleteError('')
  }

  const submitCompleteMaintenance = async (e: FormEvent) => {
    e.preventDefault()
    if (!completingMaint) return
    setCompleteError('')
    setCompletingSaving(true)
    try {
      await api.post(`/maintenance_records/${completingMaint.id}/complete`, { final_cost: parseFloat(finalCostInput) || completingMaint.cost, notes: null })
      setCompletingMaint(null)
      await load()
    } catch (err) {
      setCompleteError(err instanceof ApiError ? err.message : 'تعذر إكمال سجل الصيانة')
    } finally {
      setCompletingSaving(false)
    }
  }

  // ---------------- Sell / Transfer Asset ----------------
  const openSell = (a: FixedAsset) => {
    setSellingAsset(a)
    setSellForm({ price: '', currency: a.currency, buyer: '', notes: '' })
    setSellError('')
  }

  const submitSell = async (e: FormEvent) => {
    e.preventDefault()
    if (!sellingAsset) return
    setSellError('')
    const price = parseFloat(sellForm.price)
    if (!price || price <= 0 || !sellForm.buyer.trim()) {
      setSellError('السعر واسم المشتري حقول مطلوبة')
      return
    }
    setSaving(true)
    try {
      await api.post(`/assets/${sellingAsset.id}/sell`, {
        price, currency: sellForm.currency, buyer: sellForm.buyer.trim(), notes: sellForm.notes.trim() || null,
      })
      setSellingAsset(null)
      await load()
    } catch (err) {
      setSellError(err instanceof ApiError ? err.message : 'تعذر تسجيل عملية البيع')
    } finally {
      setSaving(false)
    }
  }

  const openTransferAsset = (a: FixedAsset) => {
    setTransferringAsset(a)
    setTransferAssetForm({ toBranch: a.branch, toLocation: a.location, responsible: a.responsible })
    setTransferAssetError('')
  }

  const submitTransferAsset = async (e: FormEvent) => {
    e.preventDefault()
    if (!transferringAsset) return
    setTransferAssetError('')
    if (!transferAssetForm.toBranch || !transferAssetForm.responsible.trim()) {
      setTransferAssetError('الفرع والمسؤول الجديد حقول مطلوبة')
      return
    }
    setSaving(true)
    try {
      await api.post(`/assets/${transferringAsset.id}/transfer`, {
        to_branch: transferAssetForm.toBranch,
        to_location: transferAssetForm.toLocation.trim(),
        responsible: transferAssetForm.responsible.trim(),
      })
      setTransferringAsset(null)
      await load()
    } catch (err) {
      setTransferAssetError(err instanceof ApiError ? err.message : 'تعذر نقل عهدة الأصل')
    } finally {
      setSaving(false)
    }
  }

  // ---------------- Documents ----------------
  const openCreateDoc = () => {
    setDocForm(emptyDocumentForm())
    setDocFormError('')
    setShowDocModal(true)
  }

  const submitDoc = async (e: FormEvent) => {
    e.preventDefault()
    setDocFormError('')
    const asset = assets.find((a) => a.id === docForm.assetId)
    if (!asset || !docForm.documentType.trim() || !docForm.fileName.trim()) {
      setDocFormError('الأصل ونوع المستند واسم الملف حقول مطلوبة')
      return
    }
    setSaving(true)
    try {
      await api.post('/asset_documents', {
        id: newId('adoc'),
        asset_id: asset.id,
        asset_name: asset.name,
        document_type: docForm.documentType.trim(),
        file_name: docForm.fileName.trim(),
        expiry_date: docForm.expiryDate || null,
        status: docForm.status,
        notes: docForm.notes.trim() || null,
      })
      setShowDocModal(false)
      await load()
    } catch (err) {
      setDocFormError(err instanceof ApiError ? err.message : 'تعذر حفظ المستند')
    } finally {
      setSaving(false)
    }
  }

  const docStatusClass: Record<string, string> = {
    'ساري': 'bg-success/10 text-success',
    'قارب على الانتهاء': 'bg-warning/10 text-warning',
    'منتهي': 'bg-danger/10 text-danger',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">الأصول الثابتة</h2>
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'assets' && (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <button onClick={openCreateAsset} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> إضافة أصل جديد
              </button>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">الاسم</th>
                    <th className="px-6 py-4 font-medium">النوع</th>
                    <th className="px-6 py-4 font-medium">الفرع</th>
                    <th className="px-6 py-4 font-medium">تاريخ الشراء</th>
                    <th className="px-6 py-4 font-medium">سعر الشراء</th>
                    <th className="px-6 py-4 font-medium">القيمة الحالية</th>
                    <th className="px-6 py-4 font-medium">المسؤول</th>
                    <th className="px-6 py-4 font-medium">الحالة</th>
                    {canManage && <th className="px-6 py-4 font-medium">إجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={9} className="px-6 py-10 text-center text-muted-foreground">جاري التحميل...</td></tr>
                  ) : assets.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-10 text-center text-muted-foreground">لا توجد أصول مسجلة</td></tr>
                  ) : pagedAssets.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{a.name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{a.type}</td>
                      <td className="px-6 py-4">{a.branch}</td>
                      <td className="px-6 py-4 text-muted-foreground">{a.purchaseDate}</td>
                      <td className="px-6 py-4">{a.purchasePrice.toLocaleString()} {a.currency}</td>
                      <td className="px-6 py-4 font-medium">{a.currentValue.toLocaleString()} {a.currency}</td>
                      <td className="px-6 py-4 text-muted-foreground">{a.responsible}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${assetStatusClass[a.status] || 'bg-muted text-muted-foreground'}`}>{a.status}</span>
                      </td>
                      {canManage && (
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditAsset(a)} title="تعديل" className="text-primary hover:text-primary/80 transition-colors p-1">
                              <Pencil className="h-4 w-4" />
                            </button>
                            {a.status === 'نشط' && (
                              <>
                                <button onClick={() => openTransferAsset(a)} title="نقل عهدة" className="text-muted-foreground hover:text-primary transition-colors p-1">
                                  <ArrowRightLeft className="h-4 w-4" />
                                </button>
                                <button onClick={() => openSell(a)} title="بيع" className="text-muted-foreground hover:text-danger transition-colors p-1">
                                  <DollarSign className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={assetsPage} totalItems={sortedAssets.length} onPageChange={setAssetsPage} />
          </div>
        </div>
      )}

      {tab === 'vehicles' && (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <button onClick={() => { setEditingVehicle(null); setVehicleForm(emptyVehicleForm()); setFormError(''); setShowVehicleModal(true) }} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> إضافة مركبة
              </button>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">السيارة</th>
                    <th className="px-6 py-4 font-medium">اللوحة</th>
                    <th className="px-6 py-4 font-medium">الموديل</th>
                    <th className="px-6 py-4 font-medium">السنة</th>
                    <th className="px-6 py-4 font-medium">السائق</th>
                    <th className="px-6 py-4 font-medium">انتهاء التأمين</th>
                    <th className="px-6 py-4 font-medium">انتهاء الترخيص</th>
                    <th className="px-6 py-4 font-medium">الحالة</th>
                    {canManage && <th className="px-6 py-4 font-medium">إجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vehicles.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-10 text-center text-muted-foreground">لا توجد مركبات مسجلة</td></tr>
                  ) : pagedVehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{v.carName} ({v.color})</td>
                      <td className="px-6 py-4" dir="ltr">{v.plateNumber}</td>
                      <td className="px-6 py-4 text-muted-foreground">{v.model}</td>
                      <td className="px-6 py-4">{v.makeYear}</td>
                      <td className="px-6 py-4">{v.driver}</td>
                      <td className="px-6 py-4 text-muted-foreground">{v.insuranceExpiry}</td>
                      <td className="px-6 py-4 text-muted-foreground">{v.licenseExpiry}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${assetStatusClass[v.status] || 'bg-muted text-muted-foreground'}`}>{v.status}</span>
                      </td>
                      {canManage && (
                        <td className="px-6 py-4">
                          <button onClick={() => openEditVehicle(v)} title="تعديل" className="text-primary hover:text-primary/80 transition-colors p-1">
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={vehiclesPage} totalItems={sortedVehicles.length} onPageChange={setVehiclesPage} />
          </div>
        </div>
      )}

      {tab === 'realEstate' && (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <button onClick={() => { setEditingEstate(null); setEstateForm(emptyEstateForm()); setFormError(''); setShowEstateModal(true) }} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> إضافة عقار
              </button>
            </div>
          )}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {estates.length === 0 ? (
              <p className="text-muted-foreground text-sm">لا توجد عقارات مسجلة</p>
            ) : pagedEstates.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">{r.propertyName}</h3>
                    <span className="text-xs text-muted-foreground">{r.propertyType} — {r.city}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${assetStatusClass[r.status] || 'bg-muted text-muted-foreground'}`}>{r.status}</span>
                    {canManage && (
                      <button onClick={() => openEditEstate(r)} title="تعديل" className="text-muted-foreground hover:text-primary transition-colors p-1">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="pt-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">المساحة</span><span className="font-medium">{r.area} م²</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">نوع الملكية</span><span className="font-medium">{r.ownershipType}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">القيمة التقديرية</span><span className="font-medium">{r.currentEstimatedValue.toLocaleString()}</span></div>
                  {r.monthlyRent > 0 && <div className="flex justify-between"><span className="text-muted-foreground">الإيجار الشهري</span><span className="font-medium">{r.monthlyRent.toLocaleString()}</span></div>}
                </div>
              </div>
            ))}
          </div>
          <TablePagination page={estatesPage} totalItems={sortedEstates.length} onPageChange={setEstatesPage} />
        </div>
      )}

      {tab === 'maintenance' && (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <button onClick={() => { setMaintForm(emptyMaintForm()); setFormError(''); setShowMaintModal(true) }} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> تسجيل صيانة
              </button>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">الأصل</th>
                    <th className="px-6 py-4 font-medium">نوع الصيانة</th>
                    <th className="px-6 py-4 font-medium">التاريخ</th>
                    <th className="px-6 py-4 font-medium">التكلفة</th>
                    <th className="px-6 py-4 font-medium">المسؤول</th>
                    <th className="px-6 py-4 font-medium">الحالة</th>
                    {canManage && <th className="px-6 py-4 font-medium">إجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {maintenance.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">لا توجد سجلات صيانة</td></tr>
                  ) : pagedMaintenance.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{m.assetName}</td>
                      <td className="px-6 py-4">{m.maintenanceType}</td>
                      <td className="px-6 py-4 text-muted-foreground">{m.date}</td>
                      <td className="px-6 py-4">{m.cost.toLocaleString()} {m.currency}</td>
                      <td className="px-6 py-4 text-muted-foreground">{m.responsibleEmployee}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                          ${m.status === 'مكتملة' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{m.status}</span>
                      </td>
                      {canManage && (
                        <td className="px-6 py-4">
                          {m.status !== 'مكتملة' && (
                            <button onClick={() => openCompleteMaintenance(m)} className="flex items-center gap-1 text-success hover:text-success/80 transition-colors text-xs font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" /> إكمال
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={maintenancePage} totalItems={sortedMaintenance.length} onPageChange={setMaintenancePage} />
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <button onClick={openCreateDoc} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> إضافة مستند
              </button>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-medium">الأصل</th>
                    <th className="px-6 py-4 font-medium">نوع المستند</th>
                    <th className="px-6 py-4 font-medium">اسم الملف</th>
                    <th className="px-6 py-4 font-medium">تاريخ الانتهاء</th>
                    <th className="px-6 py-4 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {documents.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">لا توجد مستندات مسجلة</td></tr>
                  ) : pagedAssetDocs.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{d.assetName}</td>
                      <td className="px-6 py-4">{d.documentType}</td>
                      <td className="px-6 py-4 text-muted-foreground">{d.fileName}</td>
                      <td className="px-6 py-4 text-muted-foreground">{d.expiryDate || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${docStatusClass[d.status] || 'bg-muted text-muted-foreground'}`}>{d.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={assetDocsPage} totalItems={sortedAssetDocs.length} onPageChange={setAssetDocsPage} />
          </div>
        </div>
      )}

      {tab === 'depreciation' && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">الأصل</th>
                  <th className="px-6 py-4 font-medium">طريقة الإهلاك</th>
                  <th className="px-6 py-4 font-medium">سعر الشراء</th>
                  <th className="px-6 py-4 font-medium">الإهلاك السنوي</th>
                  <th className="px-6 py-4 font-medium">الإهلاك المتراكم</th>
                  <th className="px-6 py-4 font-medium">القيمة الدفترية الحالية</th>
                  <th className="px-6 py-4 font-medium">آخر تحديث</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {depreciation.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">لا توجد سجلات إهلاك</td></tr>
                ) : pagedDepreciation.map((d) => (
                  <tr key={d.assetId} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{d.assetName}</td>
                    <td className="px-6 py-4 text-muted-foreground">{d.depreciationMethod}</td>
                    <td className="px-6 py-4">{d.purchasePrice.toLocaleString()}</td>
                    <td className="px-6 py-4">{d.annualDepreciation.toLocaleString()}</td>
                    <td className="px-6 py-4 text-danger">{d.accumulatedDepreciation.toLocaleString()}</td>
                    <td className="px-6 py-4 font-bold">{d.currentBookValue.toLocaleString()}</td>
                    <td className="px-6 py-4 text-muted-foreground">{d.lastCalculatedDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={depreciationPage} totalItems={sortedDepreciation.length} onPageChange={setDepreciationPage} />
        </div>
      )}

      {/* Asset Modal */}
      {showAssetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editingAsset ? 'تعديل الأصل' : 'إضافة أصل جديد'}</h3>
              <button onClick={() => setShowAssetModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitAsset} className="space-y-4 p-6 text-right max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">اسم الأصل *</label>
                <input value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">النوع</label>
                  <select value={assetForm.type} onChange={(e) => setAssetForm({ ...assetForm, type: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="سيارة">سيارة</option>
                    <option value="عقار">عقار</option>
                    <option value="أثاث">أثاث</option>
                    <option value="معدات">معدات</option>
                    <option value="أجهزة">أجهزة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الفئة</label>
                  <input value={assetForm.category} onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الفرع *</label>
                  <select value={assetForm.branch} onChange={(e) => setAssetForm({ ...assetForm, branch: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">اختر</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الموقع</label>
                  <input value={assetForm.location} onChange={(e) => setAssetForm({ ...assetForm, location: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">تاريخ الشراء</label>
                  <input type="date" value={assetForm.purchaseDate} onChange={(e) => setAssetForm({ ...assetForm, purchaseDate: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">المسؤول</label>
                  <input value={assetForm.responsible} onChange={(e) => setAssetForm({ ...assetForm, responsible: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">سعر الشراء *</label>
                  <input type="number" value={assetForm.purchasePrice} onChange={(e) => setAssetForm({ ...assetForm, purchasePrice: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
                  <select value={assetForm.currency} onChange={(e) => setAssetForm({ ...assetForm, currency: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">القيمة الحالية</label>
                  <input type="number" value={assetForm.currentValue} onChange={(e) => setAssetForm({ ...assetForm, currentValue: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الحالة</label>
                <select value={assetForm.status} onChange={(e) => setAssetForm({ ...assetForm, status: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="نشط">نشط</option>
                  <option value="مستبعد">مستبعد</option>
                  <option value="تم البيع">تم البيع</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea value={assetForm.notes} onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              {formError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAssetModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vehicle Modal */}
      {showVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editingVehicle ? 'تعديل المركبة' : 'إضافة مركبة'}</h3>
              <button onClick={() => setShowVehicleModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitVehicle} className="space-y-4 p-6 text-right max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الأصل المرتبط *</label>
                <select value={vehicleForm.assetId} onChange={(e) => setVehicleForm({ ...vehicleForm, assetId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">اختر أصلاً مسجلاً مسبقاً</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">اسم السيارة *</label>
                  <input value={vehicleForm.carName} onChange={(e) => setVehicleForm({ ...vehicleForm, carName: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رقم اللوحة *</label>
                  <input value={vehicleForm.plateNumber} onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الموديل</label>
                  <input value={vehicleForm.model} onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">السنة</label>
                  <input type="number" value={vehicleForm.makeYear} onChange={(e) => setVehicleForm({ ...vehicleForm, makeYear: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">اللون</label>
                  <input value={vehicleForm.color} onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">السائق</label>
                  <input value={vehicleForm.driver} onChange={(e) => setVehicleForm({ ...vehicleForm, driver: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الفرع</label>
                  <select value={vehicleForm.branch} onChange={(e) => setVehicleForm({ ...vehicleForm, branch: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">اختر</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">انتهاء التأمين</label>
                  <input type="date" value={vehicleForm.insuranceExpiry} onChange={(e) => setVehicleForm({ ...vehicleForm, insuranceExpiry: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">انتهاء الترخيص</label>
                  <input type="date" value={vehicleForm.licenseExpiry} onChange={(e) => setVehicleForm({ ...vehicleForm, licenseExpiry: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              {formError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowVehicleModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Real Estate Modal */}
      {showEstateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editingEstate ? 'تعديل العقار' : 'إضافة عقار'}</h3>
              <button onClick={() => setShowEstateModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitEstate} className="space-y-4 p-6 text-right max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الأصل المرتبط *</label>
                <select value={estateForm.assetId} onChange={(e) => setEstateForm({ ...estateForm, assetId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">اختر أصلاً مسجلاً مسبقاً</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">اسم العقار *</label>
                  <input value={estateForm.propertyName} onChange={(e) => setEstateForm({ ...estateForm, propertyName: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">المدينة *</label>
                  <input value={estateForm.city} onChange={(e) => setEstateForm({ ...estateForm, city: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">المساحة (م²)</label>
                  <input type="number" value={estateForm.area} onChange={(e) => setEstateForm({ ...estateForm, area: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">نوع الملكية</label>
                  <select value={estateForm.ownershipType} onChange={(e) => setEstateForm({ ...estateForm, ownershipType: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="مملوك">مملوك</option>
                    <option value="مؤجر">مؤجر</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">القيمة التقديرية الحالية</label>
                  <input type="number" value={estateForm.currentEstimatedValue} onChange={(e) => setEstateForm({ ...estateForm, currentEstimatedValue: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الإيجار الشهري (إن وجد)</label>
                  <input type="number" value={estateForm.monthlyRent} onChange={(e) => setEstateForm({ ...estateForm, monthlyRent: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>

              {formError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEstateModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Maintenance Modal */}
      {showMaintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">تسجيل صيانة</h3>
              <button onClick={() => setShowMaintModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitMaint} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الأصل *</label>
                <select value={maintForm.assetId} onChange={(e) => setMaintForm({ ...maintForm, assetId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">اختر أصلاً</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">نوع الصيانة *</label>
                <input value={maintForm.maintenanceType} onChange={(e) => setMaintForm({ ...maintForm, maintenanceType: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">التاريخ</label>
                  <input type="date" value={maintForm.date} onChange={(e) => setMaintForm({ ...maintForm, date: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">التكلفة *</label>
                  <input type="number" value={maintForm.cost} onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">مقدم الخدمة</label>
                <input value={maintForm.provider} onChange={(e) => setMaintForm({ ...maintForm, provider: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الموظف المسؤول</label>
                <input value={maintForm.responsibleEmployee} onChange={(e) => setMaintForm({ ...maintForm, responsibleEmployee: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الوصف</label>
                <textarea value={maintForm.description} onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              {formError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowMaintModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sell Asset Modal */}
      {sellingAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">بيع الأصل: {sellingAsset.name}</h3>
              <button onClick={() => setSellingAsset(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitSell} className="space-y-4 p-6 text-right">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">سعر البيع *</label>
                  <input type="number" value={sellForm.price} onChange={(e) => setSellForm({ ...sellForm, price: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">العملة</label>
                  <select value={sellForm.currency} onChange={(e) => setSellForm({ ...sellForm, currency: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">اسم المشتري *</label>
                <input value={sellForm.buyer} onChange={(e) => setSellForm({ ...sellForm, buyer: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea value={sellForm.notes} onChange={(e) => setSellForm({ ...sellForm, notes: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              {sellError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{sellError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setSellingAsset(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-medium text-danger-foreground hover:bg-danger/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد البيع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Asset Modal */}
      {transferringAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">نقل عهدة: {transferringAsset.name}</h3>
              <button onClick={() => setTransferringAsset(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitTransferAsset} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الفرع الجديد *</label>
                <select value={transferAssetForm.toBranch} onChange={(e) => setTransferAssetForm({ ...transferAssetForm, toBranch: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">اختر</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الموقع الجديد</label>
                <input value={transferAssetForm.toLocation} onChange={(e) => setTransferAssetForm({ ...transferAssetForm, toLocation: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">المسؤول الجديد *</label>
                <input value={transferAssetForm.responsible} onChange={(e) => setTransferAssetForm({ ...transferAssetForm, responsible: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              {transferAssetError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{transferAssetError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setTransferringAsset(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد النقل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">إضافة مستند</h3>
              <button onClick={() => setShowDocModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitDoc} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الأصل *</label>
                <select value={docForm.assetId} onChange={(e) => setDocForm({ ...docForm, assetId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">اختر أصلاً</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">نوع المستند *</label>
                <input value={docForm.documentType} onChange={(e) => setDocForm({ ...docForm, documentType: e.target.value })} placeholder="رخصة، تأمين، سند ملكية..." className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">اسم الملف *</label>
                <input value={docForm.fileName} onChange={(e) => setDocForm({ ...docForm, fileName: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">تاريخ الانتهاء</label>
                  <input type="date" value={docForm.expiryDate} onChange={(e) => setDocForm({ ...docForm, expiryDate: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الحالة</label>
                  <select value={docForm.status} onChange={(e) => setDocForm({ ...docForm, status: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="ساري">ساري</option>
                    <option value="قارب على الانتهاء">قارب على الانتهاء</option>
                    <option value="منتهي">منتهي</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea value={docForm.notes} onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              {docFormError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{docFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowDocModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Maintenance Modal */}
      {completingMaint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">التكلفة النهائية لصيانة "{completingMaint.assetName}"</h3>
              <button onClick={() => setCompletingMaint(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitCompleteMaintenance} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">التكلفة النهائية</label>
                <input
                  type="number"
                  value={finalCostInput}
                  onChange={(e) => setFinalCostInput(e.target.value)}
                  autoFocus
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {completeError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{completeError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCompletingMaint(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={completingSaving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {completingSaving && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
