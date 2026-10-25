import { describe, expect, it } from 'vitest'
import { summariseRental, type RentalEntry } from './rental'

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
})
