// Search helpers shared by the quick-access bar and the table filters.
// Arabic text is compared loosely: hamza/alef forms, ى/ي, ة/ه, diacritics and
// Arabic-Indic digits are all folded so "احمد", "أحمد" and "أَحْمَد" match each other.

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .toLowerCase()
    .replace(/[٠-٩۰-۹]/g, (d) => String(ARABIC_DIGITS.indexOf(d) >= 0 ? ARABIC_DIGITS.indexOf(d) : PERSIAN_DIGITS.indexOf(d)))
    .replace(/[ً-ٰٟـ]/g, '') // diacritics + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Digits only, without a Libyan country code or leading zero: "+218 91-830 3003" -> "918303003". */
export function phoneCore(value: unknown): string {
  let d = normalizeText(value).replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('218')) d = d.slice(3)
  return d.replace(/^0+/, '')
}

/** True when every word of the query appears somewhere in the haystack fields. */
export function matchesQuery(query: string, ...fields: unknown[]): boolean {
  const q = normalizeText(query)
  if (!q) return true
  const hay = fields.map(normalizeText).join(' | ')
  return q.split(' ').every((word) => hay.includes(word))
}

/** Customer-style match: words in the name/code/fields, or the digits typed match the phone in any local/international form. */
export function matchesPersonQuery(query: string, fields: unknown[], phone?: unknown): boolean {
  const q = normalizeText(query)
  if (!q) return true
  if (matchesQuery(q, ...fields)) return true
  const digits = phoneCore(q)
  return digits.length >= 3 && phoneCore(phone).includes(digits)
}
