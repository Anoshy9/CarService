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
  financeCosts: number // mortgage interest paid (feeds the 20% credit)
  financeCostCredit: number // mortgage interest: 20% of the amount
  profit: number
  /** Profit after the restricted finance cost (interest is NOT deducted from profit). */
  taxableProfit: number
  /** True when gross receipts are within the £1,000 property allowance (exempt). */
  propertyAllowanceExempt: boolean
  /** True when the £1,000 property allowance election is used instead of actual expenses. */
  propertyAllowanceElected: boolean
  /** True when actual deductible expenses are used (no allowance). */
  usingActualExpenses: boolean
  /** Capital expenditure (improvements): not deductible, kept for the CGT base cost. */
  capitalExpenditure: number
}

export const BASIC_RATE = 0.2

/** Property income allowance (s.783B ITTOIA 2005). */
export const PROPERTY_ALLOWANCE = 1000

export interface RentalOptions {
  /**
   * When true, the £1,000 property allowance is elected instead of actual
   * expenses (only sensible when actual expenses are below £1,000). This also
   * removes the Section 24 finance-cost credit, because the allowance
   * replaces all expenses including finance costs.
   */
  usePropertyAllowance?: boolean
}

export function summariseRental(
  entries: RentalEntry[],
  options: RentalOptions = {},
): RentalSummary {
  let income = 0
  let deductible = 0
  let mortgageInterest = 0
  let capital = 0

  for (const e of entries) {
    const cat = getCategory(e.category)
    if (cat.income) {
      income += e.amount
    } else if (cat.taxCredit) {
      mortgageInterest += e.amount
    } else if (cat.capital) {
      capital += e.amount
    } else if (cat.deductible) {
      deductible += e.amount
    }
  }

  const exempt = income > 0 && income <= PROPERTY_ALLOWANCE
  const elected = !exempt && (options.usePropertyAllowance ?? false)

  let taxableProfit: number
  let credit: number
  if (exempt) {
    // Fully covered by the property allowance: nothing to report.
    taxableProfit = 0
    credit = 0
  } else if (elected) {
    taxableProfit = Math.max(0, income - PROPERTY_ALLOWANCE)
    credit = 0 // the allowance replaces finance costs too
  } else {
    taxableProfit = income - deductible
    credit = round2(mortgageInterest * BASIC_RATE)
  }

  return {
    income: round2(income),
    deductibleExpenses: round2(deductible),
    financeCosts: round2(mortgageInterest),
    financeCostCredit: credit,
    profit: round2(income - deductible),
    taxableProfit: round2(taxableProfit),
    propertyAllowanceExempt: exempt,
    propertyAllowanceElected: elected,
    usingActualExpenses: !exempt && !elected,
    capitalExpenditure: round2(capital),
  }
}

/**
 * Decide whether electing the £1,000 property allowance beats actual expenses.
 * The allowance wins when actual deductible expenses are below £1,000 AND the
 * lost finance-cost credit does not outweigh the gain.
 */
export function propertyAllowanceIsBetter(
  income: number,
  deductibleExpenses: number,
  financeCostCredit: number,
): boolean {
  if (income <= PROPERTY_ALLOWANCE) return true // exempt either way
  const withActual = income - deductibleExpenses
  const withAllowance = Math.max(0, income - PROPERTY_ALLOWANCE)
  // Choosing the allowance loses the credit, so only elect it if the taxable
  // profit is lower by more than the credit we would give up.
  return withAllowance + financeCostCredit < withActual
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
