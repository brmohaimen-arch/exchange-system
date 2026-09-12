'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, LogOut, User, Info, AlertTriangle, AlertCircle, CheckCircle2, CheckCheck, HelpCircle, Menu } from 'lucide-react'
import { useAuth } from '@/lib/auth-provider'
import { api, NotificationItem } from '@/lib/api-client'
import { GlobalSearch } from '@/components/layout/global-search'
import { useSidebarState } from '@/lib/sidebar-context'

const pageTitles: Record<string, string> = {
  '/dashboard': 'نظرة عامة',
  '/transactions': 'العمليات (بيع وشراء)',
  '/treasury': 'الخزنة وحركة اليوم',
  '/shifts': 'الورديات وطلبات الموافقة',
  '/inventory': 'الجرد والمصاريف',
  '/banks': 'البنوك والفروع',
  '/currencies': 'العملات وأسعار الصرف',
  '/customers': 'العملاء',
  '/assets': 'الأصول الثابتة',
  '/reports': 'التقارير والإقفال اليومي',
  '/settings': 'الإعدادات',
}

const pageHelp: Record<string, string> = {
  '/dashboard': 'الشاشة الرئيسية: تعرض ملخصاً سريعاً — أرباح اليوم، عدد العملاء، عدد المعاملات، ورصيد الخزنة الرئيسية بالدينار. من هنا يمكن للصراف طلب فتح وردية، وللمدير رؤية طلبات الموافقة المعلقة والذهاب مباشرة لأحدث المعاملات.',
  '/transactions': 'تنفيذ عمليات الصرافة: شراء عملة من عميل، بيعها له، أو تبديل عملة بأخرى. يجب فتح وردية أولاً قبل تنفيذ أي عملية. أسفل الصفحة سجل كامل بجميع العمليات المنفذة مع إمكانية التصفح بين الصفحات.',
  '/treasury': 'إدارة الخزنات ومتابعة حركة الدخول والخروج اليومية على كل خزنة، مع طلب تحويل الأموال بين الخزنات والحسابات البنكية وحسابات العملاء.',
  '/shifts': 'متابعة فتح وإغلاق ورديات الصرافين، والموافقة على الطلبات المعلقة (تحويلات، ورديات، عمليات عكسية).',
  '/inventory': 'تسجيل جرد الخزنات ومطابقة الرصيد الفعلي بالدفتري، وتسجيل المصاريف اليومية للمكتب.',
  '/banks': 'إدارة البنوك وفروعها وحسابات الشركة البنكية، وإدارة فروع الشركة نفسها.',
  '/currencies': 'إضافة وتعديل العملات المتاحة للتعامل في النظام، وإدارة أسعار الشراء والبيع لكل عملة أمام الدينار الليبي مع سجل بكل تعديل سابق على الأسعار.',
  '/customers': 'إدارة بيانات العملاء وأرصدتهم وديونهم ومستنداتهم. اضغط على أيقونة "كشف الحساب" لأي عميل لعرض كل معاملاته (شراء/بيع/تبديل) وحركات الإيداع والسحب على حسابه.',
  '/assets': 'إدارة أصول الشركة الثابتة (معدات، مركبات، عقارات)، تسجيل سجلات الصيانة والمستندات، ومتابعة الإهلاك السنوي لكل أصل.',
  '/reports': 'تقارير الأرباح والديون والامتثال (مكافحة غسل الأموال)، القيود المحاسبية مع إمكانية عكسها، العمليات الملغاة، وتصدير أي تقرير كملف Excel أو PDF — بالإضافة إلى إقفال يومية كل فرع ثم الشركة ككل.',
  '/settings': 'بيانات المكتب العامة، إعدادات الأمان، الأدوار والصلاحيات، إدارة المستخدمين، قواعد العمولة، سجل التدقيق وتسجيل الدخول، النسخ الاحتياطي، وتكامل واتساب وتيليجرام للتنبيهات.',
}

const typeIcon: Record<NotificationItem['type'], { Icon: typeof Info; className: string }> = {
  info: { Icon: Info, className: 'text-info' },
  warning: { Icon: AlertTriangle, className: 'text-warning' },
  error: { Icon: AlertCircle, className: 'text-danger' },
  success: { Icon: CheckCircle2, className: 'text-success' },
}

// Where clicking a notification should take the user, based on the entity it's
// about — the page that actually shows/lets them act on that record.
const entityRoutes: Record<string, string> = {
  Transfer: '/shifts?tab=approvals',
  Shift: '/shifts?tab=shifts',
  Debt: '/customers?tab=debts',
  AssetDocument: '/assets?tab=documents',
  CustomerDocument: '/customers?tab=documents',
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const { setMobileOpen } = useSidebarState()
  const title = pageTitles[pathname] || 'نظرة عامة'
  const help = pageHelp[pathname]

  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)

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
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setHelpOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => { setHelpOpen(false) }, [pathname])

  const markRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch {
      // ignore
    }
  }

  const openNotification = (n: NotificationItem) => {
    markRead(n.id)
    setOpen(false)
    const route = n.entityType ? entityRoutes[n.entityType] : undefined
    if (route) router.push(route)
  }

  const markAllRead = async () => {
    const previous = notifications
    setNotifications([]) // optimistic — the popover reads unread-only, so read == gone
    try {
      await api.patch('/notifications/read-all')
    } catch {
      setNotifications(previous)
    }
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-3 shadow-sm sm:px-6">
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <button
          onClick={() => setMobileOpen(true)}
          className="ml-1 shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-primary transition-colors lg:hidden"
          aria-label="فتح القائمة"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h2 className="truncate text-base font-semibold text-foreground sm:text-lg">{title}</h2>
        {help && (
          <div className="relative shrink-0" ref={helpRef}>
            <button
              onClick={() => setHelpOpen((v) => !v)}
              title="عن هذه الصفحة"
              className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-primary transition-colors"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            {helpOpen && (
              <div className="absolute right-0 top-8 z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-card shadow-xl p-4 text-right">
                <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{help}</p>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <GlobalSearch />
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
            <div className="absolute left-0 top-12 z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-card shadow-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">التنبيهات</h3>
                {notifications.length > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> تحديد الكل كمقروء
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">لا توجد تنبيهات جديدة</p>
                ) : notifications.map((n) => {
                  const { Icon, className } = typeIcon[n.type]
                  const hasRoute = !!(n.entityType && entityRoutes[n.entityType])
                  return (
                    <button
                      key={n.id}
                      onClick={() => openNotification(n)}
                      title={hasRoute ? 'اضغط للانتقال إلى الصفحة المرتبطة' : undefined}
                      className="flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-right hover:bg-muted/50 transition-colors"
                    >
                      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${className}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[10px] text-muted-foreground">{n.timestamp}</p>
                          {hasRoute && <span className="text-[10px] font-medium text-primary">عرض التفاصيل ←</span>}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-r border-border pr-2 sm:pr-4">
          <div className="hidden text-left sm:block">
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
