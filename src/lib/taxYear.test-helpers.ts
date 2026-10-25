import type { TaxYear } from './taxYear'

/** Build the tax year labelled by the given ending calendar year, e.g. 2026 = 2025/26. */
export function makeTaxYearForTest(endYear: number): TaxYear {
  return {
    label: endYear,
    start: new Date(endYear - 1, 3, 6),
    end: new Date(endYear, 3, 5, 23, 59, 59, 999),
  }
}
