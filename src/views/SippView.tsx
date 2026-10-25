import { useEffect, useMemo, useState } from 'react'
import {
  addSippContribution,
  deleteSippContribution,
  getSettings,
  listSippContributions,
  newId,
  saveSettings,
  type SippRecord,
} from '../db/database'
import {
  ANNUAL_ALLOWANCE_GROSS,
  summariseSipp,
  type TaxBand,
} from '../lib/sipp'
import { isInTaxYear, listRecentTaxYears, parseISODate, toISODate, formatTaxYear, type TaxYear } from '../lib/taxYear'
import { downloadBlob, exportSippPdf, sippCsv } from '../lib/export'

const BANDS: { id: TaxBand; label: string; description: string }[] = [
  { id: 'basic', label: 'Taux de base (20 %)', description: 'Revenus jusqu’à £50,270' },
  { id: 'higher', label: 'Taux supérieur (40 %)', description: '£50,271 – £125,140' },
  { id: 'additional', label: 'Taux additionnel (45 %)', description: 'Au-delà de £125,140' },
]

export function SippView() {
  const years = useMemo(() => listRecentTaxYears(5), [])
  const [selectedYear, setSelectedYear] = useState<TaxYear>(() => years[years.length - 1])
  const [contributions, setContributions] = useState<SippRecord[]>([])
  const [band, setBand] = useState<TaxBand>('basic')

  const [netAmount, setNetAmount] = useState('')
  const [date, setDate] = useState(toISODate(new Date()))
  const [provider, setProvider] = useState('')
  const [note, setNote] = useState('')

  const refresh = () => listSippContributions().then(setContributions)

  useEffect(() => {
    refresh()
    getSettings().then((s) => setBand(s.taxBand))
  }, [])

  const handleBandChange = async (newBand: TaxBand) => {
    setBand(newBand)
    const settings = await getSettings()
    await saveSettings({ ...settings, taxBand: newBand })
  }

  const yearContributions = contributions.filter((c) =>
    isInTaxYear(parseISODate(c.date), selectedYear),
  )
  const summary = summariseSipp(yearContributions, band)

  const moveYear = (delta: number) => {
    const idx = years.findIndex((y) => y.label === selectedYear.label)
    const next = years[idx + delta]
    if (next) setSelectedYear(next)
  }

  const handleAdd = async () => {
    const value = Number.parseFloat(netAmount)
    if (!Number.isFinite(value) || value <= 0) {
      alert('Merci de saisir un montant valide.')
      return
    }
    await addSippContribution({
      id: newId(),
      netAmount: Math.round(value * 100) / 100,
      date,
      provider: provider.trim() || undefined,
      note: note.trim() || undefined,
    })
    setNetAmount('')
    setProvider('')
    setNote('')
    refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce versement ?')) return
    await deleteSippContribution(id)
    refresh()
  }

  const allowancePct = Math.min(
    100,
    (summary.grossContributions / ANNUAL_ALLOWANCE_GROSS) * 100,
  )

  return (
    <>
      <div className="card">
        <h2>💷 SIPP — versements retraite</h2>
        <div className="fy-selector">
          <button onClick={() => moveYear(-1)}>‹</button>
          <span className="fy-label">{formatTaxYear(selectedYear)}</span>
          <button onClick={() => moveYear(1)}>›</button>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
          du 6 avril {selectedYear.label - 1} au 5 avril {selectedYear.label}
        </p>
      </div>

      <div className="card">
        <h2>Ta tranche d’imposition</h2>
        {BANDS.map((b) => (
          <div className="row" key={b.id} onClick={() => handleBandChange(b.id)} style={{ cursor: 'pointer' }}>
            <span className="label">
              {b.label}
              <span className="sub">{b.description}</span>
            </span>
            <input type="radio" checked={band === b.id} readOnly />
          </div>
        ))}
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
          Le provider réclame automatiquement 20 % de relief de base. Si tu es en taux supérieur
          ou additionnel, le relief complémentaire se déclare dans ta Self Assessment.
        </p>
      </div>

      <div className="card">
        <h2>Résumé {formatTaxYear(selectedYear)}</h2>
        <div className="row">
          <span className="label">Total net versé (depuis ton compte)</span>
          <span className="value">£{summary.netPaid.toFixed(2)}</span>
        </div>
        <div className="row">
          <span className="label">
            Relief de base réclamé par le provider
            <span className="sub">20 % du brut = 25 % du net</span>
          </span>
          <span className="value positive">+£{summary.basicRateRelief.toFixed(2)}</span>
        </div>
        <div className="row">
          <span className="label">
            Contribution brute (compte SIPP)
            <span className="sub">c’est ce montant qui consomme ton plafond annuel</span>
          </span>
          <span className="big-number">£{summary.grossContributions.toFixed(2)}</span>
        </div>
        <div className="progress">
          <div style={{ width: `${allowancePct}%` }} />
        </div>
        <div className="row">
          <span className="label">
            Plafond annuel (£{ANNUAL_ALLOWANCE_GROSS.toLocaleString('en-GB')})
            {summary.overAnnualAllowance && (
              <span className="sub" style={{ color: '#dc2626' }}>
                ⚠ dépassé de £{Math.abs(summary.remainingAnnualAllowance).toFixed(2)} — pénalité
                possible (annual allowance charge)
              </span>
            )}
          </span>
          <span className={`value ${summary.overAnnualAllowance ? 'negative' : ''}`}>
            £{summary.remainingAnnualAllowance.toFixed(2)} restants
          </span>
        </div>
        <div className="row">
          <span className="label">
            Relief complémentaire à réclamer (Self Assessment)
            <span className="sub">
              {band === 'basic' && 'aucun — taux de base'}
              {band === 'higher' && 'taux supérieur : +20 % du brut'}
              {band === 'additional' && 'taux additionnel : +25 % du brut'}
            </span>
          </span>
          <span className="value positive">
            £{(summary.higherRateRelief + summary.additionalRateRelief).toFixed(2)}
          </span>
        </div>
      </div>

      <div className="card">
        <h2>Ajouter un versement</h2>
        <label className="field">
          Montant net versé (£)
          <input
            type="number"
            step="0.01"
            min="0"
            value={netAmount}
            onChange={(e) => setNetAmount(e.target.value)}
            placeholder="Montant débité de ton compte"
          />
        </label>
        <label className="field">
          Date du versement
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          Provider (optionnel)
          <input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="Ex : Hargreaves Lansdown, Vanguard…"
          />
        </label>
        <label className="field">
          Note (optionnel)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex : versement mensuel" />
        </label>
        <button className="btn" onClick={handleAdd}>
          ➕ Ajouter le versement
        </button>
      </div>

      <div className="card">
        <h2>Versements de l’année ({yearContributions.length})</h2>
        {yearContributions.length === 0 && (
          <p className="empty-state">Aucun versement pour cette année fiscale.</p>
        )}
        {yearContributions.map((c) => (
          <div className="row" key={c.id}>
            <span className="label">
              {c.provider || 'Versement SIPP'}
              <span className="sub">
                {new Date(c.date).toLocaleDateString('fr-FR')}
                {c.note ? ` · ${c.note}` : ''}
                {' · brut £' + (c.netAmount / 0.8).toFixed(2)}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="value">£{c.netAmount.toFixed(2)}</span>
              <button className="btn small danger" onClick={() => handleDelete(c.id)}>
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Exporter</h2>
        <div className="camera-actions">
          <button
            className="btn"
            onClick={() =>
              downloadBlob(
                new Blob([sippCsv(yearContributions, band, selectedYear)], {
                  type: 'text/csv;charset=utf-8',
                }),
                `taxtrack-sipp-${formatTaxYear(selectedYear).replace('/', '-')}.csv`,
              )
            }
          >
            ⬇️ Export CSV
          </button>
          <button
            className="btn secondary"
            onClick={() => exportSippPdf(yearContributions, band, selectedYear)}
          >
            📄 Export PDF
          </button>
        </div>
      </div>

      <p className="disclaimer">
        ⚠️ Le plafond annuel de £60,000 (brut) et le report des 3 années précédentes ne sont pas
        modélisés en détail. En cas de dépassement, consulte un conseiller financier — une taxe
        (« annual allowance charge ») peut s’appliquer.
      </p>
    </>
  )
}
