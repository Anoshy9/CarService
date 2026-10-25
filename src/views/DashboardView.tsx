import { useEffect, useMemo, useState } from 'react'
import {
  listReceipts,
  listRentalEntries,
  listSippContributions,
  type ReceiptRecord,
  type RentalRecord,
  type SippRecord,
  getSettings,
} from '../db/database'
import { getTaxYear, formatTaxYear, isInTaxYear, parseISODate } from '../lib/taxYear'
import { summariseRental } from '../lib/rental'
import { summariseSipp } from '../lib/sipp'
import { downloadBlob, receiptsCsv, rentalCsv, sippCsv, exportRentalPdf, exportSippPdf } from '../lib/export'

export function DashboardView() {
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [rental, setRental] = useState<RentalRecord[]>([])
  const [sipp, setSipp] = useState<SippRecord[]>([])
  const [band, setBand] = useState<'basic' | 'higher' | 'additional'>('basic')

  const taxYear = useMemo(() => getTaxYear(), [])

  useEffect(() => {
    listReceipts().then(setReceipts)
    listRentalEntries().then(setRental)
    listSippContributions().then(setSipp)
    getSettings().then((s) => setBand(s.taxBand))
  }, [])

  const inYear = <T extends { date: string }>(items: T[]) =>
    items.filter((i) => isInTaxYear(parseISODate(i.date), taxYear))

  const yearReceipts = inYear(receipts)
  const yearRental = inYear(rental)
  const yearSipp = inYear(sipp)

  const rentalSummary = summariseRental(yearRental)
  const sippSummary = summariseSipp(yearSipp, band)

  const totalExpenses = yearReceipts
    .filter((r) => r.source === 'rental')
    .reduce((sum, r) => sum + r.amount, 0)

  const handleExportAll = () => {
    const parts = [
      `# TaxTrack UK — export complet — année fiscale ${formatTaxYear(taxYear)}`,
      '',
      '## Reçus',
      receiptsCsv(yearReceipts),
      '',
      '## Location',
      rentalCsv(yearRental, taxYear),
      '',
      '## SIPP',
      sippCsv(yearSipp, band, taxYear),
    ]
    downloadBlob(
      new Blob([parts.join('\n')], { type: 'text/csv;charset=utf-8' }),
      `taxtrack-export-${formatTaxYear(taxYear).replace('/', '-')}.csv`,
    )
  }

  return (
    <>
      <div className="card">
        <h2>📊 Année fiscale {formatTaxYear(taxYear)}</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          du 6 avril {taxYear.label - 1} au 5 avril {taxYear.label}
        </p>
      </div>

      <div className="card">
        <h2>🏠 Location</h2>
        <div className="row">
          <span className="label">Revenus locatifs</span>
          <span className="value positive">£{rentalSummary.income.toFixed(2)}</span>
        </div>
        <div className="row">
          <span className="label">Frais déductibles</span>
          <span className="value negative">−£{rentalSummary.deductibleExpenses.toFixed(2)}</span>
        </div>
        <div className="row">
          <span className="label">Bénéfice imposable</span>
          <span className={`value ${rentalSummary.profit >= 0 ? 'positive' : 'negative'}`}>
            £{rentalSummary.profit.toFixed(2)}
          </span>
        </div>
        {rentalSummary.financeCostCredit > 0 && (
          <div className="row">
            <span className="label">Crédit d’impôt (intérêts 20 %)</span>
            <span className="value positive">£{rentalSummary.financeCostCredit.toFixed(2)}</span>
          </div>
        )}
        <button
          className="btn secondary"
          style={{ marginTop: 10 }}
          onClick={() => exportRentalPdf(yearRental, taxYear)}
        >
          📄 Export PDF location
        </button>
      </div>

      <div className="card">
        <h2>💷 SIPP</h2>
        <div className="row">
          <span className="label">Net versé cette année</span>
          <span className="value">£{sippSummary.netPaid.toFixed(2)}</span>
        </div>
        <div className="row">
          <span className="label">Contribution brute (plafond £60,000)</span>
          <span className="value">£{sippSummary.grossContributions.toFixed(2)}</span>
        </div>
        <div className="row">
          <span className="label">Relief total (base + complémentaire)</span>
          <span className="value positive">
            £{(sippSummary.basicRateRelief + sippSummary.higherRateRelief + sippSummary.additionalRateRelief).toFixed(2)}
          </span>
        </div>
        {sippSummary.overAnnualAllowance && (
          <p className="ocr-status" style={{ background: '#fef2f2', color: '#dc2626', marginTop: 8 }}>
            ⚠ Plafond annuel dépassé de £{Math.abs(sippSummary.remainingAnnualAllowance).toFixed(2)}
          </p>
        )}
        <button
          className="btn secondary"
          style={{ marginTop: 10 }}
          onClick={() => exportSippPdf(yearSipp, band, taxYear)}
        >
          📄 Export PDF SIPP
        </button>
      </div>

      <div className="card">
        <h2>📸 Reçus scannés</h2>
        <div className="row">
          <span className="label">Reçus cette année</span>
          <span className="value">{yearReceipts.length}</span>
        </div>
        <div className="row">
          <span className="label">Dépenses « location » des reçus</span>
          <span className="value">£{totalExpenses.toFixed(2)}</span>
        </div>
      </div>

      <div className="card">
        <h2>⬇️ Tout exporter</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>
          Un seul fichier CSV avec les reçus, la location et le SIPP de l’année fiscale en cours,
          prêt à être transmis à ton comptable.
        </p>
        <button className="btn" onClick={handleExportAll}>
          ⬇️ Export complet (CSV)
        </button>
      </div>

      <p className="disclaimer">
        ⚠️ TaxTrack UK organise tes données et calcule des estimations. Ce n’est pas un conseil
        fiscal : fais valider ta Self Assessment par un comptable ou un conseiller avant de la
        soumettre à HMRC (échéance : 31 janvier en ligne, 31 octobre sur papier).
      </p>
    </>
  )
}
