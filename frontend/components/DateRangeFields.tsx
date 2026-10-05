'use client'

import { DateInput } from '@/components/ui/date-input'

const inputClass = 'rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50'

/**
 * "من تاريخ / إلى تاريخ" pair used by every movements screen. Moving one end
 * past the other drags the other end along, so the range can never invert
 * into an empty result by accident.
 */
export function DateRangeFields({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">من تاريخ</label>
        <DateInput
          value={from}
          onChange={(e) => {
            const v = e.target.value
            onChange(v, v && to && v > to ? v : to)
          }}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">إلى تاريخ</label>
        <DateInput
          value={to}
          onChange={(e) => {
            const v = e.target.value
            onChange(v && from && v < from ? v : from, v)
          }}
          className={inputClass}
        />
      </div>
    </>
  )
}
