'use client'

import { useEffect, useMemo, useRef, useState, FormEvent, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Pencil, Trash2, Wrench, Car, Building2, Package, X, Loader2, CheckCircle2, DollarSign, ArrowRightLeft, FileText, TrendingDown, Download, ScanLine, Search } from 'lucide-react'
import { api, newId, openFile, uploadFile, FixedAsset, Vehicle, RealEstate, MaintenanceRecord, Currency, AssetDocument, DepreciationRecord } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'
import { TablePagination, paginate } from '@/components/TablePagination'
import { useConfirm } from '@/components/ConfirmProvider'

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
  return { id: '', name: '', type: 'معدات', category: '', branch: '', location: '', purchaseDate: new Date().toISOString().slice(0, 10), purchasePrice: '', currency: 'LYD', currentValue: '', status: 'نشط', responsible: '', notes: '', color: '', carModel: '', vin: '', makeYear: '' }
}

function emptyVehicleForm() {
  return { assetId: '', carName: '', plateNumber: '', type: 'سيدان', model: '', makeYear: String(new Date().getFullYear()), vin: '', engineNumber: '', color: '', mileage: '0', insuranceDate: '', insuranceExpiry: '', licenseDate: '', licenseExpiry: '', driver: '', branch: '', status: 'نشط', warehouseId: '', barcode: '' }
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
  return { assetId: '', documentType: '', fileName: '', expiryDate: '', status: 'ساري', notes: '', file: null as File | null }
}
function docEditFormFrom(d: AssetDocument) {
  return { documentType: d.documentType, expiryDate: d.expiryDate || '', status: d.status, notes: d.notes || '' }
}

export default function AssetsPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>}>
      <AssetsPageInner />
    </Suspense>
  )
}

function AssetsPageInner() {
  const { hasPermission } = useAuth()
  const confirmDialog = useConfirm()
  const canManage = hasPermission('إدارة الأصول')

  const searchParams = useSearchParams()
  const initialTab = (tabs.find((t) => t.key === searchParams.get('tab'))?.key || 'assets') as TabKey
  const [tab, setTab] = useState<TabKey>(initialTab)
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
  const [vehicleSearch, setVehicleSearch] = useState('')
  const [showScanModal, setShowScanModal] = useState(false)
  const [scanError, setScanError] = useState('')
  const scanVideoRef = useRef<HTMLVideoElement | null>(null)
  const scanStreamRef = useRef<MediaStream | null>(null)

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
  const [editingDoc, setEditingDoc] = useState<AssetDocument | null>(null)
  const [docEditForm, setDocEditForm] = useState(docEditFormFrom({ documentType: '', expiryDate: '', status: '', notes: '' } as AssetDocument))
  const [docEditError, setDocEditError] = useState('')
  const [savingDocEdit, setSavingDocEdit] = useState(false)

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [completingMaint, setCompletingMaint] = useState<MaintenanceRecord | null>(null)
  const [finalCostInput, setFinalCostInput] = useState('')
  const [completeError, setCompleteError] = useState('')
  const [completingSaving, setCompletingSaving] = useState(false)

  const warehouses = useMemo(() => assets.filter((a) => a.type === 'مخزن'), [assets])
  const warehouseName = (id: string | null) => warehouses.find((w) => w.id === id)?.name || null

  const sortedAssets = useMemo(() => [...assets].sort((a, b) => (a.purchaseDate < b.purchaseDate ? 1 : -1)), [assets])
  const sortedVehicles = useMemo(() => {
    const list = [...vehicles].reverse()
    const q = vehicleSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter((v) =>
      v.carName.toLowerCase().includes(q) ||
      v.plateNumber.toLowerCase().includes(q) ||
      (v.barcode || '').toLowerCase().includes(q)
    )
  }, [vehicles, vehicleSearch])
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
      color: a.color || '', carModel: a.carModel || '', vin: a.vin || '', makeYear: a.makeYear ? String(a.makeYear) : '',
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
      color: assetForm.type === 'مخزن' ? (assetForm.color.trim() || null) : null,
      car_model: assetForm.type === 'مخزن' ? (assetForm.carModel.trim() || null) : null,
      vin: assetForm.type === 'مخزن' ? (assetForm.vin.trim() || null) : null,
      make_year: assetForm.type === 'مخزن' && assetForm.makeYear ? parseInt(assetForm.makeYear, 10) : null,
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
      driver: v.driver, branch: v.branch, status: v.status, warehouseId: v.warehouseId || '', barcode: v.barcode || '',
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
      warehouse_id: vehicleForm.warehouseId || null,
      barcode: vehicleForm.barcode.trim() || null,
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

  // Camera barcode scan — for looking an existing vehicle back up by its (manually
  // entered) barcode, never for generating one. Uses the browser's native
  // BarcodeDetector where available; falls back to manual text search otherwise.
  useEffect(() => {
    if (!showScanModal) return
    let cancelled = false
    let rafId = 0

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        scanStreamRef.current = stream
        if (scanVideoRef.current) {
          scanVideoRef.current.srcObject = stream
          await scanVideoRef.current.play()
        }
        const DetectorCtor = (window as any).BarcodeDetector
        if (!DetectorCtor) {
          setScanError('المسح الضوئي غير مدعوم على هذا المتصفح — يرجى إدخال الباركود يدوياً في مربع البحث')
          return
        }
        const detector = new DetectorCtor({ formats: ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'] })
        const tick = async () => {
          if (cancelled || !scanVideoRef.current) return
          try {
            const codes = await detector.detect(scanVideoRef.current)
            if (codes.length > 0) {
              setVehicleSearch(codes[0].rawValue)
              setShowScanModal(false)
              return
            }
          } catch {
            // transient decode errors between frames are expected — keep scanning
          }
          rafId = requestAnimationFrame(tick)
        }
        rafId = requestAnimationFrame(tick)
      } catch {
        if (!cancelled) setScanError('تعذر الوصول إلى الكاميرا — تأكد من منح الإذن اللازم للمتصفح')
      }
    }
    start()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      scanStreamRef.current?.getTracks().forEach((t) => t.stop())
      scanStreamRef.current = null
    }
  }, [showScanModal])

  const openScanModal = () => { setScanError(''); setShowScanModal(true) }

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
    if (!asset || !docForm.documentType.trim() || !docForm.file) {
      setDocFormError('الأصل ونوع المستند والملف حقول مطلوبة')
      return
    }
    setSaving(true)
    try {
      const docId = newId('adoc')
      await api.post('/asset_documents', {
        id: docId,
        asset_id: asset.id,
        asset_name: asset.name,
        document_type: docForm.documentType.trim(),
        file_name: docForm.file.name,
        expiry_date: docForm.expiryDate || null,
        status: docForm.status,
        notes: docForm.notes.trim() || null,
      })
      await uploadFile(`/asset_documents/${docId}/file`, docForm.file)
      setShowDocModal(false)
      await load()
    } catch (err) {
      setDocFormError(err instanceof ApiError ? err.message : 'تعذر حفظ المستند')
    } finally {
      setSaving(false)
    }
  }

  const openEditDoc = (d: AssetDocument) => {
    setEditingDoc(d)
    setDocEditForm(docEditFormFrom(d))
    setDocEditError('')
  }

  const submitEditDoc = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingDoc) return
    if (!docEditForm.documentType.trim()) {
      setDocEditError('نوع المستند مطلوب')
      return
    }
    setSavingDocEdit(true)
    setDocEditError('')
    try {
      await api.put(`/asset_documents/${editingDoc.id}`, {
        id: editingDoc.id,
        asset_id: editingDoc.assetId,
        asset_name: editingDoc.assetName,
        document_type: docEditForm.documentType.trim(),
        file_name: editingDoc.fileName,
        expiry_date: docEditForm.expiryDate || null,
        status: docEditForm.status,
        notes: docEditForm.notes.trim() || null,
      })
      setEditingDoc(null)
      await load()
    } catch (err) {
      setDocEditError(err instanceof ApiError ? err.message : 'تعذر تعديل المستند')
    } finally {
      setSavingDocEdit(false)
    }
  }

  const deleteDocument = async (d: AssetDocument) => {
    if (!(await confirmDialog(`هل تريد حذف مستند "${d.documentType}"؟`))) return
    try {
      await api.delete(`/asset_documents/${d.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف المستند')
    }
  }

  const deleteAsset = async (a: FixedAsset) => {
    if (!(await confirmDialog(`هل تريد حذف الأصل "${a.name}"؟ سيتم حذف كل ما يتبعه من مركبات وعقارات وسجلات صيانة ومستندات.`))) return
    try {
      await api.delete(`/assets/${a.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف الأصل')
    }
  }

  const deleteVehicle = async (v: Vehicle) => {
    if (!(await confirmDialog(`هل تريد حذف المركبة "${v.carName}"؟`))) return
    try {
      await api.delete(`/vehicles/${v.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف المركبة')
    }
  }

  const deleteEstate = async (r: RealEstate) => {
    if (!(await confirmDialog(`هل تريد حذف العقار "${r.propertyName}"؟`))) return
    try {
      await api.delete(`/real_estates/${r.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف العقار')
    }
  }

  const deleteMaintenance = async (m: MaintenanceRecord) => {
    if (!(await confirmDialog(`هل تريد حذف سجل الصيانة "${m.maintenanceType}"؟`))) return
    try {
      await api.delete(`/maintenance_records/${m.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف سجل الصيانة')
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

      <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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
                    <th className="px-3 py-4 font-medium sm:px-6">الاسم</th>
                    <th className="px-3 py-4 font-medium sm:px-6">النوع</th>
                    <th className="hidden px-6 py-4 font-medium md:table-cell">الفرع</th>
                    <th className="hidden px-6 py-4 font-medium lg:table-cell">تاريخ الشراء</th>
                    <th className="hidden px-6 py-4 font-medium lg:table-cell">سعر الشراء</th>
                    <th className="px-3 py-4 font-medium sm:px-6">القيمة الحالية</th>
                    <th className="hidden px-6 py-4 font-medium md:table-cell">المسؤول</th>
                    <th className="px-3 py-4 font-medium sm:px-6">الحالة</th>
                    {canManage && <th className="px-3 py-4 font-medium sm:px-6">إجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={9} className="px-6 py-10 text-center text-muted-foreground">جاري التحميل...</td></tr>
                  ) : assets.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-10 text-center text-muted-foreground">لا توجد أصول مسجلة</td></tr>
                  ) : pagedAssets.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-3 py-4 font-medium text-foreground sm:px-6">{a.name}</td>
                      <td className="px-3 py-4 text-muted-foreground sm:px-6">{a.type}</td>
                      <td className="hidden px-6 py-4 md:table-cell">{a.branch}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{a.purchaseDate}</td>
                      <td className="hidden px-6 py-4 lg:table-cell">{a.purchasePrice.toLocaleString()} {a.currency}</td>
                      <td className="px-3 py-4 font-medium sm:px-6">{a.currentValue.toLocaleString()} {a.currency}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">{a.responsible}</td>
                      <td className="px-3 py-4 sm:px-6">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${assetStatusClass[a.status] || 'bg-muted text-muted-foreground'}`}>{a.status}</span>
                      </td>
                      {canManage && (
                        <td className="px-3 py-4 sm:px-6">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button onClick={() => openEditAsset(a)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-primary hover:bg-muted transition-colors">
                              <Pencil className="h-3.5 w-3.5" /> تعديل
                            </button>
                            {a.status === 'نشط' && (
                              <>
                                <button onClick={() => openTransferAsset(a)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                                  <ArrowRightLeft className="h-3.5 w-3.5" /> نقل عهدة
                                </button>
                                <button onClick={() => openSell(a)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-danger transition-colors">
                                  <DollarSign className="h-3.5 w-3.5" /> بيع
                                </button>
                              </>
                            )}
                            <button onClick={() => deleteAsset(a)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-danger transition-colors">
                              <Trash2 className="h-3.5 w-3.5" /> حذف
                            </button>
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                placeholder="ابحث بالاسم أو اللوحة أو الباركود"
                className="w-full rounded-md border border-input bg-background py-2 pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={openScanModal} className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                <ScanLine className="h-4 w-4" /> مسح باركود للبحث
              </button>
              {canManage && (
                <button onClick={() => { setEditingVehicle(null); setVehicleForm(emptyVehicleForm()); setFormError(''); setShowVehicleModal(true) }} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  <Plus className="h-4 w-4" /> إضافة مركبة
                </button>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-3 py-4 font-medium sm:px-6">السيارة</th>
                    <th className="hidden px-6 py-4 font-medium md:table-cell">اللوحة</th>
                    <th className="hidden px-6 py-4 font-medium lg:table-cell">الموديل</th>
                    <th className="hidden px-6 py-4 font-medium lg:table-cell">السنة</th>
                    <th className="hidden px-6 py-4 font-medium md:table-cell">المستلم</th>
                    <th className="hidden px-6 py-4 font-medium lg:table-cell">اللون</th>
                    <th className="hidden px-6 py-4 font-medium lg:table-cell">رقم الهيكل</th>
                    <th className="hidden px-6 py-4 font-medium lg:table-cell">المخزن</th>
                    <th className="hidden px-6 py-4 font-medium lg:table-cell">انتهاء التأمين</th>
                    <th className="hidden px-6 py-4 font-medium lg:table-cell">انتهاء الترخيص</th>
                    <th className="px-3 py-4 font-medium sm:px-6">الحالة</th>
                    {canManage && <th className="px-3 py-4 font-medium sm:px-6">إجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vehicles.length === 0 ? (
                    <tr><td colSpan={12} className="px-6 py-10 text-center text-muted-foreground">لا توجد مركبات مسجلة</td></tr>
                  ) : sortedVehicles.length === 0 ? (
                    <tr><td colSpan={12} className="px-6 py-10 text-center text-muted-foreground">لا توجد نتائج مطابقة للبحث</td></tr>
                  ) : pagedVehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-3 py-4 font-medium text-foreground sm:px-6">{v.carName}</td>
                      <td className="hidden px-6 py-4 md:table-cell" dir="ltr">{v.plateNumber}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{v.model}</td>
                      <td className="hidden px-6 py-4 lg:table-cell">{v.makeYear}</td>
                      <td className="hidden px-6 py-4 md:table-cell">{v.driver}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{v.color}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell" dir="ltr">{v.vin}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{warehouseName(v.warehouseId) || '—'}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{v.insuranceExpiry}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{v.licenseExpiry}</td>
                      <td className="px-3 py-4 sm:px-6">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${assetStatusClass[v.status] || 'bg-muted text-muted-foreground'}`}>{v.status}</span>
                      </td>
                      {canManage && (
                        <td className="px-3 py-4 sm:px-6">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => openEditVehicle(v)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-primary hover:bg-muted transition-colors">
                              <Pencil className="h-3.5 w-3.5" /> تعديل
                            </button>
                            <button onClick={() => deleteVehicle(v)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-danger transition-colors">
                              <Trash2 className="h-3.5 w-3.5" /> حذف
                            </button>
                          </div>
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
                      <>
                        <button onClick={() => openEditEstate(r)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                          <Pencil className="h-3.5 w-3.5" /> تعديل
                        </button>
                        <button onClick={() => deleteEstate(r)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-danger transition-colors">
                          <Trash2 className="h-3.5 w-3.5" /> حذف
                        </button>
                      </>
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
                    <th className="px-3 py-4 font-medium sm:px-6">الأصل</th>
                    <th className="hidden px-6 py-4 font-medium md:table-cell">نوع الصيانة</th>
                    <th className="hidden px-6 py-4 font-medium lg:table-cell">التاريخ</th>
                    <th className="px-3 py-4 font-medium sm:px-6">التكلفة</th>
                    <th className="hidden px-6 py-4 font-medium lg:table-cell">المسؤول</th>
                    <th className="px-3 py-4 font-medium sm:px-6">الحالة</th>
                    {canManage && <th className="px-3 py-4 font-medium sm:px-6">إجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {maintenance.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">لا توجد سجلات صيانة</td></tr>
                  ) : pagedMaintenance.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-3 py-4 font-medium text-foreground sm:px-6">{m.assetName}</td>
                      <td className="hidden px-6 py-4 md:table-cell">{m.maintenanceType}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{m.date}</td>
                      <td className="px-3 py-4 sm:px-6">{m.cost.toLocaleString()} {m.currency}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{m.responsibleEmployee}</td>
                      <td className="px-3 py-4 sm:px-6">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                          ${m.status === 'مكتملة' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{m.status}</span>
                      </td>
                      {canManage && (
                        <td className="px-3 py-4 sm:px-6">
                          <div className="flex items-center gap-2">
                            {m.status !== 'مكتملة' && (
                              <button onClick={() => openCompleteMaintenance(m)} className="flex items-center gap-1 text-success hover:text-success/80 transition-colors text-xs font-medium">
                                <CheckCircle2 className="h-3.5 w-3.5" /> إكمال
                              </button>
                            )}
                            <button onClick={() => deleteMaintenance(m)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-danger transition-colors">
                              <Trash2 className="h-3.5 w-3.5" /> حذف
                            </button>
                          </div>
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
                    <th className="px-3 py-4 font-medium sm:px-6">الأصل</th>
                    <th className="hidden px-6 py-4 font-medium md:table-cell">نوع المستند</th>
                    <th className="hidden px-6 py-4 font-medium lg:table-cell">اسم الملف</th>
                    <th className="px-3 py-4 font-medium sm:px-6">تاريخ الانتهاء</th>
                    <th className="px-3 py-4 font-medium sm:px-6">الحالة</th>
                    <th className="px-3 py-4 font-medium sm:px-6">الملف</th>
                    <th className="px-3 py-4 font-medium sm:px-6">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {documents.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">لا توجد مستندات مسجلة</td></tr>
                  ) : pagedAssetDocs.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-3 py-4 font-medium text-foreground sm:px-6">{d.assetName}</td>
                      <td className="hidden px-6 py-4 md:table-cell">{d.documentType}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{d.fileName}</td>
                      <td className="px-3 py-4 text-muted-foreground sm:px-6">{d.expiryDate || '—'}</td>
                      <td className="px-3 py-4 sm:px-6">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${docStatusClass[d.status] || 'bg-muted text-muted-foreground'}`}>{d.status}</span>
                      </td>
                      <td className="px-3 py-4 sm:px-6">
                        {d.hasFile ? (
                          <button onClick={() => openFile(`/asset_documents/${d.id}/file`).catch((err) => setError(err instanceof ApiError ? err.message : 'تعذر فتح الملف'))} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                            <Download className="h-3.5 w-3.5" /> فتح الملف
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">لا يوجد ملف</span>
                        )}
                      </td>
                      <td className="px-3 py-4 sm:px-6">
                        {canManage && (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => openEditDoc(d)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                              <Pencil className="h-3.5 w-3.5" /> تعديل
                            </button>
                            <button onClick={() => deleteDocument(d)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-danger transition-colors">
                              <Trash2 className="h-3.5 w-3.5" /> حذف
                            </button>
                          </div>
                        )}
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
                  <th className="px-3 py-4 font-medium sm:px-6">الأصل</th>
                  <th className="hidden px-6 py-4 font-medium lg:table-cell">طريقة الإهلاك</th>
                  <th className="hidden px-6 py-4 font-medium lg:table-cell">سعر الشراء</th>
                  <th className="hidden px-6 py-4 font-medium md:table-cell">الإهلاك السنوي</th>
                  <th className="hidden px-6 py-4 font-medium md:table-cell">الإهلاك المتراكم</th>
                  <th className="px-3 py-4 font-medium sm:px-6">القيمة الدفترية الحالية</th>
                  <th className="hidden px-6 py-4 font-medium lg:table-cell">آخر تحديث</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {depreciation.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">لا توجد سجلات إهلاك</td></tr>
                ) : pagedDepreciation.map((d) => (
                  <tr key={d.assetId} className="hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-4 font-medium text-foreground sm:px-6">{d.assetName}</td>
                    <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{d.depreciationMethod}</td>
                    <td className="hidden px-6 py-4 lg:table-cell">{d.purchasePrice.toLocaleString()}</td>
                    <td className="hidden px-6 py-4 md:table-cell">{d.annualDepreciation.toLocaleString()}</td>
                    <td className="hidden px-6 py-4 text-danger md:table-cell">{d.accumulatedDepreciation.toLocaleString()}</td>
                    <td className="px-3 py-4 font-bold sm:px-6">{d.currentBookValue.toLocaleString()}</td>
                    <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{d.lastCalculatedDate}</td>
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
                    <option value="مخزن">مخزن</option>
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
              {assetForm.type === 'مخزن' && (
                <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">بيانات السيارة المخزّنة (إن وجدت)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">اللون</label>
                      <input value={assetForm.color} onChange={(e) => setAssetForm({ ...assetForm, color: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">الموديل</label>
                      <input value={assetForm.carModel} onChange={(e) => setAssetForm({ ...assetForm, carModel: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">رقم الهيكل (VIN)</label>
                      <input value={assetForm.vin} onChange={(e) => setAssetForm({ ...assetForm, vin: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">سنة الصنع</label>
                      <input type="number" value={assetForm.makeYear} onChange={(e) => setAssetForm({ ...assetForm, makeYear: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                  </div>
                </div>
              )}
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رقم الهيكل (VIN)</label>
                  <input value={vehicleForm.vin} onChange={(e) => setVehicleForm({ ...vehicleForm, vin: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رقم المحرك</label>
                  <input value={vehicleForm.engineNumber} onChange={(e) => setVehicleForm({ ...vehicleForm, engineNumber: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">عداد المسافة (كم)</label>
                  <input type="number" value={vehicleForm.mileage} onChange={(e) => setVehicleForm({ ...vehicleForm, mileage: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">المستلم</label>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">المخزن</label>
                  <select value={vehicleForm.warehouseId} onChange={(e) => setVehicleForm({ ...vehicleForm, warehouseId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">بدون مخزن محدد</option>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الباركود</label>
                  <input value={vehicleForm.barcode} onChange={(e) => setVehicleForm({ ...vehicleForm, barcode: e.target.value })} dir="ltr" placeholder="يُدخل يدوياً" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
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

      {/* Barcode Scan Modal — looks up an existing vehicle only, never generates a barcode */}
      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">مسح الباركود</h3>
              <button onClick={() => setShowScanModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 p-6">
              <div className="overflow-hidden rounded-lg bg-black">
                <video ref={scanVideoRef} muted playsInline className="w-full aspect-video object-cover" />
              </div>
              {scanError ? (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">{scanError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">وجّه الكاميرا نحو باركود المركبة — سيتم البحث تلقائياً فور التعرف عليه</p>
              )}
            </div>
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
                <label className="block text-sm font-medium text-foreground mb-1">الملف *</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => setDocForm({ ...docForm, file: e.target.files?.[0] || null })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 file:ml-3 file:rounded file:border-0 file:bg-accent file:px-2 file:py-1 file:text-xs"
                />
                <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG, DOC أو DOCX — حتى 10 ميغابايت</p>
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

      {/* Edit Document Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">تعديل المستند</h3>
              <button onClick={() => setEditingDoc(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitEditDoc} className="space-y-4 p-6 text-right">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">نوع المستند *</label>
                <input
                  value={docEditForm.documentType}
                  onChange={(e) => setDocEditForm({ ...docEditForm, documentType: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">تاريخ الانتهاء</label>
                  <input
                    type="date"
                    value={docEditForm.expiryDate}
                    onChange={(e) => setDocEditForm({ ...docEditForm, expiryDate: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الحالة</label>
                  <select
                    value={docEditForm.status}
                    onChange={(e) => setDocEditForm({ ...docEditForm, status: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="ساري">ساري</option>
                    <option value="قارب على الانتهاء">قارب على الانتهاء</option>
                    <option value="منتهي">منتهي</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea
                  value={docEditForm.notes}
                  onChange={(e) => setDocEditForm({ ...docEditForm, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {docEditError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{docEditError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingDoc(null)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={savingDocEdit} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {savingDocEdit && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
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
