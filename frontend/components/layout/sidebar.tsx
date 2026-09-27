'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Fragment, useEffect, useState } from 'react'
import {
  LayoutDashboard, Users, Settings, ArrowRightLeft, Landmark, FileText, Coins, Package, Clock,
  ClipboardList, Building2, CreditCard, LineChart, Truck, Car, Boxes, ChevronDown, Plus, X, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-provider'
import { useSidebarState } from '@/lib/sidebar-context'
import { useBranding } from '@/lib/branding'
import { api, FleetCompanyDef } from '@/lib/api-client'
import { ApiError } from '@/lib/auth-provider'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

interface NavItem {
  name: string
  icon: typeof Landmark
  href: string
  permission?: string
}

const navigation: NavItem[] = [
  { name: 'الرئيسية', href: '/dashboard', icon: LayoutDashboard },
  { name: 'العمليات', href: '/transactions', icon: ArrowRightLeft },
  { name: 'الخزنة وحركة اليوم', href: '/treasury', icon: Landmark },
  { name: 'الورديات وطلبات الموافقة', href: '/shifts', icon: Clock },
  { name: 'الجرد والمصاريف', href: '/inventory', icon: ClipboardList },
  { name: 'البنوك والفروع', href: '/banks', icon: Building2 },
  { name: 'العملات وأسعار الصرف', href: '/currencies', icon: Coins, permission: 'إدارة العملات' },
  { name: 'سجل أسعار العملات', href: '/currency-history', icon: LineChart, permission: 'إدارة سجل أسعار العملات' },
  { name: 'العملاء', href: '/customers', icon: Users, permission: 'إدارة العملاء' },
  { name: 'بطاقات الدولار', href: '/dollar-cards', icon: CreditCard, permission: 'إدارة بطاقات الدولار' },
  { name: 'الأصول الثابتة', href: '/assets', icon: Package, permission: 'إدارة الأصول' },
  { name: 'التقارير والإقفال اليومي', href: '/reports', icon: FileText, permission: 'رؤية التقارير' },
  { name: 'الإعدادات', href: '/settings', icon: Settings },
]

// The 3 companies built into the code — each has its own fixed Next.js route
// and its own API mount (see fleet.get_company on the backend). Any OTHER
// company came from "+ إضافة شركة" and is fetched from /fleet_companies —
// same template, just a dynamic id and the generic /company/<id> route/mount.
const BUILT_IN_HREFS: Record<string, string> = { bayan: '/fleet', imtiaz: '/imtiaz', itqan: '/itqan' }
const ICON_MAP: Record<string, typeof Truck> = { Truck, Car, Package, Building2, Boxes }
const ICON_CHOICES = ['Truck', 'Car', 'Package', 'Building2', 'Boxes'] as const

function companyHref(id: string) {
  return BUILT_IN_HREFS[id] || `/company/${id}`
}

function useFleetCompanies() {
  const [companies, setCompanies] = useState<FleetCompanyDef[]>([])
  const [loaded, setLoaded] = useState(false)
  const reload = () => api.get<FleetCompanyDef[]>('/fleet_companies').then((r) => { setCompanies(r); setLoaded(true) }).catch(() => setLoaded(true))
  useEffect(() => { reload() }, [])
  return { companies, loaded, reload }
}

function CreateCompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<(typeof ICON_CHOICES)[number]>('Truck')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('اسم الشركة مطلوب'); return }
    setSaving(true)
    setError('')
    try {
      const res = await api.post<{ id: string; name: string }>('/fleet_companies', { name: name.trim(), icon })
      onCreated(res.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إضافة الشركة')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold text-foreground">إضافة شركة جديدة</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5 text-right">
            <p className="text-xs text-muted-foreground">
              تُنشئ شركة جديدة تعمل بنفس نظام "المركبات والمعدات الثقيلة" (مركبات، مخازن، حسابات، كشف حركات، مؤشرات أسبوعية وشهرية) — تماماً كبيان الدولية والامتياز واتقن المحركات. لا يمكن اختيار جداول أو تقارير مختلفة لكل شركة.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">اسم الشركة *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">الأيقونة</label>
              <div className="flex gap-2">
                {ICON_CHOICES.map((ic) => {
                  const Icon = ICON_MAP[ic]
                  return (
                    <button key={ic} type="button" onClick={() => setIcon(ic)} className={cn('flex h-10 w-10 items-center justify-center rounded-md border transition-colors', icon === ic ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                      <Icon className="h-5 w-5" />
                    </button>
                  )
                })}
              </div>
            </div>
            {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} إضافة
              </button>
            </div>
          </form>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { hasPermission } = useAuth()
  const branding = useBranding()
  const { companies, reload: reloadCompanies } = useFleetCompanies()
  const canCreateCompany = hasPermission('إدارة الإعدادات')
  const [showCreate, setShowCreate] = useState(false)

  const visibleCompanies = companies
    .filter((c) => hasPermission(c.permission))
    .map((c) => ({ name: c.name, href: companyHref(c.id), icon: ICON_MAP[c.icon] || Truck }))
  const companyActive = visibleCompanies.some((c) => pathname === c.href)
  const [companiesOpen, setCompaniesOpen] = useState(companyActive)

  return (
    <div className="flex h-full w-64 flex-col bg-card">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-border shrink-0">
        {branding.loading ? (
          <div className="h-8 w-8 shrink-0 rounded-lg bg-muted" />
        ) : (
          <Image src={branding.logoUrl} alt={branding.name} width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded-lg object-contain" />
        )}
        <div className="leading-tight">
          <h1 className="text-base font-bold text-foreground">{branding.name}</h1>
          <p className="text-[11px] text-muted-foreground">لوحة التحكم</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navigation.map((item) => {
          if (item.permission && !hasPermission(item.permission)) return null

          const active = pathname === item.href
          const companiesGroup = item.href === '/reports' && (visibleCompanies.length > 0 || canCreateCompany) && (
            <div key="companies-group">
              <button
                type="button"
                onClick={() => setCompaniesOpen((o) => !o)}
                aria-expanded={companiesOpen}
                className={cn(
                  'flex w-full items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors',
                  companyActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent hover:text-primary'
                )}
              >
                <Building2 className="ml-3 h-5 w-5 flex-shrink-0" aria-hidden="true" />
                الشركات
                <ChevronDown className={cn('mr-auto h-4 w-4 transition-transform', companiesOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              {companiesOpen && (
                <div className="mt-1 space-y-1 pr-6">
                  {visibleCompanies.map((c) => (
                    <Link
                      key={c.href}
                      href={c.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                        pathname === c.href ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent hover:text-primary'
                      )}
                    >
                      <c.icon className="ml-3 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                      {c.name}
                    </Link>
                  ))}
                  {canCreateCompany && (
                    <button
                      type="button"
                      onClick={() => setShowCreate(true)}
                      className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Plus className="ml-3 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                      إضافة شركة
                    </button>
                  )}
                </div>
              )}
            </div>
          )
          return (
            <Fragment key={item.name}>
            {companiesGroup}
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-accent hover:text-primary'
              )}
            >
              <item.icon className="ml-3 h-5 w-5 flex-shrink-0" aria-hidden="true" />
              {item.name}
            </Link>
            </Fragment>
          )
        })}
      </nav>
      {showCreate && (
        <CreateCompanyModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { reloadCompanies(); setShowCreate(false); onNavigate?.(); router.push(companyHref(id)) }}
        />
      )}
    </div>
  )
}

export function Sidebar() {
  const { mobileOpen, setMobileOpen } = useSidebarState()

  return (
    <>
      {/* Desktop: fixed, always-visible sidebar */}
      <div className="hidden h-full shrink-0 border-l border-border shadow-sm lg:flex">
        <SidebarContent />
      </div>

      {/* Mobile: off-canvas drawer, opened from the header's menu button */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-64 gap-0 p-0">
          <SheetTitle className="sr-only">قائمة التنقل</SheetTitle>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
