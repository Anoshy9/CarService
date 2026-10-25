import type { CategoryId } from './categories'
import { getCategory } from './categories'

export interface RentalEntry {
  id: string
  category: CategoryId
  amount: number
  date: string // ISO YYYY-MM-DD
  note?: string
}

export interface RentalSummary {
  income: number
  deductibleExpenses: number
  financeCostCredit: number // mortgage interest: 20% of the amount
  profit: number
  /** Profit after the restricted finance cost (interest is NOT deducted from profit). */
  taxableProfit: number
}

export const BASIC_RATE = 0.2

export function summariseRental(entries: RentalEntry[]): RentalSummary {
  let income = 0
  let deductible = 0
  let mortgageInterest = 0

  for (const e of entries) {
    const cat = getCategory(e.category)
    if (cat.income) {
      income += e.amount
    } else if (cat.taxCredit) {
      mortgageInterest += e.amount
    } else if (cat.deductible) {
      deductible += e.amount
    }
  }

  const profit = income - deductible
  return {
    income,
    deductibleExpenses: deductible,
    financeCostCredit: round2(mortgageInterest * BASIC_RATE),
    profit: round2(profit),
    taxableProfit: round2(profit),
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
