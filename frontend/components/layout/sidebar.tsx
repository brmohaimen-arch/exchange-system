'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Settings, ArrowRightLeft, TrendingUp, Landmark, FileText, Coins, Package, Lock, ChevronDown, MapPin, Building2, Clock, ClipboardList, Receipt, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-provider'
import { useSidebarState } from '@/lib/sidebar-context'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

interface NavChild {
  name: string
  href: string
  icon: typeof Landmark
}

interface NavItem {
  name: string
  icon: typeof Landmark
  href?: string
  permission?: string
  children?: NavChild[]
}

const navigation: NavItem[] = [
  { name: 'الرئيسية', href: '/dashboard', icon: LayoutDashboard },
  { name: 'العمليات', href: '/transactions', icon: ArrowRightLeft },
  { name: 'أسعار الصرف', href: '/exchange-rates', icon: TrendingUp },
  { name: 'العملات', href: '/currencies', icon: Coins, permission: 'إدارة العملات' },
  {
    name: 'الخزينة والفروع', icon: Landmark,
    children: [
      { name: 'الخزنات', href: '/treasury?tab=vaults', icon: Landmark },
      { name: 'الفروع', href: '/treasury?tab=branches', icon: MapPin },
      { name: 'البنوك', href: '/treasury?tab=banks', icon: Building2 },
      { name: 'الورديات', href: '/treasury?tab=shifts', icon: Clock },
      { name: 'الجرد', href: '/treasury?tab=inventory', icon: ClipboardList },
      { name: 'المصاريف اليومية', href: '/treasury?tab=expenses', icon: Receipt },
      { name: 'طلبات الموافقة', href: '/treasury?tab=approvals', icon: ShieldCheck },
    ],
  },
  { name: 'العملاء', href: '/customers', icon: Users, permission: 'إدارة العملاء' },
  { name: 'الأصول الثابتة', href: '/assets', icon: Package, permission: 'إدارة الأصول' },
  { name: 'الإقفال اليومي', href: '/closing', icon: Lock, permission: 'اعتماد الإقفالات' },
  { name: 'التقارير', href: '/reports', icon: FileText, permission: 'رؤية التقارير' },
  { name: 'الإعدادات', href: '/settings', icon: Settings },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { hasPermission } = useAuth()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'الخزينة والفروع': pathname === '/treasury' })

  return (
    <div className="flex h-full w-64 flex-col bg-card">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-border shrink-0">
        <Image src="/icon.png" alt="شركة واكب" width={32} height={32} className="rounded-lg shrink-0" />
        <div className="leading-tight">
          <h1 className="text-base font-bold text-foreground">شركة واكب</h1>
          <p className="text-[11px] text-muted-foreground">لوحة التحكم</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navigation.map((item) => {
          if (item.permission && !hasPermission(item.permission)) return null

          if (item.children) {
            const groupActive = pathname === '/treasury'
            const isOpen = expanded[item.name] ?? groupActive
            return (
              <div key={item.name}>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [item.name]: !isOpen }))}
                  className={cn(
                    'group flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium rounded-md transition-colors',
                    groupActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent hover:text-primary'
                  )}
                >
                  <span className="flex items-center">
                    <item.icon className="ml-3 h-5 w-5 flex-shrink-0" aria-hidden="true" />
                    {item.name}
                  </span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="mt-1 space-y-0.5 border-r border-border pr-3 mr-3">
                    {item.children.map((child) => (
                      <Link
                        key={child.name}
                        href={child.href}
                        onClick={onNavigate}
                        className="group flex items-center px-3 py-2 text-sm text-muted-foreground rounded-md transition-colors hover:bg-accent hover:text-primary"
                      >
                        <child.icon className="ml-3 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          const active = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href!}
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
          )
        })}
      </nav>
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
