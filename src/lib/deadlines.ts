import { toISODate, type TaxYear } from './taxYear'

/**
 * Self Assessment calendar for a UK property landlord (England).
 *
 * For the tax year ending 5 April `label` (e.g. label 2026 = 2025/26):
 *   5 October  label-1   register for Self Assessment (if new / income > £1,000)
 *   31 October label-1   paper tax return deadline
 *   31 January label     online return + balancing payment + 1st payment on account
 *   31 July    label     2nd payment on account
 */

export type DeadlineKind =
  | 'register'
  | 'paper_return'
  | 'online_return'
  | 'balancing_payment'
  | 'payment_on_account_1'
  | 'payment_on_account_2'
  | 'mtd_quarterly'

export interface Deadline {
  kind: DeadlineKind
  /** Calendar date (YYYY-MM-DD) in the year the deadline falls. */
  date: string
  label: string
  detail: string
}

export function deadlinesForTaxYear(taxYear: TaxYear): Deadline[] {
  const end = taxYear.label // calendar year in which the tax year ends (5 April)
  return [
    {
      kind: 'register',
      date: `${end - 1}-10-05`,
      label: 'Register for Self Assessment',
      detail: `By 5 October ${end - 1} if you have never filed (rental income over £1,000).`,
    },
    {
      kind: 'paper_return',
      date: `${end - 1}-10-31`,
      label: 'Paper tax return',
      detail: `Paper return must reach HMRC by 31 October ${end - 1}.`,
    },
    {
      kind: 'online_return',
      date: `${end}-01-31`,
      label: 'Online tax return',
      detail: `File your Self Assessment online by 31 January ${end}.`,
    },
    {
      kind: 'balancing_payment',
      date: `${end}-01-31`,
      label: 'Balancing payment',
      detail: `Any tax owed for the year, by 31 January ${end}.`,
    },
    {
      kind: 'payment_on_account_1',
      date: `${end}-01-31`,
      label: '1st payment on account',
      detail: `50% of last year's tax bill, by 31 January ${end} (if the bill exceeds £1,000).`,
    },
    {
      kind: 'payment_on_account_2',
      date: `${end}-07-31`,
      label: '2nd payment on account',
      detail: `Second 50% instalment, by 31 July ${end}.`,
    },
  ]
}

/**
 * Making Tax Digital for ITSA quarterly update dates for a tax year.
 * Q1: 6 Apr-5 Jul -> 7 Aug; Q2: 6 Jul-5 Oct -> 7 Nov;
 * Q3: 6 Oct-5 Jan -> 7 Feb (following year); Q4: 6 Jan-5 Apr -> 7 May (following year).
 */
export function mtdQuarterlyDates(taxYear: TaxYear): Deadline[] {
  const end = taxYear.label
  return [
    {
      kind: 'mtd_quarterly',
      date: `${end - 1}-08-07`,
      label: 'MTD — quarterly update Q1',
      detail: `Digital summary for 6 April to 5 July ${end - 1}, due by 7 August ${end - 1}.`,
    },
    {
      kind: 'mtd_quarterly',
      date: `${end - 1}-11-07`,
      label: 'MTD — quarterly update Q2',
      detail: `Summary for 6 July to 5 October ${end - 1}, due by 7 November ${end - 1}.`,
    },
    {
      kind: 'mtd_quarterly',
      date: `${end}-02-07`,
      label: 'MTD — quarterly update Q3',
      detail: `Summary for 6 October ${end - 1} to 5 January ${end}, due by 7 February ${end}.`,
    },
    {
      kind: 'mtd_quarterly',
      date: `${end}-05-07`,
      label: 'MTD — quarterly update Q4',
      detail: `Summary for 6 January to 5 April ${end}, due by 7 May ${end}.`,
    },
  ]
}

/**
 * MTD for ITSA becomes mandatory when gross qualifying income (property +
 * self-employment, before expenses) exceeds the threshold:
 *   > £50,000 from April 2026 (i.e. tax year labelled 2027)
 *   > £30,000 from April 2027 (labelled 2028)
 *   > £20,000 from April 2028 (labelled 2029)
 * The obligation for tax year `label` is decided by the gross qualifying
 * income reported TWO tax years earlier (e.g. 2024/25 income decides
 * whether you must use MTD from April 2026).
 */
export function mtdThresholdForTaxYear(taxYear: TaxYear): number | null {
  if (taxYear.label >= 2029) return 20000
  if (taxYear.label === 2028) return 30000
  if (taxYear.label === 2027) return 50000
  return null // before April 2026, MTD ITSA was voluntary
}

export function mtdApplies(taxYear: TaxYear, grossQualifyingIncome: number): boolean {
  const threshold = mtdThresholdForTaxYear(taxYear)
  return threshold !== null && grossQualifyingIncome > threshold
}

export type DeadlineStatus = 'overdue' | 'upcoming' | 'done'

export interface DeadlineWithStatus extends Deadline {
  status: DeadlineStatus
  /** Whole days from `today` (negative = past). */
  daysUntil: number
}

/** Attach a status relative to `today` (defaults to now). */
export function withStatus(
  deadlines: Deadline[],
  today: Date = new Date(),
  done: Set<string> = new Set(),
): DeadlineWithStatus[] {
  const todayISO = toISODate(today)
  return deadlines.map((d) => {
    const daysUntil = Math.round(
      (new Date(d.date + 'T23:59:59').getTime() - today.getTime()) / 86400000,
    )
    const status: DeadlineStatus = done.has(d.date + d.kind)
      ? 'done'
      : daysUntil < 0
        ? 'overdue'
        : 'upcoming'
    return { ...d, status, daysUntil, todayISO }
  })
}

/** Sort by date, overdue first. */
export function sortByUrgency(items: DeadlineWithStatus[]): DeadlineWithStatus[] {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) {
      const order = { overdue: 0, upcoming: 1, done: 2 }
      return order[a.status] - order[b.status]
    }
    return a.date.localeCompare(b.date)
  })
}
