import { describe, expect, it } from 'vitest'
import {
  PROPERTY_ALLOWANCE,
  propertyAllowanceIsBetter,
  summariseRental,
  type RentalEntry,
} from './rental'

const entry = (category: RentalEntry['category'], amount: number): RentalEntry => ({
  id: Math.random().toString(36).slice(2),
  category,
  amount,
  date: '2025-01-15',
})

describe('summariseRental', () => {
  it('sums rent as income and expenses as deductions', () => {
    const summary = summariseRental([
      entry('rent', 12000),
      entry('council_tax', 1200),
      entry('repairs_maintenance', 800),
      entry('letting_fees', 600),
    ])
    expect(summary.income).toBe(12000)
    expect(summary.deductibleExpenses).toBe(2600)
    expect(summary.profit).toBe(9400)
    expect(summary.taxableProfit).toBe(9400)
    expect(summary.financeCostCredit).toBe(0)
  })

  it('treats mortgage interest as a 20% tax credit, not a deduction', () => {
    const summary = summariseRental([
      entry('rent', 10000),
      entry('mortgage_interest', 3000),
    ])
    expect(summary.deductibleExpenses).toBe(0)
    expect(summary.profit).toBe(10000)
    expect(summary.financeCostCredit).toBe(600)
  })

  it('returns zeros for no entries', () => {
    const summary = summariseRental([])
    expect(summary.profit).toBe(0)
    expect(summary.income).toBe(0)
  })

  it('keeps capital improvements out of the deductible expenses', () => {
    const summary = summariseRental([
      entry('rent', 12000),
      entry('improvements', 4000),
      entry('repairs_maintenance', 800),
    ])
    expect(summary.deductibleExpenses).toBe(800)
    expect(summary.profit).toBe(11200)
    expect(summary.capitalExpenditure).toBe(4000)
    expect(summary.usingActualExpenses).toBe(true)
  })

  it('exempts gross receipts within the £1,000 property allowance', () => {
    const summary = summariseRental([entry('rent', 900)])
    expect(summary.propertyAllowanceExempt).toBe(true)
    expect(summary.taxableProfit).toBe(0)
    expect(summary.financeCostCredit).toBe(0)
  })

  it('applies the elected £1,000 allowance instead of actual expenses, losing the credit', () => {
    const summary = summariseRental(
      [entry('rent', 5000), entry('repairs_maintenance', 400), entry('mortgage_interest', 2000)],
      { usePropertyAllowance: true },
    )
    expect(summary.propertyAllowanceElected).toBe(true)
    expect(summary.taxableProfit).toBe(4000) // 5,000 - 1,000
    expect(summary.financeCostCredit).toBe(0) // allowance replaces finance costs
    expect(summary.deductibleExpenses).toBe(400) // still reported for information
  })

  it('keeps actual expenses when the allowance is not elected', () => {
    const summary = summariseRental(
      [entry('rent', 5000), entry('repairs_maintenance', 400), entry('mortgage_interest', 2000)],
    )
    expect(summary.usingActualExpenses).toBe(true)
    expect(summary.taxableProfit).toBe(4600)
    expect(summary.financeCostCredit).toBe(400)
  })
})

describe('propertyAllowanceIsBetter', () => {
  it('prefers the allowance when actual expenses are lower and no credit is lost', () => {
    // income 5,000, expenses 400, credit 0 -> allowance profit 4,000 < actual 4,600
    expect(propertyAllowanceIsBetter(5000, 400, 0)).toBe(true)
  })

  it('prefers actual expenses when they are higher than £1,000', () => {
    expect(propertyAllowanceIsBetter(20000, 3000, 600)).toBe(false)
  })

  it('prefers actual expenses when the lost credit outweighs the gain', () => {
    // income 2,000, expenses 900 -> actual profit 1,100 vs allowance 1,000;
    // but the allowance loses a £200 credit, so actual is better overall.
    expect(propertyAllowanceIsBetter(2000, 900, 200)).toBe(false)
  })

  it('is true when income is within the allowance (exempt)', () => {
    expect(propertyAllowanceIsBetter(PROPERTY_ALLOWANCE, 0, 0)).toBe(true)
  })
})
