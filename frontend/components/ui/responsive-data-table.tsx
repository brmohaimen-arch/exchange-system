"use client"

import React from "react"
import { motion } from "framer-motion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export interface Column<T> {
  header: string | React.ReactNode
  accessor: keyof T | ((item: T) => React.ReactNode)
  className?: string
  /** If true, this column is hidden on mobile and only shown in the card if mapped */
  hideOnMobile?: boolean
  /** Priority for column ordering in RTL if different from LTR */
  rtlOrder?: number
}

interface ResponsiveDataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  renderCard: (item: T) => React.ReactNode
  onRowClick?: (item: T) => void
  isLoading?: boolean
  emptyMessage?: string
  className?: string
  rowClassName?: string
}

export function ResponsiveDataTable<T>({
  columns,
  data,
  renderCard,
  onRowClick,
  isLoading,
  emptyMessage = "No data found",
  className,
  rowClassName,
}: ResponsiveDataTableProps<T>) {
  const { t, language, isRTL } = useI18n()
  const isRtl = isRTL // use the central flag

  // Sort columns if rtlOrder is provided and we are in RTL mode
  // In RTL, index 0 is the RIGHTMOST column. 
  // If we want Name on the right and Actions on the left, Name should have rtlOrder 0 and Actions should have high rtlOrder.
  const displayColumns = React.useMemo(() => {
    if (isRtl && columns.some((c) => c.rtlOrder !== undefined)) {
      return [...columns].sort((a, b) => (a.rtlOrder ?? 0) - (b.rtlOrder ?? 0))
    }
    return columns
  }, [columns, isRtl])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3" dir={isRtl ? "rtl" : "ltr"}>
        <div className="relative">
          <div className="h-6 w-6 border-[2px] border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{t('loading')}</p>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2" dir={isRtl ? "rtl" : "ltr"}>
        <div className="h-8 w-10 rounded-full bg-muted/50 flex items-center justify-center">
          <svg className="h-5 w-5 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={cn("w-full", className)} dir={isRtl ? "rtl" : "ltr"}>
      {/* Desktop/Tablet View */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/40">
              {displayColumns.map((col, i) => (
                <TableHead key={i} className={cn(col.className, isRtl ? "text-right" : "text-left", "text-[10px] font-bold uppercase tracking-wider text-muted-foreground h-8 py-1")}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, rowIndex) => (
              <TableRow
                key={rowIndex}
                className={cn(
                  "transition-all duration-150 border-b border-border/20",
                  onRowClick && "cursor-pointer hover:bg-muted/30",
                  rowIndex % 2 === 0 && "bg-muted/10",
                  rowClassName
                )}
                onClick={() => onRowClick?.(item)}
              >
                {displayColumns.map((col, colIndex) => (
                  <TableCell key={colIndex} className={cn(col.className, isRtl ? "text-right" : "text-left", "py-1.5 text-xs")}>
                    {typeof col.accessor === "function"
                      ? col.accessor(item)
                      : (item[col.accessor] as React.ReactNode)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile View - Cards */}
      <div className="md:hidden space-y-2.5">
        {data.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={() => onRowClick?.(item)}
            className={cn(
              "bg-card border border-border/50 rounded-xl p-3 shadow-sm transition-all duration-200 hover:shadow-premium hover:border-primary/20",
              onRowClick && "active:scale-[0.98] cursor-pointer"
            )}
          >
            {renderCard(item)}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
