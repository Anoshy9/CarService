import { describe, expect, it } from 'vitest'
import {
  ANNUAL_ALLOWANCE_GROSS,
  summariseSipp,
  type SippContribution,
} from './sipp'

const contribution = (netAmount: number): SippContribution => ({
  id: Math.random().toString(36).slice(2),
  netAmount,
  date: '2025-01-15',
})

describe('summariseSipp', () => {
  it('grosses up net contributions by 25% basic-rate relief', () => {
    const summary = summariseSipp([contribution(8000)])
    expect(summary.netPaid).toBe(8000)
    expect(summary.basicRateRelief).toBe(2000) // 20% of £10,000 gross
    expect(summary.grossContributions).toBe(10000)
  })

  it('gives higher-rate relief only to higher/additional rate taxpayers', () => {
    const contributions = [contribution(8000)] // gross 10,000
    expect(summariseSipp(contributions, 'basic').higherRateRelief).toBe(0)
    expect(summariseSipp(contributions, 'higher').higherRateRelief).toBe(2000) // extra 20%
    expect(summariseSipp(contributions, 'higher').additionalRateRelief).toBe(0)
    expect(summariseSipp(contributions, 'additional').additionalRateRelief).toBe(2500) // extra 25%
  })

  it('tracks the annual allowance against gross contributions', () => {
    const summary = summariseSipp([contribution(48000)]) // gross 60,000
    expect(summary.grossContributions).toBe(ANNUAL_ALLOWANCE_GROSS)
    expect(summary.remainingAnnualAllowance).toBe(0)
    expect(summary.overAnnualAllowance).toBe(false)
  })

  it('flags contributions above the annual allowance', () => {
    const summary = summariseSipp([contribution(56000)]) // gross 70,000
    expect(summary.overAnnualAllowance).toBe(true)
    expect(summary.remainingAnnualAllowance).toBe(-10000)
  })

  it('sums multiple contributions', () => {
    const summary = summariseSipp([contribution(1000), contribution(2500)])
    expect(summary.netPaid).toBe(3500)
    expect(summary.grossContributions).toBe(4375)
  })
})
