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
      alert('Please enter a valid amount.')
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
    if (!confirm('Delete this entry?')) return
    await deleteRentalEntry(id)
    refresh()
  }

  const handleExportCsv = () => {
    downloadBlob(
      new Blob([rentalCsv(yearEntries, selectedYear, { usePropertyAllowance: useAllowance })], { type: 'text/csv;charset=utf-8' }),
      `taxtrack-rental-${formatTaxYear(selectedYear).replace('/', '-')}.csv`,
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
        <h2>🏠 Rental — tax year</h2>
        <div className="fy-selector">
          <button onClick={() => moveYear(-1)}>‹</button>
          <span className="fy-label">{formatTaxYear(selectedYear)}</span>
          <button onClick={() => moveYear(1)}>›</button>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
          from 6 April {selectedYear.label - 1} to 5 April {selectedYear.label}
        </p>
      </div>

      <div className="card">
        <div className="row">
          <span className="label">Rental income</span>
          <span className="value positive">£{summary.income.toFixed(2)}</span>
        </div>
        {summary.propertyAllowanceExempt && (
          <p className="ocr-status" style={{ background: '#f0fdf4', color: '#15803d', marginTop: 8 }}>
            ✅ Income ≤ £1,000: exempt via the property allowance (s.783B), nothing to declare.
          </p>
        )}
        {!summary.propertyAllowanceExempt && !useAllowance && (
          <div className="row">
            <span className="label">Deductible expenses</span>
            <span className="value negative">−£{summary.deductibleExpenses.toFixed(2)}</span>
          </div>
        )}
        {summary.capitalExpenditure > 0 && (
          <div className="row">
            <span className="label">
              Improvements (capital)
              <span className="sub">not deductible — kept for CGT on a future sale</span>
            </span>
            <span className="value">£{summary.capitalExpenditure.toFixed(2)}</span>
          </div>
        )}
        <div className="row">
          <span className="label">
            Taxable profit
            <span className="sub">
              {summary.propertyAllowanceElected
                ? 'income − £1,000 (property allowance)'
                : summary.propertyAllowanceExempt
                  ? 'exempt'
                  : 'before tax credit on interest'}
            </span>
          </span>
          <span className={`value ${summary.taxableProfit >= 0 ? 'positive' : 'negative'}`}>
            £{summary.taxableProfit.toFixed(2)}
          </span>
        </div>
        {summary.financeCostCredit > 0 && (
          <div className="row">
            <span className="label">
              Tax credit (interest, 20%)
              <span className="sub">reduces the tax you pay, not the profit</span>
            </span>
            <span className="value positive">£{summary.financeCostCredit.toFixed(2)}</span>
          </div>
        )}
        {!summary.propertyAllowanceExempt && (
          <>
            <div className="row" onClick={toggleAllowance} style={{ cursor: 'pointer' }}>
              <span className="label">
                £1,000 flat allowance (property allowance)
                <span className="sub">
                  {useAllowance
                    ? 'on: replaces all expenses, including the interest credit'
                    : 'off: actual expenses declared'}
                </span>
              </span>
              <input type="checkbox" checked={useAllowance} readOnly />
            </div>
            {allowanceRecommended && (
              <p className="ocr-status" style={{ background: '#f0fdf4', color: '#15803d', marginTop: 8 }}>
                💡 Your actual expenses (£{summary.deductibleExpenses.toFixed(2)}) are below £1,000:
                the flat allowance would be more advantageous. Tick the box above.
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>Add an entry</h2>
        <label className="field">
          Type
          <select value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
            <optgroup label="Income">
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Deductible expenses">
              {expenseCategories
                .filter((c) => !c.taxCredit)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Capital (not deductible, CGT)">
              {capitalCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Tax credit">
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
          Amount (£)
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
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="E.g. EDF bill, January" />
        </label>
        <button className="btn" onClick={handleAdd}>
          ➕ Add
        </button>
      </div>

      <div className="card">
        <h2>By category</h2>
        {CATEGORIES.filter((c) => totals[c.id] > 0).length === 0 && (
          <p className="empty-state">No data for this tax year.</p>
        )}
        {CATEGORIES.filter((c) => totals[c.id] > 0).map((c) => (
          <div className="row" key={c.id}>
            <span className="label">
              {c.label}
              {c.taxCredit && <span className="sub">20% tax credit</span>}
              {c.capital && <span className="sub">capital — not deductible (CGT base cost)</span>}
            </span>
            <span className="value">£{totals[c.id].toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Entries for the year ({yearEntries.length})</h2>
        {yearEntries.length === 0 && <p className="empty-state">Nothing to display.</p>}
        {yearEntries.map((e) => (
          <div className="row" key={e.id}>
            <span className="label">
              {getCategory(e.category).label}
              <span className="sub">
                {new Date(e.date).toLocaleDateString('en-GB')}
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
        <h2>Export for your tax return</h2>
        <div className="camera-actions">
          <button className="btn" onClick={handleExportCsv}>
            ⬆️ Export CSV
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
        ⚠️ Indicative estimate. Points to check with an accountant: deductible repairs vs capital
        improvements, RDIR (like-for-like replacement of movable domestic items only),
        "wholly and exclusively", rental losses can only be offset against future rental
        income, and the cash basis applies up to £150,000 of receipts.
      </p>
    </>
  )
}
