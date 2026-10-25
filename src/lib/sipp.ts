import { round2 } from './rental'

/**
 * UK SIPP (Self-Invested Personal Pension) tax relief model.
 *
 * Contributions are made net of basic-rate tax; the pension provider
 * claims 20% tax relief from HMRC and adds it to the pot (the "gross-up").
 * Higher/additional rate taxpayers claim the extra relief through their
 * Self Assessment return.
 *
 * Annual allowance (2024/25): £60,000 gross, with possible carry-forward
 * of unused allowance from the 3 previous tax years. The tapered
 * allowance for very high incomes is NOT modelled here.
 */

export const ANNUAL_ALLOWANCE_GROSS = 60000
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
  remainingAnnualAllowance: number
  overAnnualAllowance: boolean
}

export type TaxBand = 'basic' | 'higher' | 'additional'

export function summariseSipp(
  contributions: SippContribution[],
  band: TaxBand = 'basic',
  annualAllowance: number = ANNUAL_ALLOWANCE_GROSS,
): SippSummary {
  const netPaid = round2(contributions.reduce((sum, c) => sum + c.netAmount, 0))
  // Provider claims 20% of gross: gross = net / 0.8, relief = gross * 0.2 = net * 0.25
  const basicRateRelief = round2(netPaid * 0.25)
  const gross = round2(netPaid / 0.8)

  const higherRateRelief =
    band === 'basic' ? 0 : round2(gross * (HIGHER_RATE - BASIC_RATE))
  const additionalRateRelief =
    band === 'additional' ? round2(gross * (ADDITIONAL_RATE - BASIC_RATE)) : 0

  const remaining = round2(annualAllowance - gross)

  return {
    netPaid,
    basicRateRelief,
    grossContributions: gross,
    higherRateRelief,
    additionalRateRelief,
    remainingAnnualAllowance: remaining,
    overAnnualAllowance: remaining < 0,
  }
}

/** Extra relief a taxpayer in the given band reclaims through Self Assessment. */
export function selfAssessmentRelief(gross: number, band: TaxBand): number {
  if (band === 'higher') return round2(gross * (HIGHER_RATE - BASIC_RATE))
  if (band === 'additional') return round2(gross * (ADDITIONAL_RATE - BASIC_RATE))
  return 0
}
