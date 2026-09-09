'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Settings, ArrowRightLeft, TrendingUp, Landmark, FileText, Coins, Package, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-provider'
import { useSidebarState } from '@/lib/sidebar-context'
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
  { name: 'أسعار الصرف', href: '/exchange-rates', icon: TrendingUp },
  { name: 'العملات', href: '/currencies', icon: Coins, permission: 'إدارة العملات' },
  { name: 'الخزينة والفروع', href: '/treasury', icon: Landmark },
  { name: 'العملاء', href: '/customers', icon: Users, permission: 'إدارة العملاء' },
  { name: 'الأصول الثابتة', href: '/assets', icon: Package, permission: 'إدارة الأصول' },
  { name: 'الإقفال اليومي', href: '/closing', icon: Lock, permission: 'اعتماد الإقفالات' },
  { name: 'التقارير', href: '/reports', icon: FileText, permission: 'رؤية التقارير' },
  { name: 'الإعدادات', href: '/settings', icon: Settings },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { hasPermission } = useAuth()

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

          const active = pathname === item.href
          return (
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
