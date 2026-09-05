"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { translateEnum } from "@/lib/enum-mappers"
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  PauseCircle,
  PlayCircle,
  Timer,
  User,
  Calendar,
  AlertCircle,
  CheckSquare
} from "lucide-react"

export type StatusType = 
  | 'DONE' | 'PASS' | 'COMPLETED'
  | 'IN_PROGRESS' | 'EXECUTING'
  | 'BLOCKED' | 'ON_HOLD'
  | 'FAIL' | 'REJECTED'
  | 'TODO' | 'PENDING' | 'CREATED' | 'ASSIGNED' | 'SCHEDULED'
  | 'OPEN' | 'QUALIFIED' | 'UNDER_REPAIR' | 'OPERATIONAL'
  | 'ARCHIVED' | 'RETIRED' | 'OUT_OF_SERVICE' | 'IN_SERVICE'

interface StatusBadgeProps {
  status: StatusType | string
  className?: string
  showIcon?: boolean
}

export function StatusBadge({ status, className, showIcon = true }: StatusBadgeProps) {
  const { language } = useI18n()
  const s = (status || "").toUpperCase()
  const label = translateEnum("status", s, language)

  const config: Record<string, { icon: any; classes: string }> = {
    DONE: { icon: CheckCircle2, classes: 'bg-success/10 text-success border-success/20 hover:bg-success/20' },
    COMPLETED: { icon: CheckCircle2, classes: 'bg-success/10 text-success border-success/20 hover:bg-success/20' },
    PASS: { icon: CheckCircle2, classes: 'bg-success/10 text-success border-success/20 hover:bg-success/20' },
    IN_PROGRESS: { icon: Timer, classes: 'bg-info/10 text-info border-info/20 hover:bg-info/20' },
    EXECUTING: { icon: Timer, classes: 'bg-info/10 text-info border-info/20 hover:bg-info/20' },
    BLOCKED: { icon: AlertTriangle, classes: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20' },
    ON_HOLD: { icon: PauseCircle, classes: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20' },
    FAIL: { icon: XCircle, classes: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20' },
    REJECTED: { icon: XCircle, classes: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20' },
    TODO: { icon: CheckSquare, classes: 'bg-muted text-muted-foreground border-border hover:bg-muted/80' },
    PENDING: { icon: Clock, classes: 'bg-muted text-muted-foreground border-border hover:bg-muted/80' },
    CREATED: { icon: PlayCircle, classes: 'bg-muted text-muted-foreground border-border hover:bg-muted/80' },
    ASSIGNED: { icon: User, classes: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20' },
    SCHEDULED: { icon: Calendar, classes: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20' },
    OPEN: { icon: PlayCircle, classes: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20' },
    QUALIFIED: { icon: CheckCircle2, classes: 'bg-success/10 text-success border-success/20 hover:bg-success/20' },
    UNDER_REPAIR: { icon: Timer, classes: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20' },
    OPERATIONAL: { icon: CheckCircle2, classes: 'bg-success/10 text-success border-success/20 hover:bg-success/20' },
    ARCHIVED: { icon: AlertCircle, classes: 'bg-muted text-muted-foreground border-border' },
    RETIRED: { icon: XCircle, classes: 'bg-destructive/10 text-destructive border-destructive/20' },
    OUT_OF_SERVICE: { icon: XCircle, classes: 'bg-destructive/10 text-destructive border-destructive/20' },
    IN_SERVICE: { icon: CheckCircle2, classes: 'bg-success/10 text-success border-success/20' },
  }

  const item = config[s] || { icon: Clock, classes: 'bg-muted text-muted-foreground border-border' }
  const Icon = item.icon

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "font-bold text-[10px] uppercase tracking-tight py-0.5 px-2 rounded-full transition-all duration-300 flex items-center w-fit",
        item.classes,
        className
      )}
    >
      {showIcon && <Icon className={cn("h-3 w-3", language === 'ar' ? 'ml-1' : 'mr-1')} />}
      {label}
    </Badge>
  )
}

function Square(props: any) {
  return <div className="h-2.5 w-2.5 border border-current rounded-sm mr-1" {...props} />
}
