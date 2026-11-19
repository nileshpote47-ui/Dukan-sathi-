/*
 * Minimal CSV writer (RFC 4180 quoting). Cells that start with = + - @ or a tab are prefixed
 * with ' so spreadsheet apps never run them as formulas (CSV injection). UTF-8 with BOM so
 * Excel shows Marathi/Hindi text correctly.
 */

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
