"use client"

import { motion } from "framer-motion"
import { 
  FileText, 
  Users, 
  Clock, 
  Play, 
  CheckSquare, 
  CheckCircle2, 
  Archive,
  AlertTriangle,
  XCircle,
  ChevronRight
} from "lucide-react"
import { getStatusColorVar, getStatusTextColorVar } from "@/lib/colors-util"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface Stage {
  key: string
  label: string
  shortLabel: string
  icon: React.ReactNode
  description: string
}

const STAGES: any[] = [
  {
    key: "CREATED",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    key: "ASSIGNED",
    icon: <Users className="h-4 w-4" />,
  },
  {
    key: "SCHEDULED",
    icon: <Clock className="h-4 w-4" />,
  },
  {
    key: "IN_PROGRESS",
    icon: <Play className="h-4 w-4" />,
  },
  {
    key: "COMPLETED",
    icon: <CheckSquare className="h-4 w-4" />,
  },
  {
    key: "VALIDATED",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  {
    key: "CLOSED",
    icon: <Archive className="h-4 w-4" />,
  },
]

const STATUS_ORDER = ["CREATED", "ASSIGNED", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "VALIDATED", "CLOSED"]

interface WorkOrderLifecycleFlowProps {
  status: string
}

export function WorkOrderLifecycleFlow({ status }: WorkOrderLifecycleFlowProps) {
  const { t, language } = useI18n()
  const isRtl = language === 'ar'

  if (!status) return null
  const upperStatus = status.toUpperCase()
  const isCancelled = upperStatus === "CANCELLED"
  const isOnHold = upperStatus === "ON_HOLD"
  const isSpecial = isCancelled || isOnHold

  const currentIndex = STATUS_ORDER.indexOf(upperStatus)

  const getStageState = (index: number) => {
    if (isSpecial) return index < currentIndex ? "done" : "upcoming"
    if (index < currentIndex) return "done"
    if (index === currentIndex) return "active"
    return "upcoming"
  }

  const getLocalizedStage = (stage: any) => {
    return {
      ...stage,
      label: t(`status_${stage.key.toLowerCase()}` as any),
      shortLabel: t(`status_${stage.key.toLowerCase()}` as any),
      description: t(`desc_${stage.key.toLowerCase()}` as any),
    }
  }

  return (
    <div className="w-full space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Special status banners */}
      {isOnHold && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-xl text-xs font-medium",
            isRtl && "flex-row-reverse text-right"
          )}
        >
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          {t('woOnHoldBanner')}
        </motion.div>
      )}
      {isCancelled && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "flex items-center gap-3 bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 rounded-xl text-xs font-medium",
            isRtl && "flex-row-reverse text-right"
          )}
        >
          <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
          {t('woCancelledBanner')}
        </motion.div>
      )}

      {/* Main flow track */}
      <div className="relative bg-card rounded-2xl border border-border/60 shadow-sm p-5 overflow-hidden">
        {/* Background shimmer stripe for active state */}
        {!isSpecial && (
          <div 
            className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500 transition-all duration-700"
            style={{ width: `${Math.max(5, ((currentIndex + 0.5) / STAGES.length) * 100)}%` }}
          />
        )}

        <div className="overflow-x-auto pb-6 px-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          <div className={cn(
            "flex items-center justify-start md:justify-center gap-3 min-w-max mx-auto py-2",
            isRtl && "flex-row-reverse"
          )}>
            {STAGES.map((stage, index) => {
              const state = getStageState(index)
              const isLast = index === STAGES.length - 1
              const localizedStage = getLocalizedStage(stage)

              return (
                <div key={stage.key} className={cn("flex items-center gap-3", isRtl && "flex-row-reverse")}>
                  <StageNode stage={localizedStage} state={state} isRtl={isRtl} />
                  {!isLast && (
                    <div className={cn(
                      "h-[3px] w-12 sm:w-16 md:w-24 rounded-full transition-all duration-500",
                      state === "done" ? "bg-emerald-400" : "bg-slate-100"
                    )} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Current stage detail */}
        <div className="mt-5 pt-4 border-t border-border/50">
          {isSpecial ? (
            <p className={cn("text-xs text-slate-500 italic", isRtl && "text-right")}>
              {t('flowPausedAt')}: <strong>{t(`status_${upperStatus.toLowerCase()}` as any)}</strong>
            </p>
          ) : (
            (() => {
              const currentRaw = STAGES[currentIndex] ?? STAGES[0]
              const current = getLocalizedStage(currentRaw)
              return (
                <div className={cn("flex items-center gap-3", isRtl && "flex-row-reverse")}>
                  <div 
                    className={`p-3 rounded-2xl shadow-lg transition-transform duration-300 hover:scale-105`}
                    style={{
                      backgroundColor: getStatusColorVar(current.key),
                      color: getStatusTextColorVar(current.key),
                      boxShadow: `0 10px 15px -3px rgba(var(--color-status-${current.key.toLowerCase().replace(/_/g, '-')}-rgb, 0,0,0), 0.2)`
                    }}
                  >
                    {current.icon}
                  </div>
                  <div className={cn("space-y-0.5", isRtl && "text-right")}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{t('currentStage')}</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{current.label}</p>
                    <p className="text-xs text-slate-500 font-medium">{current.description}</p>
                  </div>
                  {currentIndex < STAGES.length - 1 && (
                    <div className={cn("ml-auto flex items-center gap-2 text-slate-300", isRtl && "mr-auto ml-0 flex-row-reverse")}>
                      <ChevronRight className={cn("h-4 w-4", isRtl && "rotate-180")} />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:block">
                        {t('next')}: {getLocalizedStage(STAGES[currentIndex + 1]).label}
                      </span>
                    </div>
                  )}
                </div>
              )
            })()
          )}
        </div>
      </div>
    </div>
  )
}

function StageNode({ stage, state }: { stage: Stage; state: "done" | "active" | "upcoming" }) {
  const statusColor = getStatusColorVar(stage.key)
  const statusTextColor = getStatusTextColorVar(stage.key)
  const statusRgb = `var(--color-status-${stage.key.toLowerCase().replace(/_/g, '-')}-rgb, 0,0,0)`

  return (
    <div className="flex flex-col items-center gap-3 group" title={stage.description}>
      <div className="relative">
        {state === "active" && (
          <span 
            className={`absolute inset-0 rounded-full animate-ping opacity-30`} 
            style={{ backgroundColor: statusColor }}
          />
        )}
        <motion.div
          initial={false}
          animate={{
            scale: state === "active" ? 1.15 : 1,
          }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={`
            relative h-8 w-12 md:h-8 md:w-14 rounded-full flex items-center justify-center border-[3px] transition-all duration-300 shadow-sm
            ${state === "upcoming" ? "bg-muted/30 border-border text-muted-foreground" : ""}
          `}
          style={{
            ...(state === "done" ? {
              backgroundColor: statusColor,
              borderColor: statusColor,
              color: statusTextColor,
              boxShadow: `0 4px 6px -1px rgba(${statusRgb}, 0.2)`
            } : state === "active" ? {
              backgroundColor: statusColor,
              borderColor: statusColor,
              color: statusTextColor,
              boxShadow: `0 0 0 4px rgba(${statusRgb}, 0.2), 0 10px 15px -3px rgba(${statusRgb}, 0.2)`
            } : {})
          }}
        >
          {state === "done" ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : (
            <div className="scale-125 md:scale-150">{stage.icon}</div>
          )}
        </motion.div>
      </div>
      <span 
        className={`text-[11px] md:text-[12px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors`}
        style={{ color: state !== "upcoming" ? statusColor : "var(--tw-prose-muted)" }}
      >
        {stage.shortLabel}
      </span>
    </div>
  )
}
