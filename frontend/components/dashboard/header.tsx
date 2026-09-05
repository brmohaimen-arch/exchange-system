"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Bell,
  ChevronDown,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
  User,
  AlertCircle,
  Info,
  Clock,
  CheckCircle,
  Wrench,
  Database,
  ArrowRight,
} from "lucide-react"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "framer-motion"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useAuth, getRoleLabel } from "@/lib/auth-context"
import { departmentsApi } from "@/lib/api/departments"
import { useI18n, LanguageSwitcher } from "@/lib/i18n"
import { notificationsApi } from "@/lib/api/notifications"
import { workOrdersApi } from "@/lib/api/work-orders"
import { equipmentApi } from "@/lib/api/equipment"
import { claimsApi } from "@/lib/api/claims"
import type { NotificationResponse } from "@/lib/api/types"
import { cn } from "@/lib/utils"
import { WorkOrderTypeIcon } from "@/components/work-order-type-badge"

export function DashboardHeader() {
  const { t, language } = useI18n()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const router = useRouter()

  const isRtl = language === 'ar'
  const [selectedSite, setSelectedSite] = useState("all")
  const [selectedDepartment, setSelectedDepartment] = useState("all")
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([])
  const [notifications, setNotifications] = useState<NotificationResponse[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<{
    equipment: any[]
    wos: any[]
    claims: any[]
  }>({ equipment: [], wos: [], claims: [] })
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const handleLogout = () => {
    logout()
    router.push("/login")
  }

  const loadNotifications = async () => {
    if (!user?.id) return
    try {
      const data = await notificationsApi.getUnread(user.id)
      setNotifications(data)
      setUnreadCount(data.length)
    } catch (e) {
      console.error("Failed to load notifications", e)
    }
  }

  const markRead = async (id: number) => {
    try {
      await notificationsApi.markAsRead(id)
      setNotifications(prev => prev.filter(n => n.id !== id))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (e) {
      console.error(e)
    }
  }

  const markAllAsRead = async () => {
    if (!user?.id) return
    try {
      await notificationsApi.markAllAsRead(user.id)
      setNotifications([])
      setUnreadCount(0)
    } catch (e) {
      console.error(e)
    }
  }

  const performSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchResults({ equipment: [], wos: [], claims: [] })
      return
    }
    setIsSearching(true)
    try {
      const [eq, wos, claims] = await Promise.all([
        equipmentApi.search({ q }),
        workOrdersApi.list().then(list => list.filter(w =>
          w.title.toLowerCase().includes(q.toLowerCase()) ||
          w.woCode.toLowerCase().includes(q.toLowerCase())
        ).slice(0, 3)),
        claimsApi.list({ q }).then(list => Array.isArray(list) ? list.slice(0, 3) : [])
      ])
      setSearchResults({ equipment: eq.slice(0, 3), wos, claims })
    } catch (err) {
      console.error("Search failed", err)
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) performSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, performSearch])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await departmentsApi.getAll()
        if (cancelled) return
        setDepartments(data.map((d) => ({ id: String(d.departmentId), name: d.departmentName })))
        await loadNotifications()
      } catch {
        if (!cancelled) setDepartments([])
      }
    }
    load()
    const interval = setInterval(loadNotifications, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [user?.id])

  return (
    <header 
      className="sticky top-0 z-30 flex h-8 items-center justify-between border-b border-border/40 bg-background/80 px-3 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Search */}
      <div className="flex items-center gap-2 flex-1 max-w-md">
        <div className="relative flex-1 hidden sm:block">
          <Search className={cn("absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground", isRtl ? "right-3" : "left-3")} />
          <Input
            placeholder={t("search")}
            className={cn(
              "h-8 w-full text-[13px] bg-muted/20 border-transparent hover:bg-muted/30 focus:border-primary/30 focus:bg-background focus:ring-2 focus:ring-primary/10 transition-all duration-300 shadow-sm rounded-md",
              isRtl ? "pr-9 text-right" : "pl-9 text-left"
            )}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setShowResults(true)
            }}
            onFocus={() => setShowResults(true)}
          />
        </div>

        <AnimatePresence>
          {showResults && searchQuery.length >= 2 && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowResults(false)} />
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 10, scale: 0.98, filter: "blur(4px)" }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "absolute top-11 w-[320px] z-50 bg-card border border-border/50 shadow-xl rounded-xl overflow-hidden",
                  isRtl ? "right-0" : "left-0"
                )}
              >
                <ScrollArea className="max-h-72">
                  <div className="p-1.5 space-y-2">
                    {searchResults.equipment.length > 0 && (
                      <div>
                        <p className={cn("px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider", isRtl && "text-right")}>
                          {t('equipment')}
                        </p>
                        <div className="space-y-0.5">
                          {searchResults.equipment.map(eq => (
                            <SearchPreviewCard
                              key={eq.id}
                              icon={<Database className="h-3 w-3" />}
                              title={eq.label}
                              sub={eq.departmentName}
                              href={`/equipment/${eq.id}`}
                              status={eq.status}
                              isRtl={isRtl}
                              onClick={() => setShowResults(false)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {searchResults.wos.length > 0 && (
                      <div>
                        <p className={cn("px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider", isRtl && "text-right")}>
                          {t('workOrders')}
                        </p>
                        <div className="space-y-0.5">
                          {searchResults.wos.map(wo => (
                            <SearchPreviewCard
                              key={wo.woId}
                              icon={<Wrench className="h-3 w-3 text-primary" />}
                              title={wo.title}
                              sub={wo.woCode}
                              href={`/work-orders/${wo.woId}`}
                              status={wo.status}
                              variant="primary"
                              isRtl={isRtl}
                              onClick={() => setShowResults(false)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {searchResults.claims.length > 0 && (
                      <div>
                        <p className={cn("px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider", isRtl && "text-right")}>
                          {t('faultReports')}
                        </p>
                        <div className="space-y-0.5">
                          {searchResults.claims.map(claim => (
                            <SearchPreviewCard
                              key={claim.claimId}
                              icon={<AlertCircle className="h-3 w-3 text-destructive" />}
                              title={claim.title}
                              sub={`#${claim.claimId}`}
                              href={`/claims/${claim.claimId}`}
                              status={claim.statusLabel || claim.status}
                              variant="destructive"
                              isRtl={isRtl}
                              onClick={() => setShowResults(false)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.values(searchResults).every(arr => arr.length === 0) && !isSearching && (
                      <div className="py-3 text-center text-muted-foreground text-[10px]">
                        {t('noResultsFor')} &quot;{searchQuery}&quot;
                      </div>
                    )}

                    {isSearching && (
                      <div className="py-3 text-center animate-pulse text-primary text-[10px] font-medium">
                        {t('searching')}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Filters - Hidden on smaller screens */}
      <div className={cn("hidden xl:flex items-center gap-2", isRtl && "flex-row-reverse")}>
        <Select value={selectedSite} onValueChange={setSelectedSite} disabled>
          <SelectTrigger className="h-8 w-32 text-xs bg-muted/20 border-transparent hover:bg-muted/30 transition-colors">
            <SelectValue placeholder={t("selectSite")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allSites")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
          <SelectTrigger className="h-8 w-36 text-xs bg-muted/20 border-transparent hover:bg-muted/30 transition-colors">
            <SelectValue placeholder={t("selectDepartment")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allDepartments")}</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Actions */}
      <div className={cn("flex items-center gap-1.5", isRtl && "flex-row-reverse")}>
        <div className="hidden sm:block">
          <LanguageSwitcher />
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-7 w-7"
        >
          <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8 hover:bg-muted/50 rounded-full">
              <motion.div
                animate={unreadCount > 0 ? { rotate: [0, -10, 10, -10, 10, 0] } : {}}
                transition={{ repeat: Infinity, repeatDelay: 5, duration: 0.5 }}
              >
                <Bell className={cn("h-4 w-4", unreadCount > 0 && "text-primary")} />
              </motion.div>
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white shadow-sm ring-2 ring-background">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isRtl ? "start" : "end"} className="w-72 rounded-lg">
            <DropdownMenuLabel className={cn("flex items-center justify-between py-1.5", isRtl && "flex-row-reverse")}>
              <span className="text-xs font-semibold">{t("notifications")}</span>
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[9px] text-primary"
                  onClick={markAllAsRead}
                >
                  {t('markAllRead')}
                </Button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="h-48">
              <div className="flex flex-col">
                {notifications.length === 0 ? (
                  <div className="py-3 text-center text-xs text-muted-foreground">
                    {t('allCaughtUp')}
                  </div>
                ) : (
                  notifications.map(note => (
                    <div
                      key={note.id}
                      className={cn(
                        "flex gap-2 p-2 border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer group",
                        isRtl && "flex-row-reverse text-right"
                      )}
                      onClick={() => markRead(note.id)}
                    >
                      <div className={cn(
                        "mt-0.5 h-6 w-6 shrink-0 rounded flex items-center justify-center",
                        note.type === 'WARNING' ? "bg-warning/10 text-warning" :
                          note.type === 'RECOMMENDATION' ? "bg-info/10 text-info" : "bg-primary/10 text-primary"
                      )}>
                        {note.message?.toUpperCase().includes('CORRECTIVE') ? <WorkOrderTypeIcon type="CORRECTIVE" size="sm" /> :
                          note.message?.toUpperCase().includes('PREVENTIVE') ? <WorkOrderTypeIcon type="PREVENTIVE" size="sm" /> :
                            note.message?.toUpperCase().includes('REGULATORY') ? <WorkOrderTypeIcon type="REGULATORY" size="sm" /> :
                              note.message?.toUpperCase().includes('PREDICTIVE') ? <WorkOrderTypeIcon type="PREDICTIVE" size="sm" /> :
                                note.type === 'WARNING' ? <AlertCircle className="h-3 w-3" /> :
                                  note.type === 'RECOMMENDATION' ? <Clock className="h-3 w-3" /> : <Info className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] leading-relaxed text-foreground line-clamp-2">
                          {note.message}
                        </p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <CheckCircle className={cn("h-3 w-3 text-success opacity-0 group-hover:opacity-100 shrink-0 mt-1", isRtl && "mr-auto ml-0")} />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="justify-center text-primary text-[10px] py-1.5">
              <Link href="/notifications">
                {t('viewAll')}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className={cn("h-8 gap-2 pl-1.5 pr-2.5 rounded-full hover:bg-muted/50", isRtl && "flex-row-reverse")}>
              <Avatar className="h-6 w-6 rounded-full ring-1 ring-border/50 shadow-sm">
                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold rounded-full">
                  {user?.name?.split(" ").map((n) => n[0]).join("") || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:inline text-[13px] font-medium truncate max-w-24">
                {user?.name?.split(' ')[0] || "User"}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isRtl ? "start" : "end"} className="w-48 rounded-lg">
            <DropdownMenuLabel className={cn("py-1.5", isRtl && "text-right")}>
              <div className="flex flex-col">
                <span className="text-xs font-semibold truncate">{user?.name || "Guest"}</span>
                <span className="text-[10px] text-muted-foreground truncate">{user?.email || ""}</span>
                <Badge variant="secondary" className={cn("mt-1 w-fit", isRtl && "mr-auto ml-0")}>
                  {user ? getRoleLabel(user.roleName, language as 'en' | 'fr' | 'ar') : "Guest"}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className={cn("text-xs py-1.5", isRtl && "flex-row-reverse justify-end")}>
              <Link href="/profile">
                <User className={cn("h-3 w-3", isRtl ? "ml-2" : "mr-2")} />
                {t("profile")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={cn("text-xs py-1.5", isRtl && "flex-row-reverse justify-end")}>
              <Link href="/settings">
                <Settings className={cn("h-3 w-3", isRtl ? "ml-2" : "mr-2")} />
                {t("settings")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className={cn("text-xs py-1.5 text-destructive focus:text-destructive", isRtl && "flex-row-reverse justify-end")}>
              <LogOut className={cn("h-3 w-3", isRtl ? "ml-2" : "mr-2")} />
              {t("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

function SearchPreviewCard({ icon, title, sub, href, status, variant = "default", isRtl, onClick }: {
  icon: React.ReactNode
  title: string
  sub: string
  href: string
  status?: string
  variant?: "default" | "primary" | "destructive"
  isRtl?: boolean
  onClick?: () => void
}) {
  return (
    <Link href={href} onClick={onClick} className="block group">
      <div className={cn(
        "px-2 py-1.5 rounded hover:bg-muted/50 transition-colors flex items-center justify-between gap-2",
        isRtl && "flex-row-reverse"
      )}>
        <div className={cn("flex items-center gap-2 min-w-0", isRtl && "flex-row-reverse")}>
          <div className={cn(
            "h-6 w-6 rounded flex items-center justify-center shrink-0",
            variant === 'primary' ? "bg-primary/10" : variant === 'destructive' ? "bg-destructive/10" : "bg-muted"
          )}>
            {icon}
          </div>
          <div className={cn("min-w-0", isRtl && "text-right")}>
            <p className="text-[11px] font-medium truncate">{title}</p>
            <div className={cn("flex items-center gap-1", isRtl && "flex-row-reverse")}>
              <p className="text-[9px] text-muted-foreground">{sub}</p>
              {status && (
                <Badge variant="outline" className="h-3.5 px-1 text-[8px]">{status}</Badge>
              )}
            </div>
          </div>
        </div>
        <ArrowRight className={cn("h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0", isRtl && "rotate-180")} />
      </div>
    </Link>
  )
}
