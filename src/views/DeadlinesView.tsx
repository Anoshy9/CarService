import { useEffect, useMemo, useState } from 'react'
import {
  getSettingsMigrated,
  listDoneDeadlines,
  listRentalEntries,
  markDeadlineDone,
  type RentalRecord,
} from '../db/database'
import { getTaxYear, formatTaxYear, isInTaxYear, parseISODate } from '../lib/taxYear'
import {
  deadlinesForTaxYear,
  mtdApplies,
  mtdQuarterlyDates,
  sortByUrgency,
  withStatus,
  type DeadlineWithStatus,
} from '../lib/deadlines'
import { summariseRental } from '../lib/rental'

const STATUS_LABEL: Record<DeadlineWithStatus['status'], string> = {
  overdue: 'Overdue',
  upcoming: 'Upcoming',
  done: 'Done',
}

const STATUS_CLASS: Record<DeadlineWithStatus['status'], string> = {
  overdue: 'badge warn',
  upcoming: 'badge',
  done: 'badge',
}

export function DeadlinesView() {
  const taxYear = useMemo(() => getTaxYear(), [])
  const [done, setDone] = useState<Set<string>>(new Set())
  const [grossIncome, setGrossIncome] = useState(0)
  const [, setSettingsLoaded] = useState(false)

  useEffect(() => {
    listDoneDeadlines().then(setDone)
    getSettingsMigrated().then(() => setSettingsLoaded(true))
    listRentalEntries().then((entries: RentalRecord[]) => {
      const inYear = entries.filter((e) => isInTaxYear(parseISODate(e.date), taxYear))
      setGrossIncome(summariseRental(inYear).income)
    })
  }, [taxYear])

  const deadlines = useMemo(() => {
    const base = deadlinesForTaxYear(taxYear)
    const withMtd = mtdApplies(taxYear, grossIncome)
      ? [...base, ...mtdQuarterlyDates(taxYear)]
      : base
    return sortByUrgency(withStatus(withMtd, new Date(), done))
  }, [taxYear, done, grossIncome])

  const toggle = async (d: DeadlineWithStatus) => {
    const key = d.date + d.kind
    const next = new Set(done)
    if (done.has(key)) {
      next.delete(key)
      await markDeadlineDone(key, false)
    } else {
      next.add(key)
      await markDeadlineDone(key, true)
    }
    setDone(next)
  }

  const mtd = mtdApplies(taxYear, grossIncome)

  return (
    <>
      <div className="card">
        <h2>📅 HMRC deadlines — {formatTaxYear(taxYear)}</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          6 April {taxYear.label - 1} to 5 April {taxYear.label}. Tick each deadline off as you go.
        </p>
        {mtd && (
          <p className="ocr-status" style={{ background: '#eff6ff', color: '#1d4ed8', marginTop: 8 }}>
            ℹ️ Making Tax Digital (MTD) applies to you this tax year (gross income above the
            threshold): quarterly updates are mandatory, in addition to the final declaration.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Calendar</h2>
        {deadlines.map((d) => (
          <div
            className="row"
            key={d.date + d.kind}
            onClick={() => toggle(d)}
            style={{ cursor: 'pointer' }}
          >
            <span className="label">
              {d.label}
              <span className="sub">
                {new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {' · '}
                {d.detail}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {d.status === 'upcoming' && d.daysUntil <= 30 && (
                <span className="badge warn">D-{d.daysUntil}</span>
              )}
              <span className={STATUS_CLASS[d.status]}>{STATUS_LABEL[d.status]}</span>
              <input type="checkbox" checked={d.status === 'done'} readOnly />
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>💷 Payments on account</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          If your tax bill exceeds £1,000 and less than 80% is collected at source, HMRC asks for
          two advance payments of 50% of the previous year's bill: on 31 January and 31 July after
          the end of the tax year. They are deducted from the final balancing payment.
        </p>
      </div>

      <div className="card">
        <h2>⚠️ Late penalties</h2>
        <div className="row">
          <span className="label">Late filing</span>
          <span className="value">£100 from day 1</span>
        </div>
        <div className="row">
          <span className="label">After 3 months</span>
          <span className="value">£10/day (max £900)</span>
        </div>
        <div className="row">
          <span className="label">After 6 / 12 months</span>
          <span className="value">5% of tax or £300</span>
        </div>
        <div className="row">
          <span className="label">Late payment</span>
          <span className="value">5% at 30 days, 6 and 12 months + interest</span>
        </div>
      </div>

      <p className="disclaimer">
        ⚠️ Indicative calendar for a UK resident whose only income is rental income. MTD rules are
        evolving — check gov.uk before each deadline.
      </p>
    </>
  )
}
