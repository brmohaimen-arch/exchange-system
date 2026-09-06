'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Settings, ArrowRightLeft, TrendingUp, Landmark, FileText, Coins, Package, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-provider'

const navigation = [
  { name: 'الرئيسية', href: '/', icon: LayoutDashboard },
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

export function Sidebar() {
  const pathname = usePathname()
  const { hasPermission } = useAuth()

  return (
    <div className="flex h-full w-64 flex-col border-l border-border bg-card shadow-sm">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-border">
        <Image src="/icon.png" alt="شركة واكب" width={32} height={32} className="rounded-lg shrink-0" />
        <div className="leading-tight">
          <h1 className="text-base font-bold text-foreground">شركة واكب</h1>
          <p className="text-[11px] text-muted-foreground">لوحة التحكم</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          if (item.permission && !hasPermission(item.permission)) return null
          const active = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
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
