import { round2 } from './rental'

/**
 * UK income tax calculator for England / Wales / Northern Ireland, 2025/26.
 *
 * Bands (taxable income):
 *   Personal allowance £12,570 (reduced by £1 for every £2 of income above
 *   £100,000, reaching £0 at £125,140).
 *   Basic rate    20%  up to £37,700 of taxable income (top of band £50,270).
 *   Higher rate   40%  from £37,700 up to £112,570 (top of band £125,140).
 *   Additional    45%  above £112,570.
 *
 * The Section 24 finance-cost credit (20% of residential mortgage interest)
 * is applied against the final income-tax bill, capped at the lowest of:
 *   20% of finance costs, the basic-rate tax on rental profit, and the
 *   basic-rate tax on total income above the personal allowance.
 */

export const PERSONAL_ALLOWANCE = 12570
export const PERSONAL_ALLOWANCE_TAPER_START = 100000
export const BASIC_RATE_LIMIT = 37700 // taxable income (band top £50,270)
export const HIGHER_RATE_LIMIT = 112570 // taxable income (band top £125,140)

export const BASIC_RATE = 0.2
export const HIGHER_RATE = 0.4
export const ADDITIONAL_RATE = 0.45

export interface IncomeTaxInput {
  /** Total non-savings, non-dividend taxable income (e.g. rental profit). */
  taxableIncome: number
  /** Residential property finance costs (mortgage interest) for the year. */
  financeCosts?: number
}

export interface IncomeTaxResult {
  taxableIncome: number
  personalAllowance: number
  taxOnIncome: number
  financeCostCredit: number
  /** Final income tax due after the Section 24 credit. */
  taxDue: number
}

export function personalAllowanceFor(income: number): number {
  if (income <= PERSONAL_ALLOWANCE_TAPER_START) return PERSONAL_ALLOWANCE
  const reduction = Math.floor((income - PERSONAL_ALLOWANCE_TAPER_START) / 2)
  return Math.max(0, PERSONAL_ALLOWANCE - reduction)
}

/** Income tax on non-savings income, before any finance-cost credit. */
export function taxOnNonSavingsIncome(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0
  let tax = 0
  const basicBand = Math.min(taxableIncome, BASIC_RATE_LIMIT)
  tax += basicBand * BASIC_RATE
  const higherBand = Math.min(
    Math.max(0, taxableIncome - BASIC_RATE_LIMIT),
    HIGHER_RATE_LIMIT - BASIC_RATE_LIMIT,
  )
  tax += higherBand * HIGHER_RATE
  const additionalBand = Math.max(0, taxableIncome - HIGHER_RATE_LIMIT)
  tax += additionalBand * ADDITIONAL_RATE
  return round2(tax)
}

/**
 * Section 24 credit: 20% of finance costs, capped at the basic-rate tax
 * attributable to the property profit and to total income above the
 * personal allowance.
 */
export function financeCostCredit(
  financeCosts: number,
  rentalProfit: number,
  totalTaxableIncome: number,
  personalAllowance: number,
): number {
  if (financeCosts <= 0) return 0
  const credit = financeCosts * BASIC_RATE
  const capFromProfit = round2(
    Math.min(Math.max(rentalProfit, 0), BASIC_RATE_LIMIT) * BASIC_RATE,
  )
  const capFromIncome = round2(
    Math.min(Math.max(totalTaxableIncome - personalAllowance, 0), BASIC_RATE_LIMIT) *
      BASIC_RATE,
  )
  return round2(Math.min(credit, capFromProfit, capFromIncome))
}

export function calculateIncomeTax(input: IncomeTaxInput): IncomeTaxResult {
  const taxableIncome = Math.max(0, input.taxableIncome)
  const allowance = personalAllowanceFor(taxableIncome)
  const chargeable = Math.max(0, taxableIncome - allowance)
  const taxOnIncome = taxOnNonSavingsIncome(chargeable)
  const credit = financeCostCredit(
    input.financeCosts ?? 0,
    input.taxableIncome,
    taxableIncome,
    allowance,
  )
  return {
    taxableIncome,
    personalAllowance: allowance,
    taxOnIncome,
    financeCostCredit: credit,
    taxDue: round2(Math.max(0, taxOnIncome - credit)),
  }
}
