import { describe, expect, it } from 'vitest'
import {
  calculateIncomeTax,
  financeCostCredit,
  personalAllowanceFor,
  taxOnNonSavingsIncome,
  PERSONAL_ALLOWANCE,
} from './incomeTax'

describe('personalAllowanceFor', () => {
  it('is £12,570 at or below £100,000', () => {
    expect(personalAllowanceFor(0)).toBe(PERSONAL_ALLOWANCE)
    expect(personalAllowanceFor(100000)).toBe(PERSONAL_ALLOWANCE)
  })

  it('tapers by £1 for every £2 above £100,000', () => {
    expect(personalAllowanceFor(110000)).toBe(12570 - 5000)
    expect(personalAllowanceFor(120000)).toBe(12570 - 10000)
  })

  it('reaches zero at £125,140', () => {
    expect(personalAllowanceFor(125140)).toBe(0)
    expect(personalAllowanceFor(200000)).toBe(0)
  })
})

describe('taxOnNonSavingsIncome', () => {
  it('is zero for non-positive income', () => {
    expect(taxOnNonSavingsIncome(0)).toBe(0)
    expect(taxOnNonSavingsIncome(-5000)).toBe(0)
  })

  it('taxes the basic band at 20%', () => {
    expect(taxOnNonSavingsIncome(37700)).toBe(7540)
    expect(taxOnNonSavingsIncome(10000)).toBe(2000)
  })

  it('taxes the higher band at 40%', () => {
    expect(taxOnNonSavingsIncome(37700 + 10000)).toBe(7540 + 4000)
  })

  it('taxes above £112,570 at 45%', () => {
    expect(taxOnNonSavingsIncome(112570 + 1000)).toBe(7540 + 74870 * 0.4 + 450)
  })
})

describe('financeCostCredit (Section 24)', () => {
  it('is 20% of finance costs when caps are not binding', () => {
    expect(financeCostCredit(5000, 20000, 20000, 12570)).toBe(1000)
  })

  it('is capped by basic-rate tax on the rental profit', () => {
    // profit £5,000 -> cap 20% x 5,000 = £1,000 even though 20% of costs = £2,000
    expect(financeCostCredit(10000, 5000, 20000, 12570)).toBe(1000)
  })

  it('is capped by basic-rate tax on income above the personal allowance', () => {
    // taxable income £15,000, allowance £12,570 -> above-allowance £2,430 -> cap £486
    expect(financeCostCredit(10000, 20000, 15000, 12570)).toBe(486)
  })

  it('is zero when total income is below the personal allowance', () => {
    expect(financeCostCredit(10000, 5000, 5000, 12570)).toBe(0)
  })

  it('is zero when there are no finance costs', () => {
    expect(financeCostCredit(0, 20000, 20000, 12570)).toBe(0)
  })
})

describe('calculateIncomeTax', () => {
  it('applies the personal allowance before the bands', () => {
    // £30,000 income -> £17,430 taxable -> 20% = £3,486
    const r = calculateIncomeTax({ taxableIncome: 30000 })
    expect(r.personalAllowance).toBe(12570)
    expect(r.taxOnIncome).toBe(3486)
    expect(r.taxDue).toBe(3486)
  })

  it('pays no tax below the personal allowance', () => {
    const r = calculateIncomeTax({ taxableIncome: 12000 })
    expect(r.taxDue).toBe(0)
  })

  it('subtracts the Section 24 credit from the final bill', () => {
    // £20,000 profit, £5,000 interest -> tax on £7,430 = £1,486; credit £1,000
    const r = calculateIncomeTax({ taxableIncome: 20000, financeCosts: 5000 })
    expect(r.taxOnIncome).toBe(1486)
    expect(r.financeCostCredit).toBe(1000)
    expect(r.taxDue).toBe(486)
  })

  it('crosses into the higher band correctly', () => {
    // £60,000 income -> £47,430 taxable -> 7,540 + 40% x 9,730 = £11,432
    const r = calculateIncomeTax({ taxableIncome: 60000 })
    expect(r.taxOnIncome).toBe(11432)
  })

  it('handles losses as zero tax', () => {
    const r = calculateIncomeTax({ taxableIncome: -8000 })
    expect(r.taxDue).toBe(0)
  })
})
