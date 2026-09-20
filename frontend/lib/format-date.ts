// Locale-independent date formatting. `toLocaleDateString('ar')` and the
// native <input type="date"> both follow the browser's locale, which on some
// browsers renders mm/dd/yyyy in Arabic-Indic digits — unreadable. Everything
// here is plain string math, so the output is identical in every browser.

/** "2026-09-19" | "2026-09-19T14:30:00" | "2026-09-19 14:30" -> "2026/09/19" */
export function formatDate(value?: string | null): string {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : value
}

/** Same, plus " HH:MM" when the value carries a time part. */
export function formatDateTime(value?: string | null): string {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value)
  return m ? `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}` : formatDate(value)
}
