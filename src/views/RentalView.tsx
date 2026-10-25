import { useEffect, useMemo, useState } from 'react'
import {
  addRentalEntry,
  deleteRentalEntry,
  getSettingsMigrated,
  listRentalEntries,
  newId,
  saveSettings,
  type RentalRecord,
  type SettingsRecord,
} from '../db/database'
import { CATEGORIES, getCategory, sumByCategory, type CategoryId } from '../lib/categories'
import { propertyAllowanceIsBetter, summariseRental } from '../lib/rental'
import { isInTaxYear, listRecentTaxYears, parseISODate, toISODate, formatTaxYear, type TaxYear } from '../lib/taxYear'
import { downloadBlob, exportRentalPdf, rentalCsv } from '../lib/export'

export function RentalView() {
  const years = useMemo(() => listRecentTaxYears(5), [])
  const [selectedYear, setSelectedYear] = useState<TaxYear>(() => years[years.length - 1])
  const [entries, setEntries] = useState<RentalRecord[]>([])
  const [settings, setSettings] = useState<SettingsRecord | null>(null)

  // Manual entry form
  const [category, setCategory] = useState<CategoryId>('council_tax')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(toISODate(new Date()))
  const [note, setNote] = useState('')

  const refresh = () => listRentalEntries().then(setEntries)

  useEffect(() => {
    refresh()
    getSettingsMigrated().then(setSettings)
  }, [])

  const useAllowance = settings?.usePropertyAllowance ?? false
  const yearEntries = entries.filter((e) => isInTaxYear(parseISODate(e.date), selectedYear))
  const summary = summariseRental(yearEntries, { usePropertyAllowance: useAllowance })
  const totals = sumByCategory(yearEntries)

  const toggleAllowance = async () => {
    if (!settings) return
    const next = { ...settings, usePropertyAllowance: !settings.usePropertyAllowance }
    setSettings(next)
    await saveSettings(next)
  }

  const moveYear = (delta: number) => {
    const idx = years.findIndex((y) => y.label === selectedYear.label)
    const next = years[idx + delta]
    if (next) setSelectedYear(next)
  }

  const handleAdd = async () => {
    const value = Number.parseFloat(amount)
    if (!Number.isFinite(value) || value <= 0) {
      alert('Merci de saisir un montant valide.')
      return
    }
    await addRentalEntry({
      id: newId(),
      category,
      amount: Math.round(value * 100) / 100,
      date,
      note: note.trim() || undefined,
    })
    setAmount('')
    setNote('')
    refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette ligne ?')) return
    await deleteRentalEntry(id)
    refresh()
  }

  const handleExportCsv = () => {
    downloadBlob(
      new Blob([rentalCsv(yearEntries, selectedYear, { usePropertyAllowance: useAllowance })], { type: 'text/csv;charset=utf-8' }),
      `taxtrack-location-${formatTaxYear(selectedYear).replace('/', '-')}.csv`,
    )
  }

  const expenseCategories = CATEGORIES.filter((c) => c.deductible || c.taxCredit)
  const capitalCategories = CATEGORIES.filter((c) => c.capital)
  const incomeCategories = CATEGORIES.filter((c) => c.income)

  const allowanceRecommended =
    !summary.propertyAllowanceExempt &&
    !useAllowance &&
    propertyAllowanceIsBetter(
      summary.income,
      summary.deductibleExpenses,
      summary.financeCostCredit,
    )

  return (
    <>
      <div className="card">
        <h2>🏠 Location — année fiscale</h2>
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
        <div className="row">
          <span className="label">Revenus locatifs</span>
          <span className="value positive">£{summary.income.toFixed(2)}</span>
        </div>
        {summary.propertyAllowanceExempt && (
          <p className="ocr-status" style={{ background: '#f0fdf4', color: '#15803d', marginTop: 8 }}>
            ✅ Revenus ≤ £1,000 : exonérés via la property allowance (s.783B), rien à déclarer.
          </p>
        )}
        {!summary.propertyAllowanceExempt && !useAllowance && (
          <div className="row">
            <span className="label">Frais déductibles</span>
            <span className="value negative">−£{summary.deductibleExpenses.toFixed(2)}</span>
          </div>
        )}
        {summary.capitalExpenditure > 0 && (
          <div className="row">
            <span className="label">
              Améliorations (capital)
              <span className="sub">non déductibles — conservées pour le CGT en cas de vente</span>
            </span>
            <span className="value">£{summary.capitalExpenditure.toFixed(2)}</span>
          </div>
        )}
        <div className="row">
          <span className="label">
            Bénéfice imposable
            <span className="sub">
              {summary.propertyAllowanceElected
                ? 'revenus − £1,000 (property allowance)'
                : summary.propertyAllowanceExempt
                  ? 'exonéré'
                  : 'avant crédit d’impôt sur les intérêts'}
            </span>
          </span>
          <span className={`value ${summary.taxableProfit >= 0 ? 'positive' : 'negative'}`}>
            £{summary.taxableProfit.toFixed(2)}
          </span>
        </div>
        {summary.financeCostCredit > 0 && (
          <div className="row">
            <span className="label">
              Crédit d’impôt (intérêts, 20 %)
              <span className="sub">réduit l’impôt à payer, pas le bénéfice</span>
            </span>
            <span className="value positive">£{summary.financeCostCredit.toFixed(2)}</span>
          </div>
        )}
        {!summary.propertyAllowanceExempt && (
          <>
            <div className="row" onClick={toggleAllowance} style={{ cursor: 'pointer' }}>
              <span className="label">
                Abattement forfaitaire £1,000 (property allowance)
                <span className="sub">
                  {useAllowance
                    ? 'activé : remplace tous les frais, y compris le crédit sur les intérêts'
                    : 'désactivé : frais réels déclarés'}
                </span>
              </span>
              <input type="checkbox" checked={useAllowance} readOnly />
            </div>
            {allowanceRecommended && (
              <p className="ocr-status" style={{ background: '#f0fdf4', color: '#15803d', marginTop: 8 }}>
                💡 Tes frais réels (£{summary.deductibleExpenses.toFixed(2)}) sont inférieurs à £1,000 :
                l’abattement forfaitaire serait plus avantageux. Coche la case ci-dessus.
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>Ajouter une ligne</h2>
        <label className="field">
          Type
          <select value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
            <optgroup label="Revenus">
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Frais déductibles">
              {expenseCategories
                .filter((c) => !c.taxCredit)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Capital (non déductible, CGT)">
              {capitalCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Crédit d’impôt">
              {expenseCategories
                .filter((c) => c.taxCredit)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <label className="field">
          Montant (£)
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </label>
        <label className="field">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          Note (optionnel)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex : facture EDF janvier" />
        </label>
        <button className="btn" onClick={handleAdd}>
          ➕ Ajouter
        </button>
      </div>

      <div className="card">
        <h2>Par catégorie</h2>
        {CATEGORIES.filter((c) => totals[c.id] > 0).length === 0 && (
          <p className="empty-state">Aucune donnée pour cette année fiscale.</p>
        )}
        {CATEGORIES.filter((c) => totals[c.id] > 0).map((c) => (
          <div className="row" key={c.id}>
            <span className="label">
              {c.label}
              {c.taxCredit && <span className="sub">crédit d’impôt 20 %</span>}
              {c.capital && <span className="sub">capital — non déductible (base cost CGT)</span>}
            </span>
            <span className="value">£{totals[c.id].toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Lignes de l’année ({yearEntries.length})</h2>
        {yearEntries.length === 0 && <p className="empty-state">Rien à afficher.</p>}
        {yearEntries.map((e) => (
          <div className="row" key={e.id}>
            <span className="label">
              {getCategory(e.category).label}
              <span className="sub">
                {new Date(e.date).toLocaleDateString('fr-FR')}
                {e.note ? ` · ${e.note}` : ''}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="value">£{e.amount.toFixed(2)}</span>
              <button className="btn small danger" onClick={() => handleDelete(e.id)}>
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Exporter pour la déclaration</h2>
        <div className="camera-actions">
          <button className="btn" onClick={handleExportCsv}>
            ⬇️ Export CSV
          </button>
          <button
            className="btn secondary"
            onClick={() => exportRentalPdf(yearEntries, selectedYear, { usePropertyAllowance: useAllowance })}
          >
            📄 Export PDF
          </button>
        </div>
      </div>

      <p className="disclaimer">
        ⚠️ Estimation à titre indicatif. Points à vérifier avec un comptable : réparations
        déductibles vs améliorations (capital), RDIR (remplacement « like-for-like » d’objets
        mobiliers uniquement), « wholly and exclusively », pertes locatives reportables uniquement
        sur de futurs revenus locatifs, et base « cash basis » jusqu’à £150,000 de recettes.
      </p>
    </>
  )
}
