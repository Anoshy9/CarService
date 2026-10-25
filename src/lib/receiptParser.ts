/**
 * Best-effort extraction of (merchant, amount, date) from raw OCR text of
 * a UK receipt. Handles £ / GBP formats, comma thousands separators and
 * common date layouts (dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd).
 */

export interface ParsedReceipt {
  merchant: string | null
  amount: number | null
  date: string | null // ISO YYYY-MM-DD
}

function normaliseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[£€$]/g, '').replace(/,/g, '').trim()
  const value = Number.parseFloat(cleaned)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100) / 100
}

/** Find the most plausible total: prefer lines containing TOTAL/TTC/BALANCE DUE. */
function extractAmount(lines: string[]): number | null {
  const totalLines = lines.filter((l) =>
    /\b(total|grand\s*total|balance\s*due|amount\s*due|ttc|t\.a\.c|to\s*pay|somme)\b/i.test(l),
  )
  for (const line of totalLines.length > 0 ? totalLines : lines) {
    const matches = line.match(/£\s?\d[\d,]*\.?\d{0,2}|\b\d{1,5},\d{3}\.\d{2}\b|\b\d+\.\d{2}\b/g)
    if (!matches || matches.length === 0) continue
    // Take the last money-like token on the line (totals sit on the right).
    const amount = normaliseAmount(matches[matches.length - 1])
    if (amount !== null && amount < 1_000_000) return amount
  }
  return null
}

/** Parse dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy or yyyy-mm-dd into ISO. */
function normaliseDate(raw: string): string | null {
  const uk = raw.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/)
  if (uk) {
    let [, d, m, y] = uk
    let year = Number(y)
    if (year < 100) year += 2000
    if (year < 1990 || year > 2100) return null
    const day = Number(d)
    const month = Number(m)
    if (day < 1 || day > 31 || month < 1 || month > 12) return null
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const iso = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) return iso[0]
  return null
}

function extractDate(lines: string[]): string | null {
  for (const line of lines) {
    const date = normaliseDate(line)
    if (date) return date
  }
  return null
}

function extractMerchant(lines: string[]): string | null {
  for (const line of lines) {
    const trimmed = line.trim()
    // Skip lines that look like addresses, VAT numbers, phone numbers or totals.
    if (!trimmed) continue
    if (/\b(vat|reg(?:istered)?|tva|company|ltd|plc|limited|vat\s*(no|number|#)|tél|tel|phone)\b/i.test(trimmed)) continue
    if (/^\d+\s+\w+\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr|way|close|court)\b/i.test(trimmed)) continue
    if (/^\d{5}(-\d{4})?$/.test(trimmed)) continue
    if (/^\d+[\s./-]*\d+[\s./-]*\d+$/.test(trimmed)) continue
    if (trimmed.length < 3) continue
    if (/^[*#=\-\s]+$/.test(trimmed)) continue
    if (/^\s*£?\s*\d/.test(trimmed)) continue // amounts / item lines
    return trimmed.replace(/\s+/g, ' ').slice(0, 60)
  }
  return null
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  return {
    merchant: extractMerchant(lines),
    amount: extractAmount(lines),
    date: extractDate(lines),
  }
}
