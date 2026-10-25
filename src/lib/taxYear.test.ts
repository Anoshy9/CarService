import { describe, expect, it } from 'vitest'
import {
  formatTaxYear,
  getTaxYear,
  isInTaxYear,
  listRecentTaxYears,
  parseISODate,
  toISODate,
} from './taxYear'

describe('getTaxYear', () => {
  it('maps 5 April to the tax year ending the same calendar year', () => {
    expect(getTaxYear(new Date(2025, 3, 5)).label).toBe(2025)
  })

  it('maps 6 April to the tax year ending the next calendar year', () => {
    expect(getTaxYear(new Date(2025, 3, 6)).label).toBe(2026)
  })

  it('handles January dates as the previous ending year', () => {
    expect(getTaxYear(new Date(2025, 0, 15)).label).toBe(2025)
  })
})

describe('isInTaxYear', () => {
  const ty = getTaxYear(new Date(2025, 5, 1)) // 2025/26

  it('includes both boundaries', () => {
    expect(isInTaxYear(new Date(2025, 3, 6), ty)).toBe(true)
    expect(isInTaxYear(new Date(2026, 3, 5, 23, 59), ty)).toBe(true)
  })

  it('excludes dates outside', () => {
    expect(isInTaxYear(new Date(2025, 3, 5), ty)).toBe(false)
    expect(isInTaxYear(new Date(2026, 3, 6), ty)).toBe(false)
  })
})

describe('listRecentTaxYears', () => {
  it('returns the requested number of consecutive years ending at the current one', () => {
    const years = listRecentTaxYears(3, new Date(2025, 5, 1))
    expect(years.map((y) => y.label)).toEqual([2024, 2025, 2026])
  })
})

describe('formatTaxYear', () => {
  it('formats as YYYY/YY', () => {
    expect(formatTaxYear(getTaxYear(new Date(2025, 5, 1)))).toBe('2025/26')
  })
})

describe('date helpers', () => {
  it('round-trips ISO dates', () => {
    const d = parseISODate('2025-01-31')
    expect(toISODate(d)).toBe('2025-01-31')
  })
})
