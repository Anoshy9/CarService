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
      `# TaxTrack UK — export complet — année fiscale ${formatTaxYear(taxYear)}`,
      '',
      '## Reçus',
      receiptsCsv(yearReceipts),
      '',
      '## Location',
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
        {rentalSummary.propertyAllowanceExempt && (
          <p className="ocr-status" style={{ background: '#f0fdf4', color: '#15803d', marginTop: 8 }}>
            ✅ Revenus ≤ £1,000 : exonérés via la property allowance, rien à déclarer pour la location.
          </p>
        )}
        {rentalSummary.propertyAllowanceElected && (
          <p className="ocr-status" style={{ background: '#eff6ff', color: '#1d4ed8', marginTop: 8 }}>
            ℹ️ Property allowance £1,000 choisie : bénéfice = revenus − £1,000, aucun frais ni crédit
            d’intérêt déclaré.
          </p>
        )}
        {!rentalSummary.propertyAllowanceExempt && !rentalSummary.propertyAllowanceElected && (
          <div className="row">
            <span className="label">Frais déductibles</span>
            <span className="value negative">−£{rentalSummary.deductibleExpenses.toFixed(2)}</span>
          </div>
        )}
        {rentalSummary.capitalExpenditure > 0 && (
          <div className="row">
            <span className="label">
              Améliorations (capital, non déductibles)
              <span className="sub">conservées pour le calcul du CGT en cas de vente</span>
            </span>
            <span className="value">£{rentalSummary.capitalExpenditure.toFixed(2)}</span>
          </div>
        )}
        <div className="row">
          <span className="label">Bénéfice imposable</span>
          <span className={`value ${rentalSummary.taxableProfit >= 0 ? 'positive' : 'negative'}`}>
            £{rentalSummary.taxableProfit.toFixed(2)}
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
          onClick={() =>
            exportRentalPdf(yearRental, taxYear, {
              usePropertyAllowance: settings?.usePropertyAllowance,
            })
          }
        >
          📄 Export PDF location
        </button>
      </div>

      {taxEstimate && (
        <div className="card">
          <h2>🧾 Impôt estimé (2025/26, Angleterre)</h2>
          <div className="row">
            <span className="label">
              Abattement personnel
              <span className="sub">£12,570, réduit au-delà de £100,000 de revenu</span>
            </span>
            <span className="value">£{taxEstimate.personalAllowance.toFixed(2)}</span>
          </div>
          <div className="row">
            <span className="label">Impôt sur le revenu (tranches 20/40/45 %)</span>
            <span className="value">£{taxEstimate.taxOnIncome.toFixed(2)}</span>
          </div>
          {taxEstimate.financeCostCredit > 0 && (
            <div className="row">
              <span className="label">Crédit Section 24 (intérêts)</span>
              <span className="value positive">−£{taxEstimate.financeCostCredit.toFixed(2)}</span>
            </div>
          )}
          <div className="row">
            <span className="label">
              <b>Impôt estimé à payer</b>
              <span className="sub">hors acomptes déjà versés, hors autres revenus non saisis</span>
            </span>
            <span className="big-number">£{taxEstimate.taxDue.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="card">
        <h2>💷 SIPP</h2>
        <div className="row">
          <span className="label">Net versé cette année</span>
          <span className="value">£{sippSummary.netPaid.toFixed(2)}</span>
        </div>
        <div className="row">
          <span className="label">
            Contribution brute (plafond £{sippSummary.effectiveAnnualAllowance.toLocaleString('en-GB')})
          </span>
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
        {sippSummary.overReliefCap && (
          <p className="ocr-status" style={{ background: '#fef2f2', color: '#dc2626', marginTop: 8 }}>
            ⚠ £{sippSummary.grossAboveReliefCap.toFixed(2)} brut au-dessus de ton plafond de relief
            (£{sippSummary.reliefCapGross.toLocaleString('en-GB')} — règle des relevant UK earnings) :
            cette part n’ouvre <b>aucun</b> droit à relief fiscal.
          </p>
        )}
        <button
          className="btn secondary"
          style={{ marginTop: 10 }}
          onClick={() => exportSippPdf(yearSipp, band, taxYear, settings?.sippProfile)}
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
