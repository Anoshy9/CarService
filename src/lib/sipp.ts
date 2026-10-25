import { round2 } from './rental'

/**
 * UK SIPP (Self-Invested Personal Pension) tax relief model.
 *
 * Contributions are made net of basic-rate tax; the pension provider
 * claims 20% tax relief from HMRC and adds it to the pot (the "gross-up").
 * Higher/additional rate taxpayers claim the extra relief through their
 * Self Assessment return.
 *
 * Limits modelled (2025/26):
 *   - Tax relief on personal contributions is limited to the higher of
 *     £3,600 gross or 100% of "relevant UK earnings". Rental income does
 *     NOT count as relevant UK earnings — a landlord with no employment
 *     or self-employment income is capped at £3,600 gross (£2,880 net).
 *   - Annual allowance: £60,000 gross (all pension contributions).
 *   - Money Purchase Annual Allowance (MPAA): £10,000 if the contributor
 *     has flexibly accessed a money-purchase pension (drawdown or UFPLS;
 *     taking only the 25% tax-free lump sum does NOT trigger it).
 *   - Tapered annual allowance: threshold income > £200,000 AND adjusted
 *     income > £260,000 reduces the allowance by £1 for every £2 of
 *     adjusted income above £260,000, down to a £10,000 minimum.
 */

export const ANNUAL_ALLOWANCE_GROSS = 60000
export const NON_EARNER_LIMIT_GROSS = 3600
export const MPAA_GROSS = 10000
export const TAPER_THRESHOLD_INCOME = 200000
export const TAPER_ADJUSTED_INCOME = 260000
export const TAPER_MINIMUM = 10000
export const BASIC_RATE = 0.2
export const HIGHER_RATE = 0.4
export const ADDITIONAL_RATE = 0.45

export interface SippContribution {
  id: string
  /** Net amount paid by the contributor (what leaves the bank account). */
  netAmount: number
  date: string // ISO YYYY-MM-DD
  provider?: string
  note?: string
}

export interface SippProfile {
  /** Relevant UK earnings (employment / self-employment), NOT rental income. */
  relevantUkEarnings: number
  /** True if the contributor has flexibly accessed a pension (MPAA triggered). */
  mpaaTriggered: boolean
  /** Threshold income: total taxable income minus personal pension contributions. */
  thresholdIncome: number
  /** Adjusted income: taxable income plus all pension contributions. */
  adjustedIncome: number
}

export const DEFAULT_SIPP_PROFILE: SippProfile = {
  relevantUkEarnings: 0,
  mpaaTriggered: false,
  thresholdIncome: 0,
  adjustedIncome: 0,
}

export interface SippSummary {
  netPaid: number
  /** Basic-rate relief claimed by the provider (20% of gross = 25% of net). */
  basicRateRelief: number
  /** Gross contribution = net + basic-rate relief. Counts against the annual allowance. */
  grossContributions: number
  /** Extra relief a higher-rate taxpayer can claim via Self Assessment. */
  higherRateRelief: number
  /** Extra relief an additional-rate taxpayer can claim via Self Assessment. */
  additionalRateRelief: number
  /** Annual allowance for the year after MPAA and taper. */
  effectiveAnnualAllowance: number
  remainingAnnualAllowance: number
  overAnnualAllowance: boolean
  /** Maximum gross contribution eligible for tax relief (relevant earnings rule). */
  reliefCapGross: number
  /** Gross contributions above the relief cap get NO tax relief. */
  grossAboveReliefCap: number
  overReliefCap: boolean
}

export type TaxBand = 'basic' | 'higher' | 'additional'

/** The annual allowance after MPAA and the tapered allowance are applied. */
export function effectiveAnnualAllowance(profile: SippProfile): number {
  if (profile.mpaaTriggered) return MPAA_GROSS
  if (
    profile.thresholdIncome > TAPER_THRESHOLD_INCOME &&
    profile.adjustedIncome > TAPER_ADJUSTED_INCOME
  ) {
    const excess = profile.adjustedIncome - TAPER_ADJUSTED_INCOME
    const reduction = Math.floor(excess / 2)
    return Math.max(TAPER_MINIMUM, ANNUAL_ALLOWANCE_GROSS - reduction)
  }
  return ANNUAL_ALLOWANCE_GROSS
}

/**
 * Maximum gross personal contribution eligible for tax relief:
 * the higher of £3,600 or 100% of relevant UK earnings.
 * Rental/investment income does not count.
 */
export function reliefCapGross(profile: SippProfile): number {
  return Math.max(NON_EARNER_LIMIT_GROSS, round2(profile.relevantUkEarnings))
}

export function summariseSipp(
  contributions: SippContribution[],
  band: TaxBand = 'basic',
  profile: SippProfile = DEFAULT_SIPP_PROFILE,
): SippSummary {
  const netPaid = round2(contributions.reduce((sum, c) => sum + c.netAmount, 0))
  // Provider claims 20% of gross: gross = net / 0.8, relief = gross * 0.2 = net * 0.25
  const basicRateRelief = round2(netPaid * 0.25)
  const gross = round2(netPaid / 0.8)

  const higherRateRelief =
    band === 'basic' ? 0 : round2(gross * (HIGHER_RATE - BASIC_RATE))
  const additionalRateRelief =
    band === 'additional' ? round2(gross * (ADDITIONAL_RATE - BASIC_RATE)) : 0

  const allowance = effectiveAnnualAllowance(profile)
  const remaining = round2(allowance - gross)

  const cap = reliefCapGross(profile)
  const grossAboveCap = round2(Math.max(0, gross - cap))

  return {
    netPaid,
    basicRateRelief,
    grossContributions: gross,
    higherRateRelief,
    additionalRateRelief,
    effectiveAnnualAllowance: allowance,
    remainingAnnualAllowance: remaining,
    overAnnualAllowance: remaining < 0,
    reliefCapGross: cap,
    grossAboveReliefCap: grossAboveCap,
    overReliefCap: grossAboveCap > 0,
  }
}

/** Extra relief a taxpayer in the given band reclaims through Self Assessment. */
export function selfAssessmentRelief(gross: number, band: TaxBand): number {
  if (band === 'higher') return round2(gross * (HIGHER_RATE - BASIC_RATE))
  if (band === 'additional') return round2(gross * (ADDITIONAL_RATE - BASIC_RATE))
  return 0
}
