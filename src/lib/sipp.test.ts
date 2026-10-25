import { describe, expect, it } from 'vitest'
import {
  ANNUAL_ALLOWANCE_GROSS,
  MPAA_GROSS,
  NON_EARNER_LIMIT_GROSS,
  TAPER_MINIMUM,
  effectiveAnnualAllowance,
  reliefCapGross,
  summariseSipp,
  type SippContribution,
  type SippProfile,
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

describe('relief cap (relevant UK earnings rule)', () => {
  const profile = (earnings: number): SippProfile => ({
    relevantUkEarnings: earnings,
    mpaaTriggered: false,
    thresholdIncome: 0,
    adjustedIncome: 0,
  })

  it('is £3,600 gross for a landlord with no employment income', () => {
    expect(reliefCapGross(profile(0))).toBe(NON_EARNER_LIMIT_GROSS)
  })

  it('is 100% of relevant UK earnings when higher than £3,600', () => {
    expect(reliefCapGross(profile(25000))).toBe(25000)
  })

  it('flags gross contributions above the relief cap (no tax relief on the excess)', () => {
    // £8,000 net -> £10,000 gross; cap £3,600 -> £6,400 above cap
    const summary = summariseSipp([contribution(8000)], 'basic', profile(0))
    expect(summary.reliefCapGross).toBe(3600)
    expect(summary.grossAboveReliefCap).toBe(6400)
    expect(summary.overReliefCap).toBe(true)
  })

  it('does not flag contributions within the cap', () => {
    // £2,880 net -> £3,600 gross = exactly the non-earner cap
    const summary = summariseSipp([contribution(2880)], 'basic', profile(0))
    expect(summary.overReliefCap).toBe(false)
    expect(summary.grossAboveReliefCap).toBe(0)
  })

  it('allows a higher cap when the user has UK employment earnings', () => {
    const summary = summariseSipp([contribution(8000)], 'higher', profile(40000))
    expect(summary.reliefCapGross).toBe(40000)
    expect(summary.overReliefCap).toBe(false)
  })
})

describe('effectiveAnnualAllowance (MPAA and taper)', () => {
  const base: SippProfile = {
    relevantUkEarnings: 0,
    mpaaTriggered: false,
    thresholdIncome: 0,
    adjustedIncome: 0,
  }

  it('is £60,000 by default', () => {
    expect(effectiveAnnualAllowance(base)).toBe(ANNUAL_ALLOWANCE_GROSS)
  })

  it('drops to the £10,000 MPAA after flexible pension access', () => {
    expect(effectiveAnnualAllowance({ ...base, mpaaTriggered: true })).toBe(MPAA_GROSS)
  })

  it('does not taper when only threshold income exceeds £200,000', () => {
    expect(
      effectiveAnnualAllowance({ ...base, thresholdIncome: 250000, adjustedIncome: 260000 }),
    ).toBe(ANNUAL_ALLOWANCE_GROSS)
  })

  it('tapers by £1 for every £2 of adjusted income above £260,000', () => {
    // adjusted income £280,000 -> £20,000 over -> -£10,000 -> £50,000
    expect(
      effectiveAnnualAllowance({ ...base, thresholdIncome: 210000, adjustedIncome: 280000 }),
    ).toBe(50000)
  })

  it('never goes below £10,000', () => {
    expect(
      effectiveAnnualAllowance({ ...base, thresholdIncome: 400000, adjustedIncome: 500000 }),
    ).toBe(TAPER_MINIMUM)
  })

  it('flags contributions above the MPAA', () => {
    const summary = summariseSipp(
      [contribution(9000)], // £11,250 gross > £10,000 MPAA
      'basic',
      { ...base, mpaaTriggered: true },
    )
    expect(summary.effectiveAnnualAllowance).toBe(MPAA_GROSS)
    expect(summary.overAnnualAllowance).toBe(true)
    expect(summary.remainingAnnualAllowance).toBe(-1250)
  })
})
