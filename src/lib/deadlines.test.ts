import { describe, expect, it } from 'vitest'
import {
  deadlinesForTaxYear,
  mtdApplies,
  mtdQuarterlyDates,
  mtdThresholdForTaxYear,
  sortByUrgency,
  withStatus,
  type Deadline,
} from './deadlines'
import { makeTaxYearForTest } from './taxYear.test-helpers'

describe('deadlinesForTaxYear', () => {
  const ty = makeTaxYearForTest(2026) // 2025/26

  it('registers before 5 October of the year the tax year starts', () => {
    const d = deadlinesForTaxYear(ty).find((x) => x.kind === 'register')
    expect(d?.date).toBe('2025-10-05')
  })

  it('paper return is due 31 October of the start year', () => {
    const d = deadlinesForTaxYear(ty).find((x) => x.kind === 'paper_return')
    expect(d?.date).toBe('2025-10-31')
  })

  it('online return, balancing payment and first payment on account are 31 January of the end year', () => {
    const ds = deadlinesForTaxYear(ty)
    for (const kind of ['online_return', 'balancing_payment', 'payment_on_account_1'] as const) {
      expect(ds.find((x) => x.kind === kind)?.date).toBe('2026-01-31')
    }
  })

  it('second payment on account is 31 July of the end year', () => {
    const d = deadlinesForTaxYear(ty).find((x) => x.kind === 'payment_on_account_2')
    expect(d?.date).toBe('2026-07-31')
  })
})

describe('mtdQuarterlyDates', () => {
  it('returns the four quarterly update dates', () => {
    const dates = mtdQuarterlyDates(makeTaxYearForTest(2027)).map((d) => d.date)
    expect(dates).toEqual(['2026-08-07', '2026-11-07', '2027-02-07', '2027-05-07'])
  })
})

describe('mtdApplies', () => {
  it('is null before 2026/27 (voluntary only)', () => {
    expect(mtdThresholdForTaxYear(makeTaxYearForTest(2026))).toBeNull()
  })

  it('thresholds step down 50k / 30k / 20k', () => {
    expect(mtdThresholdForTaxYear(makeTaxYearForTest(2027))).toBe(50000)
    expect(mtdThresholdForTaxYear(makeTaxYearForTest(2028))).toBe(30000)
    expect(mtdThresholdForTaxYear(makeTaxYearForTest(2029))).toBe(20000)
    expect(mtdThresholdForTaxYear(makeTaxYearForTest(2030))).toBe(20000)
  })

  it('applies only when gross income exceeds the threshold', () => {
    expect(mtdApplies(makeTaxYearForTest(2027), 60000)).toBe(true)
    expect(mtdApplies(makeTaxYearForTest(2027), 50000)).toBe(false)
    expect(mtdApplies(makeTaxYearForTest(2026), 99999)).toBe(false)
  })
})

describe('withStatus / sortByUrgency', () => {
  const deadlines: Deadline[] = [
    { kind: 'register', date: '2025-10-05', label: 'a', detail: '' },
    { kind: 'online_return', date: '2026-01-31', label: 'b', detail: '' },
  ]

  it('marks past dates overdue and future dates upcoming', () => {
    const items = withStatus(deadlines, new Date('2026-01-10T12:00:00'))
    expect(items.find((i) => i.date === '2025-10-05')?.status).toBe('overdue')
    expect(items.find((i) => i.date === '2026-01-31')?.status).toBe('upcoming')
  })

  it('marks done dates regardless of the calendar', () => {
    const items = withStatus(deadlines, new Date('2026-06-01T12:00:00'), new Set(['2025-10-05register']))
    expect(items.find((i) => i.date === '2025-10-05')?.status).toBe('done')
  })

  it('sorts overdue first, then upcoming, then done', () => {
    const items = withStatus(deadlines, new Date('2026-06-01T12:00:00'), new Set(['2025-10-05register']))
    const sorted = sortByUrgency(items)
    expect(sorted.map((s) => s.status)).toEqual(['overdue', 'done'])
  })
})
