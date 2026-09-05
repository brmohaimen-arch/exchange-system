/**
 * Work Order Type Badges & Icons
 * Provides consistent visual identity for CORRECTIVE, PREVENTIVE, REGULATORY, PREDICTIVE modules.
 * 
 * Color Scheme:
 *  - CORRECTIVE   → Red    (AlertCircle)
 *  - PREVENTIVE   → Blue   (CalendarCheck)
 *  - REGULATORY   → Purple (ShieldCheck)
 *  - PREDICTIVE   → Amber  (TrendingUp)
 */

import {
  AlertCircle,
  CalendarCheck,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { translateEnum } from "@/lib/enum-mappers"

export type WorkOrderTypeKey = "CORRECTIVE" | "PREVENTIVE" | "REGULATORY" | "PREDICTIVE"

export interface WorkOrderTypeConfig {
  icon: LucideIcon
  label: { en: string; fr: string; ar: string }
  /** Tailwind text color class */
  textColor: string
  /** Tailwind background color class (light) */
  bgColor: string
  /** Tailwind border color class */
  borderColor: string
  /** Tailwind ring/glow class for notifications */
  ringColor: string
}

export const WO_TYPE_CONFIG: Record<WorkOrderTypeKey, WorkOrderTypeConfig> = {
  CORRECTIVE: {
    icon: AlertCircle,
    label: { en: "Corrective", fr: "Correctif", ar: "تصحيحي" },
    textColor: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/40",
    borderColor: "border-red-200 dark:border-red-800",
    ringColor: "ring-red-500",
  },
  PREVENTIVE: {
    icon: CalendarCheck,
    label: { en: "Preventive", fr: "Préventif", ar: "وقائي" },
    textColor: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
    borderColor: "border-blue-200 dark:border-blue-800",
    ringColor: "ring-blue-500",
  },
  REGULATORY: {
    icon: ShieldCheck,
    label: { en: "Regulatory", fr: "Réglementaire", ar: "تنظيمي" },
    textColor: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/40",
    borderColor: "border-purple-200 dark:border-purple-800",
    ringColor: "ring-purple-500",
  },
  PREDICTIVE: {
    icon: TrendingUp,
    label: { en: "Predictive", fr: "Prédictif", ar: "تنبؤي" },
    textColor: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/40",
    borderColor: "border-amber-200 dark:border-amber-800",
    ringColor: "ring-amber-500",
  },
}

/**
 * Returns the config for a work order type, with a fallback for unknown types.
 */
export function getWoTypeConfig(type: string | undefined | null): WorkOrderTypeConfig {
  const normalized = (type ?? "").toUpperCase() as WorkOrderTypeKey
  return WO_TYPE_CONFIG[normalized] ?? {
    icon: AlertCircle,
    label: { en: type ?? "Unknown", fr: type ?? "Inconnu", ar: type ?? "غير معروف" },
    textColor: "text-muted-foreground",
    bgColor: "bg-muted",
    borderColor: "border-border",
    ringColor: "ring-border",
  }
}

/**
 * A compact inline badge showing the icon + label for a work order type.
 * Respects the current language.
 */
interface WorkOrderTypeBadgeProps {
  type: string | undefined | null
  lang?: "en" | "fr" | "ar"
  size?: "sm" | "md" | "lg"
  showLabel?: boolean
  className?: string
}

export function WorkOrderTypeBadge({
  type,
  size = "md",
  showLabel = true,
  className,
}: WorkOrderTypeBadgeProps) {
  const { language } = useI18n()
  const config = getWoTypeConfig(type)
  const label = translateEnum("woType", type, language)
  const Icon = config.icon

  const sizeClasses = {
    sm: { badge: "px-1.5 py-0.5 text-xs gap-1", icon: "h-3 w-3" },
    md: { badge: "px-2 py-1 text-xs gap-1.5", icon: "h-3.5 w-3.5" },
    lg: { badge: "px-2.5 py-1.5 text-xs gap-2", icon: "h-4 w-4" },
  }[size]

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium border",
        sizeClasses.badge,
        config.textColor,
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <Icon className={cn(sizeClasses.icon, "shrink-0")} />
      {showLabel && label}
    </span>
  )
}

/**
 * A standalone icon for a work order type with colored background circle.
 * Ideal for use in notifications, dashboard tiles, and list rows.
 */
interface WorkOrderTypeIconProps {
  type: string | undefined | null
  size?: "sm" | "md" | "lg"
  className?: string
}

export function WorkOrderTypeIcon({ type, size = "md", className }: WorkOrderTypeIconProps) {
  const config = getWoTypeConfig(type)
  const Icon = config.icon

  const sizeClasses = {
    sm: { wrapper: "h-6 w-6", icon: "h-3 w-3" },
    md: { wrapper: "h-8 w-8", icon: "h-4 w-4" },
    lg: { wrapper: "h-8 w-10", icon: "h-5 w-5" },
  }[size]

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border",
        sizeClasses.wrapper,
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <Icon className={cn(sizeClasses.icon, config.textColor, "shrink-0")} />
    </span>
  )
}
