"use client"

import { useState } from "react"
import { 
  ChevronRight, 
  ChevronDown, 
  MoreVertical, 
  Clock, 
  AlertCircle,
  Wrench,
  CheckCircle2,
  Calendar,
  User,
  ArrowRight,
  Lock
} from "lucide-react"
import React from "react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/components/status-badge"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu"
import { TaskResponse } from "@/lib/api/types"
import { format, isPast } from "date-fns"
import { useI18n } from "@/lib/i18n"

interface TaskHierarchyTableProps {
  tasks: TaskResponse[]
  onSelectTask: (task: TaskResponse) => void
  onUpdateStatus: (taskId: number, status: string) => void
  onDeleteTask: (taskId: number) => void
}

export function TaskHierarchyTable({ tasks, onSelectTask, onUpdateStatus, onDeleteTask }: TaskHierarchyTableProps) {
  const { t, isRTL } = useI18n()
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25

  const paginatedTasks = tasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
  const totalPages = Math.ceil(tasks.length / itemsPerPage)

  const toggleRow = (taskId: number) => {
    const next = new Set(expandedRows)
    if (next.has(taskId)) {
      next.delete(taskId)
    } else {
      next.add(taskId)
    }
    setExpandedRows(next)
  }

  const getPriorityColor = (priority: string) => {
    switch (priority?.toUpperCase()) {
      case 'CRITICAL': return 'text-danger bg-danger/10 border-danger/20'
      case 'HIGH': return 'text-warning bg-warning/10 border-warning/20'
      case 'MEDIUM': return 'text-info bg-info/10 border-info/20'
      default: return 'text-muted-foreground bg-muted border-border'
    }
  }

  const renderTaskRows = (task: TaskResponse, level: number = 0) => {
    const isExpanded = expandedRows.has(task.taskId)
    const hasChildren = task.childTasks && task.childTasks.length > 0
    const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== 'DONE'

    return (
      <React.Fragment key={task.taskId}>
        <TableRow 
          key={task.taskId} 
          className={cn(
            "group hover:bg-muted/50 transition-colors cursor-pointer",
            level > 0 ? "bg-muted/20" : ""
          )}
          onClick={() => onSelectTask(task)}
        >
          <TableCell className="w-0 p-3">
            {hasChildren && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6" 
                onClick={(e) => {
                  e.stopPropagation()
                  toggleRow(task.taskId)
                }}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : (isRTL ? <ChevronRight className="h-4 w-4 rotate-180" /> : <ChevronRight className="h-4 w-4" />)}
              </Button>
            )}
          </TableCell>
          <TableCell style={{ [isRTL ? 'paddingRight' : 'paddingLeft']: `${level * 24 + 16}px` }}>
            <div className={cn("flex flex-col gap-0.5 max-w-[300px]", isRTL ? "text-right" : "")}>
              <div className={cn("flex items-center gap-2", isRTL ? "flex-row-reverse" : "")}>
                 <span className={cn(
                   "font-bold text-xs truncate",
                   task.status === 'DONE' ? "text-muted-foreground/50 line-through" : "text-foreground"
                 )}>
                   {task.title || task.description}
                 </span>
                 {task.isAdHoc && (
                   <Badge variant="outline" className="text-[10px] scale-90 border-info/20 text-info bg-info/5 px-1 py-0 font-bold uppercase">{t('adHoc')}</Badge>
                 )}
              </div>
              <div className={cn("flex items-center gap-2 text-[10px] text-muted-foreground", isRTL ? "flex-row-reverse" : "")}>
                 <span className="flex items-center gap-0.5 font-bold opacity-60 tracking-tighter uppercase"><Lock className="h-2.5 w-2.5" /> WO-{task.woId}</span>
                 {task.parentTaskId && <span className="flex items-center gap-0.5">{isRTL ? <ArrowRight className="h-2.5 w-2.5 rotate-180" /> : <ArrowRight className="h-2.5 w-2.5" />} {t('derivedTask')}</span>}
              </div>
            </div>
          </TableCell>
          <TableCell>
            <div className="flex flex-col gap-1 w-[120px]">
               <div className={cn("flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-tighter", isRTL ? "flex-row-reverse" : "")}>
                  <span>{t('progress')}</span>
                  <span className="text-primary">{Math.round(task.progress || 0)}%</span>
               </div>
               <Progress value={task.progress || 0} className="h-1.5 bg-muted" />
            </div>
          </TableCell>
          <TableCell>
            <div className={cn("flex items-center gap-2 min-w-[140px]", isRTL ? "flex-row-reverse text-right" : "")}>
               <User className="h-3.5 w-3.5 text-slate-400" />
               <div className="flex flex-col">
                  <span className="text-xs font-medium text-foreground">{task.assignedToName || t('unassigned')}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('technician')}</span>
               </div>
            </div>
          </TableCell>
          <TableCell>
             <Badge variant="outline" className={cn("text-[10px] font-bold border", getPriorityColor(task.priority || 'MEDIUM'))}>
               {t((task.priority || 'MEDIUM').toLowerCase())}
             </Badge>
          </TableCell>
          <TableCell>
            <StatusBadge status={task.status} />
          </TableCell>
          <TableCell>
            <div className={cn("flex items-center gap-2", isRTL ? "flex-row-reverse text-right" : "")}>
               <div className={cn("p-1.5 rounded-lg", isOverdue ? 'bg-danger/10 text-danger' : 'bg-muted text-muted-foreground')}>
                  <Calendar className="h-4 w-4" />
               </div>
               <div className="flex flex-col">
                  <span className={cn("text-xs font-bold tracking-tight", isOverdue ? 'text-rose-500' : 'text-foreground/90')}>
                    {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : t('noDate')}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground">{t('dueDate')}</span>
               </div>
            </div>
          </TableCell>
          <TableCell className={isRTL ? "text-left" : "text-right"}>
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                   <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                   </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isRTL ? "start" : "end"} className="w-48" dir={isRTL ? "rtl" : "ltr"}>
                   <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSelectTask(task); }}>
                      <Wrench className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} /> {t('viewDetails')}
                   </DropdownMenuItem>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem className="text-emerald-600 dark:text-emerald-400" onClick={(e) => { e.stopPropagation(); onUpdateStatus(task.taskId, 'DONE'); }}>
                      <CheckCircle2 className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} /> {t('markCompleted')}
                   </DropdownMenuItem>
                   <DropdownMenuItem className="text-rose-600" onClick={(e) => { e.stopPropagation(); onDeleteTask(task.taskId); }}>
                      <AlertCircle className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} /> {t('deleteTask')}
                   </DropdownMenuItem>
                </DropdownMenuContent>
             </DropdownMenu>
          </TableCell>
        </TableRow>
        {isExpanded && hasChildren && task.childTasks!.map(child => renderTaskRows(child, level + 1))}
      </React.Fragment>
    )
  }

  const columns = [
    { key: 'expander', label: '', className: "w-[10px]" },
    { key: 'title', label: t('executionTask'), className: "font-bold text-[11px] uppercase tracking-wider text-muted-foreground" },
    { key: 'progress', label: t('statusProgress'), className: "font-bold text-[11px] uppercase tracking-wider text-muted-foreground" },
    { key: 'assignedTo', label: t('assignedTo'), className: "font-bold text-[11px] uppercase tracking-wider text-muted-foreground" },
    { key: 'priority', label: t('priority'), className: "font-bold text-[11px] uppercase tracking-wider text-muted-foreground" },
    { key: 'status', label: t('status'), className: "font-bold text-[11px] uppercase tracking-wider text-muted-foreground" },
    { key: 'deadline', label: t('deadline'), className: "font-bold text-[11px] uppercase tracking-wider text-muted-foreground" },
    { key: 'actions', label: '', className: "w-[10px] text-right" }
  ]

  return (
    <div className="bg-card rounded-xl border border-border/60 shadow-xl overflow-hidden shadow-primary/5" dir={isRTL ? "rtl" : "ltr"}>
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            {columns.map(col => (
              <TableHead key={col.key} className={cn(col.className, isRTL ? "text-right" : "")}>
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedTasks.length > 0 ? (
            paginatedTasks.map((task) => renderTaskRows(task))
          ) : (
            <TableRow>
              <TableCell colSpan={8} className="h-32 text-center text-muted-foreground italic">
                {t('noActiveTasks')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <div className={cn("flex items-center justify-between border-t border-border p-3", isRTL ? "flex-row-reverse" : "")}>
          <p className="text-xs text-muted-foreground">
            {t('showing')} <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> {t('to')} <span className="font-medium">{Math.min(currentPage * itemsPerPage, tasks.length)}</span> {t('of')} <span className="font-medium">{tasks.length}</span> {t('results')}
          </p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              {t('previous')}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
