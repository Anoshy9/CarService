/**
 * UK tax year helpers.
 * A UK tax year runs from 6 April to 5 April of the following calendar year.
 * The tax year is conventionally labelled by the ending calendar year,
 * e.g. 6 April 2024 - 5 April 2025 = "2024/25" (labelled 2025).
 */

export interface TaxYear {
  /** Label of the ending calendar year, e.g. 2025 for 2024/25. */
  label: number
  start: Date
  end: Date
}

/** Tax year containing the given date (defaults to today). */
export function getTaxYear(date: Date = new Date()): TaxYear {
  const year = date.getFullYear()
  const april6 = new Date(year, 3, 6)
  if (date < april6) {
    return makeTaxYear(year)
  }
  return makeTaxYear(year + 1)
}

function makeTaxYear(endYear: number): TaxYear {
  return {
    label: endYear,
    start: new Date(endYear - 1, 3, 6),
    end: new Date(endYear, 3, 5, 23, 59, 59, 999),
  }
}

/** All tax years from `count` years before the current one, up to the current one. */
export function listRecentTaxYears(count = 5, reference: Date = new Date()): TaxYear[] {
  const current = getTaxYear(reference)
  const years: TaxYear[] = []
  for (let i = count - 1; i >= 0; i--) {
    years.push(makeTaxYear(current.label - i))
  }
  return years
}

/** True when the date falls inside the tax year. */
export function isInTaxYear(date: Date, taxYear: TaxYear): boolean {
  return date >= taxYear.start && date <= taxYear.end
}

/** Format a tax year for display, e.g. "2024/25". */
export function formatTaxYear(taxYear: TaxYear): string {
  const startLabel = taxYear.label - 1
  return `${startLabel}/${String(taxYear.label).slice(2)}`
}

/** Parse "YYYY-MM-DD" (local time) into a Date. */
export function parseISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Format a Date as "YYYY-MM-DD" (local time). */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
