"use client"

import { format } from "date-fns"
import { CheckCircle2, Circle, Clock, AlertCircle, XCircle, Info } from "lucide-react"
import { TaskAuditLogResponse } from "@/lib/api/types"
import { getStatusColorVar } from "@/lib/colors-util"

interface TaskTimelineProps {
  logs: TaskAuditLogResponse[]
}

export function TaskTimeline({ logs }: TaskTimelineProps) {
  if (!logs || logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
        <Info className="h-8 w-8 mb-2 opacity-20" />
        <p className="text-xs">No activity recorded yet.</p>
      </div>
    )
  }

  const getStatusIcon = (status: string) => {
    const color = getStatusColorVar(status, 'TIMELINE')
    switch (status.toUpperCase()) {
      case 'DONE':
      case 'PASS':
      case 'COMPLETED':
        return <CheckCircle2 className="h-4 w-4" style={{ color }} />
      case 'IN_PROGRESS':
        return <Clock className="h-4 w-4" style={{ color }} />
      case 'BLOCKED':
        return <AlertCircle className="h-4 w-4" style={{ color }} />
      case 'FAIL':
        return <XCircle className="h-4 w-4" style={{ color }} />
      case 'SKIPPED':
        return <Circle className="h-4 w-4" style={{ color }} />
      default:
        return <Circle className="h-4 w-4 text-slate-300" />
    }
  }

  return (
    <div className="relative space-y-6 before:absolute before:left-[11px] before:top-2 before:h-[calc(100%-16px)] before:w-[2px] before:bg-border/60">
      {logs.map((log) => (
        <div key={log.id} className="relative pl-8">
          <div className="absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-card ring-2 ring-muted shadow-sm">
            {getStatusIcon(log.newStatus)}
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-foreground">
                {log.newStatus.replace('_', ' ')}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                {format(new Date(log.changedAt), 'MMM d, HH:mm')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-bold text-foreground">{log.changedBy}</span>
              {log.oldStatus ? ` changed status from ${log.oldStatus.replace('_', ' ')}` : ' created the task'}
            </p>
            {log.note && (
              <div className="mt-2 rounded-lg bg-muted/50 p-2 text-[11px] italic text-muted-foreground border-l-2 border-primary/20 leading-relaxed">
                "{log.note}"
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
