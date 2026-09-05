'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, LogOut, User, Info, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-provider'
import { api, NotificationItem } from '@/lib/api-client'

const pageTitles: Record<string, string> = {
  '/': 'نظرة عامة',
  '/transactions': 'العمليات (بيع وشراء)',
  '/exchange-rates': 'أسعار الصرف',
  '/currencies': 'العملات',
  '/treasury': 'الخزينة والفروع',
  '/customers': 'العملاء',
  '/assets': 'الأصول الثابتة',
  '/closing': 'الإقفال اليومي',
  '/reports': 'التقارير والإقفال',
  '/settings': 'الإعدادات',
}

const typeIcon: Record<NotificationItem['type'], { Icon: typeof Info; className: string }> = {
  info: { Icon: Info, className: 'text-info' },
  warning: { Icon: AlertTriangle, className: 'text-warning' },
  error: { Icon: AlertCircle, className: 'text-danger' },
  success: { Icon: CheckCircle2, className: 'text-success' },
}

export function Header() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const title = pageTitles[pathname] || 'نظرة عامة'

  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const loadUnread = async () => {
    try {
      const data = await api.get<NotificationItem[]>('/notifications/unread')
      setNotifications(data)
    } catch {
      // notifications are best-effort — don't surface an error banner for this
    }
  }

  useEffect(() => {
    loadUnread()
    const interval = setInterval(loadUnread, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const markRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch {
      // ignore
    }
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6 shadow-sm">
      <div className="flex items-center">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="relative rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-primary transition-colors"
          >
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger"></span>
            )}
            <Bell className="h-5 w-5" />
          </button>
          {open && (
            <div className="absolute left-0 top-12 z-50 w-80 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">التنبيهات</h3>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">لا توجد تنبيهات جديدة</p>
                ) : notifications.map((n) => {
                  const { Icon, className } = typeIcon[n.type]
                  return (
                    <button
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className="flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-right hover:bg-muted/50 transition-colors"
                    >
                      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${className}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{n.timestamp}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-r border-border pr-4">
          <div className="text-left">
            <p className="text-sm font-medium text-foreground leading-tight">{user?.name}</p>
            <p className="text-xs text-muted-foreground leading-tight">{user?.role}</p>
          </div>
          <div className="flex items-center justify-center rounded-full bg-primary/10 p-2 text-primary">
            <User className="h-5 w-5" />
          </div>
          <button
            onClick={logout}
            title="تسجيل الخروج"
            className="rounded-full p-2 text-muted-foreground hover:bg-danger/10 hover:text-danger transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
