'use client'

import { ChevronRight, ChevronLeft } from 'lucide-react'

export const PAGE_SIZE = 15

interface TablePaginationProps {
  page: number
  totalItems: number
  pageSize?: number
  onPageChange: (page: number) => void
}

export function TablePagination({ page, totalItems, pageSize = PAGE_SIZE, onPageChange }: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (totalPages <= 1) return null

  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between border-t border-border px-6 py-3 text-sm text-muted-foreground">
      <span>عرض {from}-{to} من {totalItems}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-3.5 w-3.5" /> السابق
        </button>
        <span className="text-xs">صفحة {page} من {totalPages}</span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          التالي <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/** Slices `sortedNewestFirst` to the given page. Clamps `page` back into range
 * if the underlying list shrank (e.g. after a delete) so callers don't need
 * to guard against an out-of-bounds page themselves. */
export function paginate<T>(sortedNewestFirst: T[], page: number, pageSize = PAGE_SIZE): T[] {
  const totalPages = Math.max(1, Math.ceil(sortedNewestFirst.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  return sortedNewestFirst.slice((safePage - 1) * pageSize, safePage * pageSize)
}
