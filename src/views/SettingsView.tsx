import { useEffect, useState } from 'react'
import {
  getSettingsMigrated,
  saveSettings,
  type SettingsRecord,
} from '../db/database'
import { formatTaxYear, getTaxYear } from '../lib/taxYear'
import {
  ANNUAL_ALLOWANCE_GROSS,
  MPAA_GROSS,
  NON_EARNER_LIMIT_GROSS,
  TAPER_ADJUSTED_INCOME,
  TAPER_THRESHOLD_INCOME,
  effectiveAnnualAllowance,
  reliefCapGross,
} from '../lib/sipp'

export function SettingsView() {
  const [settings, setSettings] = useState<SettingsRecord | null>(null)
  const taxYear = getTaxYear()

  useEffect(() => {
    getSettingsMigrated().then(setSettings)
  }, [])

  const update = async (patch: Partial<SettingsRecord>) => {
    if (!settings) return
    const next = { ...settings, ...patch }
    setSettings(next)
    await saveSettings(next)
  }

  const updateProfile = async (patch: Partial<SettingsRecord['sippProfile']>) => {
    if (!settings) return
    await update({ sippProfile: { ...settings.sippProfile, ...patch } })
  }

  if (!settings) return <div className="card"><p className="empty-state">Loading…</p></div>

  const profile = settings.sippProfile
  const allowance = effectiveAnnualAllowance(profile)
  const reliefCap = reliefCapGross(profile)

  return (
    <>
      <div className="card">
        <h2>⚙️ Tax profile</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          This information calibrates the estimated tax and the SIPP limits for tax year{' '}
          {formatTaxYear(taxYear)}.
        </p>
        <div className="row">
          <span className="label">
            Tax residence
            <span className="sub">You indicated you are UK tax resident (the NRLS scheme does not apply).</span>
          </span>
          <span className="badge">UK resident</span>
        </div>
        <label className="field">
          Relevant UK earnings (£/year)
          <input
            type="number"
            min="0"
            step="100"
            value={profile.relevantUkEarnings || ''}
            placeholder="0 if your only income is rent"
            onChange={(e) =>
              updateProfile({ relevantUkEarnings: Number.parseFloat(e.target.value) || 0 })
            }
          />
          <span className="sub">
            Salary or self-employment profits from the UK only. <b>Rental income does NOT count.</b>
          </span>
        </label>
        <div className="row" onClick={() => updateProfile({ mpaaTriggered: !profile.mpaaTriggered })} style={{ cursor: 'pointer' }}>
          <span className="label">
            Flexible pension access (MPAA)
            <span className="sub">
              Tick if you have already taken a flexible income (drawdown) or an UFPLS. Taking only the
              25% tax-free lump sum does NOT trigger the MPAA.
            </span>
          </span>
          <input type="checkbox" checked={profile.mpaaTriggered} readOnly />
        </div>
        <label className="field">
          Threshold income (£/year)
          <input
            type="number"
            min="0"
            step="1000"
            value={profile.thresholdIncome || ''}
            placeholder="Total taxable income minus your pension contributions"
            onChange={(e) =>
              updateProfile({ thresholdIncome: Number.parseFloat(e.target.value) || 0 })
            }
          />
          <span className="sub">Taper applies if above £{TAPER_THRESHOLD_INCOME.toLocaleString('en-GB')}.</span>
        </label>
        <label className="field">
          Adjusted income (£/year)
          <input
            type="number"
            min="0"
            step="1000"
            value={profile.adjustedIncome || ''}
            placeholder="Total taxable income plus all pension contributions"
            onChange={(e) =>
              updateProfile({ adjustedIncome: Number.parseFloat(e.target.value) || 0 })
            }
          />
          <span className="sub">
            Taper applies if above £{TAPER_ADJUSTED_INCOME.toLocaleString('en-GB')} (both thresholds must be exceeded).
          </span>
        </label>
        <label className="field">
          Other taxable income (£/year)
          <input
            type="number"
            min="0"
            step="100"
            value={settings.otherTaxableIncome || ''}
            placeholder="Salary, dividends, etc. outside rental income"
            onChange={(e) =>
              update({ otherTaxableIncome: Number.parseFloat(e.target.value) || 0 })
            }
          />
          <span className="sub">Used only for the overall tax estimate.</span>
        </label>
        <div className="row" onClick={() => update({ usePropertyAllowance: !settings.usePropertyAllowance })} style={{ cursor: 'pointer' }}>
          <span className="label">
            £1,000 flat-rate property allowance
            <span className="sub">
              Replaces all deductible expenses (including the interest credit). Only worth using if your
              actual expenses are below £1,000.
            </span>
          </span>
          <input type="checkbox" checked={settings.usePropertyAllowance} readOnly />
        </div>
      </div>

      <div className="card">
        <h2>📋 What this changes for you</h2>
        <div className="row">
          <span className="label">
            SIPP relief cap (relevant UK earnings rule)
            <span className="sub">
              {profile.relevantUkEarnings > 0
                ? '100% of your UK employment/self-employment earnings.'
                : `No UK employment income: the maximum with tax relief is £${NON_EARNER_LIMIT_GROSS.toLocaleString('en-GB')} gross (£2,880 net). Rent does not count.`}
            </span>
          </span>
          <span className="value">£{reliefCap.toLocaleString('en-GB')} gross</span>
        </div>
        <div className="row">
          <span className="label">
            SIPP annual allowance
            <span className="sub">
              {profile.mpaaTriggered
                ? `MPAA triggered: allowance reduced to £${MPAA_GROSS.toLocaleString('en-GB')} (no carry forward).`
                : allowance < ANNUAL_ALLOWANCE_GROSS
                  ? `Tapered annual allowance applies (high income).`
                  : 'Standard allowance for the year (unused amounts can be carried forward 3 years).'}
            </span>
          </span>
          <span className="value">£{allowance.toLocaleString('en-GB')}</span>
        </div>
      </div>

      <p className="disclaimer">
        ⚠️ These settings drive estimates only. Check your residence status (Statutory Residence Test)
        and speak to an accountant for edge cases (split year, non-residence, foreign income).
      </p>
    </>
  )
}
