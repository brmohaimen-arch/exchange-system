'use client'

import { useRef, type InputHTMLAttributes } from 'react'
import { CalendarDays } from 'lucide-react'
import { formatDate } from '@/lib/format-date'

/**
 * Drop-in replacement for <input type="date">. The native control renders in
 * the browser's own locale (mm/dd/yyyy in Arabic-Indic digits on some
 * browsers), so the visible text here is always YYYY/MM/DD in Latin digits,
 * while the real (invisible) native input on top still provides the picker
 * and keeps the value in ISO YYYY-MM-DD.
 */
export function DateInput({ className = '', value, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const ref = useRef<HTMLInputElement>(null)
  const text = typeof value === 'string' ? formatDate(value) : ''
  return (
    <div className={`relative ${className.includes('w-full') ? 'w-full' : 'inline-block'}`}>
      <div className={`${className} flex items-center justify-between gap-2`} dir="ltr">
        <span className={text ? '' : 'text-muted-foreground'}>{text || 'YYYY/MM/DD'}</span>
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
      </div>
      <input
        {...rest}
        ref={ref}
        type="date"
        lang="en-GB"
        value={value}
        onClick={(e) => {
          rest.onClick?.(e)
          try { ref.current?.showPicker?.() } catch { /* picker already open / unsupported */ }
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  )
}
