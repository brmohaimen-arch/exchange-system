"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Database,
  FileText,
  Gauge,
  GanttChart,
  Heart,
  Home,
  Kanban,
  Menu,
  MessageSquare,
  Package,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Logo } from "@/components/ui/logo"

interface NavItem {
  label: string
  icon: typeof Home
  href?: string
  children?: { label: string; href: string; icon?: typeof Home; roles?: string[] }[]
  roles?: string[]
}

export function DashboardSidebar() {
  const { t, language } = useI18n()
  const { user, isAuthenticated, isLoading } = useAuth()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [expandedItems, setExpandedItems] = useState<string[]>(["planning", "ai", "bi", "admin"])
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [meterAlertCount, setMeterAlertCount] = useState(0)

  const isMaintenanceStaff = user?.hasRole('ADMIN', 'MAINTENANCE_MANAGER') ?? false
  const isRtl = language === 'ar'

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!isAuthenticated || !isMaintenanceStaff) return

    const checkMeters = async () => {
      try {
        const { metersApi } = await import("@/lib/api/meters")
        const { mapMeterResponseToUiCard } = await import("@/lib/adapters")
        const meters = await metersApi.getAll()
        const uiM = meters.map(mapMeterResponseToUiCard)
        const count = uiM.filter(m => m.status === 'warning' || m.status === 'critical').length
        setMeterAlertCount(count)
      } catch (e) {
        console.error("Sidebar meter check failed", e)
      }
    }

    checkMeters()
    const interval = setInterval(checkMeters, 60000)
    return () => clearInterval(interval)
  }, [isAuthenticated, isMaintenanceStaff])

  const navItems: NavItem[] = [
    { label: t("dashboard"), icon: Home, href: "/dashboard" },
    { label: t("equipment"), icon: Database, href: "/equipment" },
    { label: t("claims"), icon: AlertTriangle, href: "/claims", roles: ["ADMIN", "MAINTENANCE_MANAGER", "TECHNICIAN"] },
    { label: t("workOrders"), icon: Wrench, href: "/work-orders", roles: ["ADMIN", "MAINTENANCE_MANAGER", "TECHNICIAN"] },
    { label: t("tasks"), icon: Clipboard, href: "/tasks", roles: ["ADMIN", "MAINTENANCE_MANAGER", "TECHNICIAN"] },
    { label: t("aIAssistant"), icon: MessageSquare, href: "/chatbot", roles: ["ADMIN", "MAINTENANCE_MANAGER", "FINANCE_MANAGER"] },
    {
      label: t("planning"),
      icon: Calendar,
      children: [
        { label: t("kanban"), href: "/planning/kanban", icon: Kanban },
        { label: t("calendar"), href: "/planning/calendar", icon: Calendar },
        { label: t("regulatoryPlans"), href: "/planning/regulatory", icon: ShieldCheck },
        { label: t("gantt"), href: "/planning/gantt", icon: GanttChart },
      ],
      roles: ["ADMIN", "MAINTENANCE_MANAGER"],
    },
    { label: t("meters"), icon: Gauge, href: "/meters", roles: ["ADMIN", "MAINTENANCE_MANAGER", "TECHNICIAN"] },
    { label: t("inventory"), icon: Package, href: "/inventory", roles: ["ADMIN", "MAINTENANCE_MANAGER", "TECHNICIAN"] },
    {
      label: t("ai"),
      icon: Brain,
      children: [
        { label: t("prioritization"), href: "/ai/prioritization", icon: Sparkles },
        { label: t("predictive"), href: "/ai/predictive", icon: Activity },
        { label: t("failureAnalysis"), href: "/ai/failure-analysis", icon: AlertTriangle },
      ],
      roles: ["ADMIN", "MAINTENANCE_MANAGER", "FINANCE_MANAGER"],
    },
    {
      label: t("bi"),
      icon: BarChart3,
      children: [
        { label: t("executive"), href: "/bi/executive", icon: BarChart3 },
        { label: t("maintenance"), href: "/bi/maintenance", icon: Wrench },
      ],
      roles: ["ADMIN", "MAINTENANCE_MANAGER", "FINANCE_MANAGER"],
    },
    {
      label: t("admin"),
      icon: Shield,
      children: [
        { label: t("users"), href: "/admin/users", icon: Users, roles: ["ADMIN"] },
        { label: t("roles"), href: "/admin/roles", icon: Shield, roles: ["ADMIN"] },
        { label: t("referenceData"), href: "/admin/reference-data", icon: Database, roles: ["ADMIN", "MAINTENANCE_MANAGER"] },
        { label: t("auditLogs"), href: "/admin/audit-logs", icon: FileText, roles: ["ADMIN"] },
      ],
      roles: ["ADMIN", "MAINTENANCE_MANAGER"],
    },
  ]

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    )
  }

  const isActive = (href: string) => pathname === href
  const isParentActive = (children?: { href: string }[]) =>
    children?.some((child) => pathname === child.href)

  const canAccess = (roles?: string[]) => {
    if (!roles) return true
    if (isLoading) return true
    if (!isAuthenticated || !user) return false
    return user.hasRole(...roles)
  }

  const SidebarContent = () => (
    <div className="flex h-full flex-col" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Logo - Compact */}
      <div className={cn("flex h-11 items-center justify-between border-b border-sidebar-border px-3", collapsed ? "justify-center" : "px-3")}>
        <Logo width={collapsed ? 28 : 100} height={30} className={cn("transition-all duration-300", collapsed ? "w-7" : "w-auto")} />
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "h-6 w-6 transition-all duration-300", 
              collapsed ? cn(
                "absolute top-12 bg-background border border-border rounded-full shadow-md z-50 hover:bg-accent",
                isRtl ? "-left-3" : "-right-3"
              ) : ""
            )}
          >
            {collapsed ? (
              <ChevronRight className={cn("h-3.5 w-3.5", isRtl && "rotate-180")} />
            ) : (
              <ChevronLeft className={cn("h-3.5 w-3.5", isRtl && "rotate-180")} />
            )}
          </Button>
        )}
      </div>

      {/* Navigation - Compact */}
      <ScrollArea className="flex-1 min-h-0 px-2 py-2">
        <nav className="space-y-0.5">
          {navItems.map((item) => {
            if (!canAccess(item.roles)) return null

            if (item.children) {
              const isExpanded = expandedItems.includes(item.label)
              const parentActive = isParentActive(item.children)

              return (
                <div key={item.label} className="border-b border-sidebar-border/30 pb-1 mb-1 last:border-0 last:pb-0 last:mb-0">
                  <button
                    onClick={() => toggleExpanded(item.label)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200 group",
                      parentActive
                        ? "bg-sidebar-primary/10 text-sidebar-primary shadow-[inset_2px_0_0_0_var(--color-primary)]"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/30 hover:shadow-[inset_2px_0_0_0_var(--color-primary)]"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <item.icon className={cn("h-4 w-4 shrink-0 transition-transform duration-200", !parentActive && "group-hover:scale-110 text-muted-foreground group-hover:text-primary")} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </div>
                    {!collapsed && (
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 shrink-0 transition-transform",
                          isExpanded && "rotate-180"
                        )}
                      />
                    )}
                  </button>
                  <AnimatePresence>
                    {isExpanded && !collapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          "mt-0.5 space-y-0.5 overflow-hidden border-sidebar-border pl-3",
                          isRtl ? "mr-3 border-r pr-0" : "ml-3 border-l"
                        )}
                      >
                        {item.children.map((child) => {
                          if (!canAccess(child.roles)) return null
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={cn(
                                "flex items-center gap-2.5 rounded-md px-2.5 py-1 text-[12px] transition-all duration-200 group",
                                isActive(child.href)
                                  ? "bg-sidebar-primary/10 text-sidebar-primary font-semibold"
                                  : "text-sidebar-foreground hover:bg-sidebar-accent/40"
                              )}
                              title={collapsed ? child.label : undefined}
                            >
                              {child.icon && <child.icon className={cn("h-3.5 w-3.5 shrink-0", !isActive(child.href) && "text-muted-foreground group-hover:text-foreground")} />}
                              <span className="truncate">{child.label}</span>
                            </Link>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            }

            return (
              <div key={item.href} className="border-b border-sidebar-border/30 pb-1 mb-1 last:border-0 last:pb-0 last:mb-0">
                <Link
                  href={item.href!}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200 group",
                    isActive(item.href!)
                      ? "bg-sidebar-primary/10 text-sidebar-primary shadow-[inset_2px_0_0_0_var(--color-primary)]"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/30 hover:shadow-[inset_2px_0_0_0_var(--color-primary)]"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <item.icon className={cn("h-4 w-4 shrink-0 transition-transform duration-200", !isActive(item.href!) && "group-hover:scale-110 text-muted-foreground group-hover:text-primary")} />
                      {collapsed && item.href === '/meters' && meterAlertCount > 0 && (
                        <div className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-white shadow-sm ring-1 ring-background">
                          {meterAlertCount > 9 ? '9+' : meterAlertCount}
                        </div>
                      )}
                    </div>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </div>
                {!collapsed && item.href === '/meters' && meterAlertCount > 0 && (
                  <div className="flex items-center gap-1">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white shadow-sm"
                    >
                      {meterAlertCount > 99 ? '99+' : meterAlertCount}
                    </motion.div>
                  </div>
                )}
                </Link>
              </div>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Settings - Compact */}
      <div className="border-t border-sidebar-border p-2">
        <Link
          href="/settings"
          title={collapsed ? t("settings") : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200 group",
            isActive("/settings")
              ? "bg-sidebar-primary/10 text-sidebar-primary shadow-[inset_2px_0_0_0_var(--color-primary)]"
              : "text-sidebar-foreground hover:bg-sidebar-accent/30 hover:shadow-[inset_2px_0_0_0_var(--color-primary)]"
          )}
        >
          <Settings className={cn("h-4 w-4 shrink-0 transition-transform duration-200", !isActive("/settings") && "group-hover:scale-110 text-muted-foreground group-hover:text-primary")} />
          {!collapsed && <span className="truncate">{t("settings")}</span>}
        </Link>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className={cn(
              "fixed top-2 z-40 lg:hidden",
              isRtl ? "right-2" : "left-2"
            )}
          >
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side={isRtl ? "right" : "left"} className="w-[220px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Dashboard navigation menu</SheetDescription>
          </SheetHeader>
          <SidebarContent />
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      className={cn(
        "sticky top-0 z-40 flex h-screen flex-col border-sidebar-border bg-sidebar transition-all duration-300 shrink-0",
        collapsed ? "w-[56px]" : "w-[220px]",
        isRtl ? "border-l" : "border-r"
      )}
    >
      <SidebarContent />
    </aside>
  )
}
