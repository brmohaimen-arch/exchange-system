'use client'

import { useLayoutEffect, useRef, type ChangeEvent, type InputHTMLAttributes } from 'react'

const ARABIC_DIGITS: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '٫': '.', '،': ',' }

/** "1234567.5" -> "1,234,567.5" (also "-", trailing ".", and partial input like "12."). */
export function formatNumberInput(raw: string): string {
  if (raw === '') return ''
  const neg = raw.startsWith('-')
  const [intPart, decPart] = (neg ? raw.slice(1) : raw).split('.')
  return `${neg ? '-' : ''}${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${decPart !== undefined ? `.${decPart}` : ''}`
}

/**
 * Drop-in replacement for <input type="number"> that shows thousands
 * separators WHILE typing (100000 -> 100,000). The value handed to the
 * page's onChange is always the plain number string ("100000"), so existing
 * parseFloat()/validation code keeps working unchanged.
 */
export function NumberInput({ value, onChange, min, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  const display = formatNumberInput(value === undefined || value === null ? '' : String(value))
  const allowNegative = !(min !== undefined && Number(min) >= 0)

  // Put the caret back where the user was typing (formatting shifts characters).
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current)
    }
    caret.current = null
  })

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    const typed = el.value.replace(/[٠-٩٫،]/g, (c) => ARABIC_DIGITS[c])
    const raw = typed.replace(/,/g, '')
    const valid = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/
    if (!valid.test(raw)) return
    // Caret position measured in real characters (commas excluded), re-applied after formatting.
    const digitsBeforeCaret = typed.slice(0, el.selectionStart ?? typed.length).replace(/,/g, '').length
    const formatted = formatNumberInput(raw)
    let seen = 0
    let pos = formatted.length
    for (let i = 0; i < formatted.length; i++) {
      if (seen === digitsBeforeCaret) { pos = i; break }
      if (formatted[i] !== ',') seen++
    }
    caret.current = pos
    onChange?.({ target: { value: raw, name: el.name, id: el.id }, currentTarget: { value: raw, name: el.name, id: el.id } } as unknown as ChangeEvent<HTMLInputElement>)
  }

  return <input {...rest} ref={ref} type="text" inputMode="decimal" value={display} onChange={handleChange} />
}
