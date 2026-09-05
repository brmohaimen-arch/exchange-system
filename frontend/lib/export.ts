export type CsvCell = string | number | boolean | null | undefined

function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return ""
  const raw = String(value)
  const needsQuotes = /[",\n\r]/.test(raw)
  const escaped = raw.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines: string[] = []
  lines.push(headers.map(escapeCsvCell).join(","))
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(","))
  }
  return lines.join("\n")
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()

  URL.revokeObjectURL(url)
}

export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  const csv = toCsv(headers, rows)
  downloadTextFile(filename, csv, "text/csv;charset=utf-8")
}
