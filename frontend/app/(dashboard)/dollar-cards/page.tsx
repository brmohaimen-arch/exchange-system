'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Plus, X, Loader2, Trash2, FileText, Upload, CreditCard, Download } from 'lucide-react'
import { api, uploadFile, openFile, DollarCardRecipient, DollarCardDocument, DollarCardStatus } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'
import { TablePagination, paginate } from '@/components/TablePagination'
import { useConfirm } from '@/components/ConfirmProvider'
import { DateInput } from '@/components/ui/date-input'
import { formatDate } from '@/lib/format-date'
import { NumberInput } from '@/components/ui/number-input'

const STATUS_LABELS: Record<DollarCardStatus, { label: string; className: string }> = {
  waiting: { label: 'قيد الانتظار', className: 'bg-secondary text-muted-foreground' },
  in_progress: { label: 'قيد التنفيذ', className: 'bg-info/10 text-info' },
  handed: { label: 'تم التسليم', className: 'bg-success/10 text-success' },
  not_handed: { label: 'لم يتم التسليم', className: 'bg-danger/10 text-danger' },
}

function emptyForm() {
  return { fullName: '', nationalId: '', phone: '', accountNumber: '', accountBank: '', passportNumber: '', passportExpiry: '', cardNumber: '', cvc: '', privateCode: '', cardBalance: '', cardExpiry: '', boughtBy: '', paymentAmount: '', status: 'waiting' as DollarCardStatus, notes: '' }
}

export default function DollarCardsPage() {
  const { hasPermission } = useAuth()
  const confirmDialog = useConfirm()
  const canManage = hasPermission('إدارة بطاقات الدولار')

  const [recipients, setRecipients] = useState<DollarCardRecipient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<DollarCardRecipient | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [docsFor, setDocsFor] = useState<DollarCardRecipient | null>(null)
  const [documents, setDocuments] = useState<DollarCardDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get<DollarCardRecipient[]>('/dollar_cards')
      setRecipients(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل قائمة المستفيدين')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (r: DollarCardRecipient) => {
    setEditing(r)
    setForm({
      fullName: r.fullName, nationalId: r.nationalId, phone: r.phone,
      accountNumber: r.accountNumber || '', accountBank: r.accountBank || '', passportNumber: r.passportNumber || '',
      passportExpiry: r.passportExpiry || '', cardNumber: r.cardNumber || '', cvc: r.cvc || '', privateCode: r.privateCode || '',
      cardBalance: r.cardBalance !== null ? String(r.cardBalance) : '', cardExpiry: r.cardExpiry || '', boughtBy: r.boughtBy || '',
      paymentAmount: r.paymentAmount !== null ? String(r.paymentAmount) : '',
      status: r.status, notes: r.notes || '',
    })
    setFormError('')
    setShowModal(true)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!form.fullName.trim() || !form.nationalId.trim() || !form.phone.trim()) {
      setFormError('الاسم الكامل والرقم الوطني والهاتف حقول مطلوبة')
      return
    }
    setSaving(true)
    try {
      const payload = {
        full_name: form.fullName.trim(), national_id: form.nationalId.trim(), phone: form.phone.trim(),
        account_number: form.accountNumber.trim() || null, account_bank: form.accountBank.trim() || null,
        passport_number: form.passportNumber.trim() || null, passport_expiry: form.passportExpiry || null,
        card_number: form.cardNumber.trim() || null, cvc: form.cvc.trim() || null, private_code: form.privateCode.trim() || null,
        card_balance: form.cardBalance !== '' ? parseFloat(form.cardBalance) : null, card_expiry: form.cardExpiry.trim() || null,
        bought_by: form.boughtBy.trim() || null, payment_amount: form.paymentAmount !== '' ? parseFloat(form.paymentAmount) : null,
        status: form.status, notes: form.notes.trim() || null,
      }
      if (editing) {
        await api.put(`/dollar_cards/${editing.id}`, payload)
      } else {
        await api.post('/dollar_cards', payload)
      }
      setShowModal(false)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (r: DollarCardRecipient, status: DollarCardStatus) => {
    setError('')
    try {
      await api.put(`/dollar_cards/${r.id}/status`, { status })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحديث الحالة')
    }
  }

  const remove = async (r: DollarCardRecipient) => {
    if (!(await confirmDialog(`هل تريد حذف المستفيد "${r.fullName}"؟ سيتم حذف جميع مستنداته المرفقة أيضاً.`, { requireTypedWord: true }))) return
    setError('')
    try {
      await api.delete(`/dollar_cards/${r.id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف المستفيد')
    }
  }

  const openDocs = async (r: DollarCardRecipient) => {
    setDocsFor(r)
    setDocsLoading(true)
    try {
      const res = await api.get<DollarCardDocument[]>(`/dollar_cards/${r.id}/documents`)
      setDocuments(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل المستندات')
    } finally {
      setDocsLoading(false)
    }
  }

  const uploadDocs = async (files: FileList | null) => {
    if (!files || !docsFor) return
    setUploading(true)
    setError('')
    try {
      for (const file of Array.from(files)) {
        await uploadFile(`/dollar_cards/${docsFor.id}/documents`, file)
      }
      const res = await api.get<DollarCardDocument[]>(`/dollar_cards/${docsFor.id}/documents`)
      setDocuments(res)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر رفع المستند')
    } finally {
      setUploading(false)
    }
  }

  const deleteDoc = async (d: DollarCardDocument) => {
    if (!(await confirmDialog('هل تريد حذف هذا المستند؟'))) return
    try {
      await api.delete(`/dollar_cards/documents/${d.id}`)
      setDocuments((prev) => prev.filter((x) => x.id !== d.id))
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف المستند')
    }
  }

  const pagedRecipients = paginate(recipients, page)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><CreditCard className="h-6 w-6 text-primary" /> بطاقات الدولار</h2>
          <p className="text-xs text-muted-foreground mt-1">سجل مستفيدي منحة الـ 2000 دولار من الحكومة الليبية — سجل ورقي فقط، لا يؤثر على أرصدة الخزنة أو الحسابات البنكية.</p>
        </div>
        {canManage && (
          <button onClick={openCreate} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> إضافة مستفيد
          </button>
        )}
      </div>

      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">جاري التحميل...</p>
        ) : recipients.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">لا يوجد مستفيدون مسجلون بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">الاسم الكامل</th>
                  <th className="px-4 py-3 font-medium">الرقم الوطني</th>
                  <th className="px-4 py-3 font-medium">الهاتف</th>
                  <th className="px-4 py-3 font-medium">الحساب البنكي</th>
                  <th className="px-4 py-3 font-medium">رقم الجواز</th>
                  <th className="px-4 py-3 font-medium">انتهاء الجواز</th>
                  <th className="px-4 py-3 font-medium">رقم البطاقة</th>
                  <th className="px-4 py-3 font-medium">انتهاء البطاقة</th>
                  <th className="px-4 py-3 font-medium">رصيد البطاقة</th>
                  <th className="px-4 py-3 font-medium">اشتراها</th>
                  <th className="px-4 py-3 font-medium">مبلغ الدفع</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3 font-medium">المستندات</th>
                  {canManage && <th className="px-4 py-3 font-medium">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedRecipients.map((r) => {
                  const st = STATUS_LABELS[r.status]
                  return (
                    <tr key={r.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{r.fullName}</td>
                      <td className="px-4 py-3" dir="ltr">{r.nationalId}</td>
                      <td className="px-4 py-3" dir="ltr">{r.phone}</td>
                      <td className="px-4 py-3">{r.accountBank ? `${r.accountBank} — ${r.accountNumber || '—'}` : '—'}</td>
                      <td className="px-4 py-3" dir="ltr">{r.passportNumber || '—'}</td>
                      <td className="px-4 py-3" dir="ltr">{formatDate(r.passportExpiry) || '—'}</td>
                      <td className="px-4 py-3" dir="ltr">{r.cardNumberMasked || '—'}</td>
                      <td className="px-4 py-3" dir="ltr">{r.cardExpiry || '—'}</td>
                      <td className="px-4 py-3" dir="ltr">{r.cardBalance !== null ? r.cardBalance.toLocaleString('en-US') : '—'}</td>
                      <td className="px-4 py-3">{r.boughtBy || '—'}</td>
                      <td className="px-4 py-3" dir="ltr">{r.paymentAmount !== null ? r.paymentAmount.toLocaleString('en-US') : '—'}</td>
                      <td className="px-4 py-3">
                        {canManage ? (
                          <select
                            value={r.status}
                            onChange={(e) => changeStatus(r, e.target.value as DollarCardStatus)}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium border-0 focus:outline-none focus:ring-2 focus:ring-primary/50 ${st.className}`}
                          >
                            {Object.entries(STATUS_LABELS).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}
                          </select>
                        ) : (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openDocs(r)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors">
                          <FileText className="h-3.5 w-3.5" /> {r.documentCount} مستند
                        </button>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEdit(r)} className="text-xs font-medium text-primary hover:underline">تعديل</button>
                            <button onClick={() => remove(r)} className="text-xs font-medium text-danger hover:underline">حذف</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination page={page} totalItems={recipients.length} onPageChange={setPage} />
      </div>

      {/* Create/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">{editing ? 'تعديل بيانات مستفيد' : 'إضافة مستفيد جديد'}</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submit} className="space-y-4 p-6 text-right max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الاسم الكامل *</label>
                <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">الرقم الوطني *</label>
                  <input value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رقم الهاتف *</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">البنك</label>
                  <input value={form.accountBank} onChange={(e) => setForm({ ...form, accountBank: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رقم الحساب البنكي</label>
                  <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">رقم جواز السفر</label>
                <input value={form.passportNumber} onChange={(e) => setForm({ ...form, passportNumber: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">تاريخ انتهاء الجواز</label>
                <DateInput value={form.passportExpiry} onChange={(e) => setForm({ ...form, passportExpiry: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="rounded-lg border border-border p-4 space-y-4">
                <h4 className="text-sm font-semibold text-foreground">بيانات البطاقة</h4>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">رقم البطاقة الكامل</label>
                  <input value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: e.target.value })} inputMode="numeric" maxLength={23} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">CVC</label>
                    <input value={form.cvc} onChange={(e) => setForm({ ...form, cvc: e.target.value })} inputMode="numeric" maxLength={4} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">الرمز السري</label>
                    <input value={form.privateCode} onChange={(e) => setForm({ ...form, privateCode: e.target.value })} inputMode="numeric" maxLength={12} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">انتهاء البطاقة</label>
                    <input value={form.cardExpiry} onChange={(e) => setForm({ ...form, cardExpiry: e.target.value })} placeholder="MM/YY" maxLength={7} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">رصيد البطاقة</label>
                    <NumberInput step="any" value={form.cardBalance} onChange={(e) => setForm({ ...form, cardBalance: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">من اشتراها</label>
                    <input value={form.boughtBy} onChange={(e) => setForm({ ...form, boughtBy: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">مبلغ الدفع</label>
                    <NumberInput step="any" value={form.paymentAmount} onChange={(e) => setForm({ ...form, paymentAmount: e.target.value })} dir="ltr" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">الحالة</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DollarCardStatus })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  {Object.entries(STATUS_LABELS).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ملاحظات</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              {formError && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Documents modal */}
      {docsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">مستندات — {docsFor.fullName}</h3>
              <button onClick={() => setDocsFor(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {canManage && (
                <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors cursor-pointer">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  رفع مستند واحد أو أكثر
                  <input type="file" multiple className="hidden" disabled={uploading} onChange={(e) => uploadDocs(e.target.files)} />
                </label>
              )}
              {docsLoading ? (
                <p className="text-center text-sm text-muted-foreground py-4">جاري التحميل...</p>
              ) : documents.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">لا توجد مستندات مرفوعة</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span className="text-sm truncate">{d.fileName}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => openFile(`/dollar_cards/documents/${d.id}/file`)} className="text-muted-foreground hover:text-primary" title="فتح">
                          <Download className="h-4 w-4" />
                        </button>
                        {canManage && (
                          <button onClick={() => deleteDoc(d)} className="text-muted-foreground hover:text-danger" title="حذف">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
