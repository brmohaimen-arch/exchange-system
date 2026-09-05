import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export interface AuditEntry {
  id: string
  timestamp: string
  user: string
  userRole: string
  action: "create" | "update" | "delete" | "view" | "export" | "status_change"
  description: string
  resource: string
  details?: string
  changedFields?: {
    field: string
    oldValue: string
    newValue: string
  }[]
}

interface AuditTrailProps {
  entries: AuditEntry[]
  title?: string
  description?: string
  hideTitle?: boolean
}

export function AuditTrail({
  entries,
  title,
  description,
  hideTitle = false,
}: AuditTrailProps) {
  const { t, language } = useI18n()
  const isRtl = language === 'ar'

  const getActionIcon = (action: string) => {
    switch (action) {
      case "create":
        return <Plus className="h-4 w-4" />
      case "update":
        return <Edit className="h-4 w-4" />
      case "delete":
        return <Trash2 className="h-4 w-4" />
      case "status_change":
        return <FileText className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case "create":
        return "bg-emerald-50 text-emerald-700 border-emerald-200"
      case "update":
        return "bg-blue-50 text-blue-700 border-blue-200"
      case "delete":
        return "bg-red-50 text-red-700 border-red-200"
      case "status_change":
        return "bg-violet-50 text-violet-700 border-violet-200"
      case "view":
        return "bg-slate-50 text-slate-700 border-slate-200"
      case "export":
        return "bg-orange-50 text-orange-700 border-orange-200"
      default:
        return "bg-gray-50 text-gray-700 border-gray-200"
    }
  }

  const getActionLabel = (action: string) => {
    const key = `action_${action}` as any
    return t(key) || action
  }

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4 },
  }

  const staggerContainer = {
    animate: {
      transition: {
        staggerChildren: 0.05,
      },
    },
  }

  return (
    <motion.div initial="initial" animate="animate" variants={staggerContainer}>
      <Card className="overflow-hidden font-sans">
        {!hideTitle && (
          <CardHeader className={isRtl ? "text-right" : "text-left"}>
            <CardTitle>{title || t('auditTrail')}</CardTitle>
            <CardDescription>{description || t('completeActivityLog')}</CardDescription>
          </CardHeader>
        )}
        <CardContent>
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-8 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">{t('noAuditEntries')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry, index) => (
                <motion.div
                  key={entry.id}
                  variants={fadeInUp}
                  className={cn(
                    "flex gap-2 md:gap-3 pb-4 border-b border-border last:border-b-0 last:pb-0",
                    isRtl && "flex-row-reverse"
                  )}
                >
                  <div className="flex flex-col items-center">
                    <div className={`h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white mb-2 shadow-sm`}>
                      {getActionIcon(entry.action)}
                    </div>
                    {index < entries.length - 1 && (
                      <div className="w-0.5 h-full bg-border/50" />
                    )}
                  </div>

                  <div className={cn("flex-1 min-w-0", isRtl && "text-right")}>
                    <div className={cn("flex flex-col md:flex-row md:items-start md:justify-between gap-2", isRtl && "md:flex-row-reverse")}>
                      <div className="flex-1">
                        <div className={cn("flex items-center gap-2 mb-1", isRtl && "flex-row-reverse")}>
                          <span className="font-semibold text-foreground">{entry.description}</span>
                          <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-tight", getActionColor(entry.action))}>
                            {getActionLabel(entry.action)}
                          </Badge>
                        </div>
                        <div className={cn("flex flex-wrap items-center gap-3 text-xs text-muted-foreground", isRtl && "flex-row-reverse")}>
                          <div className={cn("flex items-center gap-1", isRtl && "flex-row-reverse")}>
                            <User className="h-3.5 w-3.5" />
                            <span className="font-medium text-foreground/80">{entry.user}</span>
                            <span className="text-[10px] opacity-70">({entry.userRole})</span>
                          </div>
                          <span className="opacity-30">•</span>
                          <div className={cn("flex items-center gap-1", isRtl && "flex-row-reverse")}>
                            <Clock className="h-3.5 w-3.5" />
                            <span>{entry.timestamp}</span>
                          </div>
                          <span className="opacity-30">•</span>
                          <Badge variant="secondary" className="text-[9px] font-bold py-0 h-4">{entry.resource}</Badge>
                        </div>

                        {(entry.details || (entry.changedFields && entry.changedFields.length > 0)) && (
                          <div className="mt-3 p-3 bg-muted/40 rounded-xl space-y-2 border border-border/50">
                            {entry.details && (
                              <p className="text-xs text-muted-foreground leading-relaxed">{entry.details}</p>
                            )}
                            {entry.changedFields && entry.changedFields.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-[10px] font-black text-foreground uppercase tracking-wider">{t('changedFields')}</p>
                                <div className="grid gap-2">
                                  {entry.changedFields.map((change, idx) => (
                                    <div key={idx} className={cn("text-xs text-muted-foreground p-2 rounded-lg bg-background/50 border border-border/30", isRtl && "text-right")}>
                                      <span className="font-bold text-foreground/80">{change.field}</span>
                                      <div className={cn("flex items-center gap-2 mt-1", isRtl && "flex-row-reverse")}>
                                        <span className="line-through opacity-50 bg-red-500/10 px-1 rounded">
                                          {change.oldValue}
                                        </span>
                                        <ArrowRight className={cn("h-3 w-3 opacity-30", isRtl && "rotate-180")} />
                                        <span className="text-emerald-600 font-bold bg-emerald-500/10 px-1 rounded">
                                          {change.newValue}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

import { Clock, User, FileText, Edit, Trash2, Plus, ArrowRight } from "lucide-react"
