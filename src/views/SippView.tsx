import { useEffect, useMemo, useState } from 'react'
import {
  addSippContribution,
  deleteSippContribution,
  getSettingsMigrated,
  listSippContributions,
  newId,
  saveSettings,
  type SettingsRecord,
  type SippRecord,
} from '../db/database'
import {
  summariseSipp,
  type SippProfile,
  type TaxBand,
} from '../lib/sipp'
import { isInTaxYear, listRecentTaxYears, parseISODate, toISODate, formatTaxYear, type TaxYear } from '../lib/taxYear'
import { downloadBlob, exportSippPdf, sippCsv } from '../lib/export'

const BANDS: { id: TaxBand; label: string; description: string }[] = [
  { id: 'basic', label: 'Basic rate (20%)', description: 'Income up to £50,270' },
  { id: 'higher', label: 'Higher rate (40%)', description: '£50,271 – £125,140' },
  { id: 'additional', label: 'Additional rate (45%)', description: 'Above £125,140' },
]

export function SippView() {
  const years = useMemo(() => listRecentTaxYears(5), [])
  const [selectedYear, setSelectedYear] = useState<TaxYear>(() => years[years.length - 1])
  const [contributions, setContributions] = useState<SippRecord[]>([])
  const [band, setBand] = useState<TaxBand>('basic')
  const [profile, setProfile] = useState<SippProfile>({
    relevantUkEarnings: 0,
    mpaaTriggered: false,
    thresholdIncome: 0,
    adjustedIncome: 0,
  })
  const [settings, setSettings] = useState<SettingsRecord | null>(null)

  const [netAmount, setNetAmount] = useState('')
  const [date, setDate] = useState(toISODate(new Date()))
  const [provider, setProvider] = useState('')
  const [note, setNote] = useState('')

  const refresh = () => listSippContributions().then(setContributions)

  useEffect(() => {
    refresh()
    getSettingsMigrated().then((s) => {
      setSettings(s)
      setBand(s.taxBand)
      setProfile(s.sippProfile)
    })
  }, [])

  const handleBandChange = async (newBand: TaxBand) => {
    setBand(newBand)
    if (settings) await saveSettings({ ...settings, taxBand: newBand })
  }

  const yearContributions = contributions.filter((c) =>
    isInTaxYear(parseISODate(c.date), selectedYear),
  )
  const summary = summariseSipp(yearContributions, band, profile)

  const moveYear = (delta: number) => {
    const idx = years.findIndex((y) => y.label === selectedYear.label)
    const next = years[idx + delta]
    if (next) setSelectedYear(next)
  }

  const handleAdd = async () => {
    const value = Number.parseFloat(netAmount)
    if (!Number.isFinite(value) || value <= 0) {
      alert('Please enter a valid amount.')
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
    if (!confirm('Delete this contribution?')) return
    await deleteSippContribution(id)
    refresh()
  }

  const allowancePct = Math.min(
    100,
    (summary.grossContributions / summary.effectiveAnnualAllowance) * 100,
  )
  const reliefCapPct = Math.min(
    100,
    (summary.grossContributions / summary.reliefCapGross) * 100,
  )

  return (
    <>
      <div className="card">
        <h2>💷 SIPP — pension contributions</h2>
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
        <h2>Your tax band</h2>
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
          The provider automatically claims 20% basic-rate relief. If you are a higher or
          additional rate taxpayer, the extra relief is claimed through your Self Assessment.
        </p>
      </div>

      <div className="card">
        <h2>Summary {formatTaxYear(selectedYear)}</h2>
        <div className="row">
          <span className="label">Total net paid (from your account)</span>
          <span className="value">£{summary.netPaid.toFixed(2)}</span>
        </div>
        <div className="row">
          <span className="label">
            Basic-rate relief claimed by the provider
            <span className="sub">20% of gross = 25% of net</span>
          </span>
          <span className="value positive">+£{summary.basicRateRelief.toFixed(2)}</span>
        </div>
        <div className="row">
          <span className="label">
            Gross contribution (SIPP account)
            <span className="sub">this is the amount that uses up your annual allowance</span>
          </span>
          <span className="big-number">£{summary.grossContributions.toFixed(2)}</span>
        </div>
        <div className="progress">
          <div style={{ width: `${allowancePct}%` }} />
        </div>
        <div className="row">
          <span className="label">
            Annual allowance (£{summary.effectiveAnnualAllowance.toLocaleString('en-GB')})
            {summary.effectiveAnnualAllowance < 60000 && (
              <span className="sub">
                {profile.mpaaTriggered
                  ? 'MPAA triggered (flexible pension access)'
                  : 'tapered annual allowance (income > £200k / £260k)'}
              </span>
            )}
            {summary.overAnnualAllowance && (
              <span className="sub" style={{ color: '#dc2626' }}>
                ⚠ over by £{Math.abs(summary.remainingAnnualAllowance).toFixed(2)} — possible
                penalty (annual allowance charge)
              </span>
            )}
          </span>
          <span className={`value ${summary.overAnnualAllowance ? 'negative' : ''}`}>
            £{summary.remainingAnnualAllowance.toFixed(2)} left
          </span>
        </div>
        <div className="row">
          <span className="label">
            Relief cap (relevant UK earnings)
            <span className="sub">
              {profile.relevantUkEarnings > 0
                ? '100% of your UK employment/self-employment earnings'
                : 'no UK earnings declared → £3,600 gross max (£2,880 net). Rental income does not count.'}
            </span>
          </span>
          <span className="value">£{summary.reliefCapGross.toLocaleString('en-GB')}</span>
        </div>
        <div className="progress">
          <div style={{ width: `${reliefCapPct}%`, background: summary.overReliefCap ? '#dc2626' : '#16a34a' }} />
        </div>
        {summary.overReliefCap && (
          <p className="ocr-status" style={{ background: '#fef2f2', color: '#dc2626', marginTop: 8 }}>
            ⚠ £{summary.grossAboveReliefCap.toFixed(2)} gross exceeds your relief cap: this
            part generates <b>no</b> tax relief. Enter the rule in ⚙️ Settings if you have a UK salary.
          </p>
        )}
        <div className="row">
          <span className="label">
            Extra relief to claim (Self Assessment)
            <span className="sub">
              {band === 'basic' && 'none — basic rate'}
              {band === 'higher' && 'higher rate: +20% of gross'}
              {band === 'additional' && 'additional rate: +25% of gross'}
            </span>
          </span>
          <span className="value positive">
            £{(summary.higherRateRelief + summary.additionalRateRelief).toFixed(2)}
          </span>
        </div>
      </div>

      <div className="card">
        <h2>Add a contribution</h2>
        <label className="field">
          Net amount paid (£)
          <input
            type="number"
            step="0.01"
            min="0"
            value={netAmount}
            onChange={(e) => setNetAmount(e.target.value)}
            placeholder="Amount debited from your account"
          />
        </label>
        <label className="field">
          Contribution date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          Provider (optional)
          <input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="E.g. Hargreaves Lansdown, Vanguard…"
          />
        </label>
        <label className="field">
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="E.g. monthly contribution" />
        </label>
        <button className="btn" onClick={handleAdd}>
          ➕ Add contribution
        </button>
      </div>

      <div className="card">
        <h2>Contributions for the year ({yearContributions.length})</h2>
        {yearContributions.length === 0 && (
          <p className="empty-state">No contributions for this tax year.</p>
        )}
        {yearContributions.map((c) => (
          <div className="row" key={c.id}>
            <span className="label">
              {c.provider || 'SIPP contribution'}
              <span className="sub">
                {new Date(c.date).toLocaleDateString('en-GB')}
                {c.note ? ` · ${c.note}` : ''}
                {' · gross £' + (c.netAmount / 0.8).toFixed(2)}
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
        <h2>Export</h2>
        <div className="camera-actions">
          <button
            className="btn"
            onClick={() =>
              downloadBlob(
                new Blob([sippCsv(yearContributions, band, selectedYear, profile)], {
                  type: 'text/csv;charset=utf-8',
                }),
                `taxtrack-sipp-${formatTaxYear(selectedYear).replace('/', '-')}.csv`,
              )
            }
          >
            ⬆️ Export CSV
          </button>
          <button
            className="btn secondary"
            onClick={() => exportSippPdf(yearContributions, band, selectedYear, profile)}
          >
            📄 Export PDF
          </button>
        </div>
      </div>

      <p className="disclaimer">
        ⚠ Carry forward of unused annual allowance from the 3 previous years is not modelled. If
        you exceed a cap, speak to a financial adviser — a tax charge (the "annual allowance
        charge") may apply.
      </p>
    </>
  )
}
