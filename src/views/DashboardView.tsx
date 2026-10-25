import { useEffect, useMemo, useState } from 'react'
import {
  listReceipts,
  listRentalEntries,
  listSippContributions,
  type ReceiptRecord,
  type RentalRecord,
  type SippRecord,
  getSettingsMigrated,
  type SettingsRecord,
} from '../db/database'
import { getTaxYear, formatTaxYear, isInTaxYear, parseISODate } from '../lib/taxYear'
import { summariseRental } from '../lib/rental'
import { summariseSipp } from '../lib/sipp'
import { calculateIncomeTax } from '../lib/incomeTax'
import { downloadBlob, receiptsCsv, rentalCsv, sippCsv, exportRentalPdf, exportSippPdf } from '../lib/export'

export function DashboardView() {
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [rental, setRental] = useState<RentalRecord[]>([])
  const [sipp, setSipp] = useState<SippRecord[]>([])
  const [settings, setSettings] = useState<SettingsRecord | null>(null)

  const taxYear = useMemo(() => getTaxYear(), [])

  useEffect(() => {
    listReceipts().then(setReceipts)
    listRentalEntries().then(setRental)
    listSippContributions().then(setSipp)
    getSettingsMigrated().then(setSettings)
  }, [])

  const inYear = <T extends { date: string }>(items: T[]) =>
    items.filter((i) => isInTaxYear(parseISODate(i.date), taxYear))

  const yearReceipts = inYear(receipts)
  const yearRental = inYear(rental)
  const yearSipp = inYear(sipp)

  const band = settings?.taxBand ?? 'basic'
  const rentalSummary = summariseRental(yearRental, {
    usePropertyAllowance: settings?.usePropertyAllowance,
  })
  const sippSummary = summariseSipp(yearSipp, band, settings?.sippProfile)

  const taxEstimate = useMemo(() => {
    if (!settings) return null
    return calculateIncomeTax({
      taxableIncome: rentalSummary.taxableProfit + settings.otherTaxableIncome,
      financeCosts: rentalSummary.financeCosts,
    })
  }, [rentalSummary, settings])

  const totalExpenses = yearReceipts
    .filter((r) => r.source === 'rental')
    .reduce((sum, r) => sum + r.amount, 0)

  const handleExportAll = () => {
    const parts = [
      `# TaxTrack UK — full export — tax year ${formatTaxYear(taxYear)}`,
      '',
      '## Receipts',
      receiptsCsv(yearReceipts),
      '',
      '## Rental',
      rentalCsv(yearRental, taxYear, { usePropertyAllowance: settings?.usePropertyAllowance }),
      '',
      '## SIPP',
      sippCsv(yearSipp, band, taxYear, settings?.sippProfile),
    ]
    downloadBlob(
      new Blob([parts.join('\n')], { type: 'text/csv;charset=utf-8' }),
      `taxtrack-export-${formatTaxYear(taxYear).replace('/', '-')}.csv`,
    )
  }

  return (
    <>
      <div className="card">
        <h2>📊 Tax year {formatTaxYear(taxYear)}</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          6 April {taxYear.label - 1} to 5 April {taxYear.label}
        </p>
      </div>

      <div className="card">
        <h2>🏠 Rental</h2>
        <div className="row">
          <span className="label">Rental income</span>
          <span className="value positive">£{rentalSummary.income.toFixed(2)}</span>
        </div>
        {rentalSummary.propertyAllowanceExempt && (
          <p className="ocr-status" style={{ background: '#f0fdf4', color: '#15803d', marginTop: 8 }}>
            ✅ Income ≤ £1,000: exempt under the property allowance — nothing to report for rental income.
          </p>
        )}
        {rentalSummary.propertyAllowanceElected && (
          <p className="ocr-status" style={{ background: '#eff6ff', color: '#1d4ed8', marginTop: 8 }}>
            ℹ️ £1,000 property allowance elected: profit = income − £1,000; no expenses and no
            interest credit are reported.
          </p>
        )}
        {!rentalSummary.propertyAllowanceExempt && !rentalSummary.propertyAllowanceElected && (
          <div className="row">
            <span className="label">Deductible expenses</span>
            <span className="value negative">−£{rentalSummary.deductibleExpenses.toFixed(2)}</span>
          </div>
        )}
        {rentalSummary.capitalExpenditure > 0 && (
          <div className="row">
            <span className="label">
              Capital improvements (not deductible)
              <span className="sub">kept for the CGT calculation on a future sale</span>
            </span>
            <span className="value">£{rentalSummary.capitalExpenditure.toFixed(2)}</span>
          </div>
        )}
        <div className="row">
          <span className="label">Taxable profit</span>
          <span className={`value ${rentalSummary.taxableProfit >= 0 ? 'positive' : 'negative'}`}>
            £{rentalSummary.taxableProfit.toFixed(2)}
          </span>
        </div>
        {rentalSummary.financeCostCredit > 0 && (
          <div className="row">
            <span className="label">Tax credit (interest, 20%)</span>
            <span className="value positive">£{rentalSummary.financeCostCredit.toFixed(2)}</span>
          </div>
        )}
        <button
          className="btn secondary"
          style={{ marginTop: 10 }}
          onClick={() =>
            exportRentalPdf(yearRental, taxYear, {
              usePropertyAllowance: settings?.usePropertyAllowance,
            })
          }
        >
          📄 Export rental PDF
        </button>
      </div>

      {taxEstimate && (
        <div className="card">
          <h2>🧾 Estimated income tax (England, {formatTaxYear(taxYear)})</h2>
          <div className="row">
            <span className="label">
              Personal Allowance
              <span className="sub">£12,570, tapered above £100,000 of income</span>
            </span>
            <span className="value">£{taxEstimate.personalAllowance.toFixed(2)}</span>
          </div>
          <div className="row">
            <span className="label">Income tax (20/40/45% bands)</span>
            <span className="value">£{taxEstimate.taxOnIncome.toFixed(2)}</span>
          </div>
          {taxEstimate.financeCostCredit > 0 && (
            <div className="row">
              <span className="label">Section 24 credit (interest)</span>
              <span className="value positive">−£{taxEstimate.financeCostCredit.toFixed(2)}</span>
            </div>
          )}
          <div className="row">
            <span className="label">
              <b>Estimated tax due</b>
              <span className="sub">before payments on account already made; excludes income not entered here</span>
            </span>
            <span className="big-number">£{taxEstimate.taxDue.toFixed(2)}</span>
          </div>
          {taxYear.label >= 2028 && (
            <p className="ocr-status" style={{ background: '#fff7ed', color: '#9a3412', marginTop: 8 }}>
              ⚠️ From 6 April 2027, rental profit is taxed at dedicated property income rates
              (22% / 42% / 47%) instead of the standard bands, and the finance-cost credit rises to
              22%. These estimates use the current-year rules — get advice for 2027/28.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h2>💷 SIPP</h2>
        <div className="row">
          <span className="label">Net paid this year</span>
          <span className="value">£{sippSummary.netPaid.toFixed(2)}</span>
        </div>
        <div className="row">
          <span className="label">
            Gross contribution (allowance £{sippSummary.effectiveAnnualAllowance.toLocaleString('en-GB')})
          </span>
          <span className="value">£{sippSummary.grossContributions.toFixed(2)}</span>
        </div>
        <div className="row">
          <span className="label">Total relief (basic + additional)</span>
          <span className="value positive">
            £{(sippSummary.basicRateRelief + sippSummary.higherRateRelief + sippSummary.additionalRateRelief).toFixed(2)}
          </span>
        </div>
        {sippSummary.overAnnualAllowance && (
          <p className="ocr-status" style={{ background: '#fef2f2', color: '#dc2626', marginTop: 8 }}>
            ⚠ Annual allowance exceeded by £{Math.abs(sippSummary.remainingAnnualAllowance).toFixed(2)}
          </p>
        )}
        {sippSummary.overReliefCap && (
          <p className="ocr-status" style={{ background: '#fef2f2', color: '#dc2626', marginTop: 8 }}>
            ⚠ £{sippSummary.grossAboveReliefCap.toFixed(2)} gross is above your relief cap
            (£{sippSummary.reliefCapGross.toLocaleString('en-GB')} — relevant UK earnings rule): this
            part earns <b>no</b> tax relief.
          </p>
        )}
        <button
          className="btn secondary"
          style={{ marginTop: 10 }}
          onClick={() => exportSippPdf(yearSipp, band, taxYear, settings?.sippProfile)}
        >
          📄 Export SIPP PDF
        </button>
      </div>

      <div className="card">
        <h2>📸 Scanned receipts</h2>
        <div className="row">
          <span className="label">Receipts this year</span>
          <span className="value">{yearReceipts.length}</span>
        </div>
        <div className="row">
          <span className="label">« Rental » expenses from receipts</span>
          <span className="value">£{totalExpenses.toFixed(2)}</span>
        </div>
      </div>

      <div className="card">
        <h2>⬆️ Export everything</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>
          One CSV file with the receipts, rental and SIPP figures for the current tax year, ready to
          hand to your accountant.
        </p>
        <button className="btn" onClick={handleExportAll}>
          ⬆️ Full export (CSV)
        </button>
      </div>

      <p className="disclaimer">
        ⚠️ TaxTrack UK organises your data and computes estimates. It is not tax advice: have your
        Self Assessment checked by an accountant or adviser before submitting it to HMRC (deadline:
        31 January online, 31 October on paper).
      </p>
    </>
  )
}
