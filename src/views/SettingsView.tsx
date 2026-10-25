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

  if (!settings) return <div className="card"><p className="empty-state">Chargement…</p></div>

  const profile = settings.sippProfile
  const allowance = effectiveAnnualAllowance(profile)
  const reliefCap = reliefCapGross(profile)

  return (
    <>
      <div className="card">
        <h2>⚙️ Profil fiscal</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Ces informations calibrent le calcul de l’impôt estimé et les plafonds SIPP pour l’année
          fiscale {formatTaxYear(taxYear)}.
        </p>
        <div className="row">
          <span className="label">
            Résidence fiscale
            <span className="sub">Tu as indiqué être résident au Royaume-Uni (pas de régime NRLS).</span>
          </span>
          <span className="badge">UK resident</span>
        </div>
        <label className="field">
          Revenus « relevant UK earnings » (£/an)
          <input
            type="number"
            min="0"
            step="100"
            value={profile.relevantUkEarnings || ''}
            placeholder="0 si tu n'as que des revenus locatifs"
            onChange={(e) =>
              updateProfile({ relevantUkEarnings: Number.parseFloat(e.target.value) || 0 })
            }
          />
          <span className="sub">
            Salaire ou bénéfices d’auto-entreprise UK uniquement. <b>Le revenu locatif ne compte pas.</b>
          </span>
        </label>
        <div className="row" onClick={() => updateProfile({ mpaaTriggered: !profile.mpaaTriggered })} style={{ cursor: 'pointer' }}>
          <span className="label">
            Accès flexible à une pension (MPAA)
            <span className="sub">
              Coche si tu as déjà pris un revenu flexible (drawdown) ou un versement UFPLS. Le lump sum
              25 % seul ne déclenche pas le MPAA.
            </span>
          </span>
          <input type="checkbox" checked={profile.mpaaTriggered} readOnly />
        </div>
        <label className="field">
          Threshold income (£/an)
          <input
            type="number"
            min="0"
            step="1000"
            value={profile.thresholdIncome || ''}
            placeholder="Revenu imposable total moins tes contributions retraite"
            onChange={(e) =>
              updateProfile({ thresholdIncome: Number.parseFloat(e.target.value) || 0 })
            }
          />
          <span className="sub">Taper si &gt; £{TAPER_THRESHOLD_INCOME.toLocaleString('en-GB')}.</span>
        </label>
        <label className="field">
          Adjusted income (£/an)
          <input
            type="number"
            min="0"
            step="1000"
            value={profile.adjustedIncome || ''}
            placeholder="Revenu imposable total plus toutes les contributions retraite"
            onChange={(e) =>
              updateProfile({ adjustedIncome: Number.parseFloat(e.target.value) || 0 })
            }
          />
          <span className="sub">Taper si &gt; £{TAPER_ADJUSTED_INCOME.toLocaleString('en-GB')} (les deux seuils doivent être dépassés).</span>
        </label>
        <label className="field">
          Autre revenu imposable (£/an)
          <input
            type="number"
            min="0"
            step="100"
            value={settings.otherTaxableIncome || ''}
            placeholder="Salaire, dividendes, etc. hors location"
            onChange={(e) =>
              update({ otherTaxableIncome: Number.parseFloat(e.target.value) || 0 })
            }
          />
          <span className="sub">Utilisé uniquement pour l’estimation de l’impôt total.</span>
        </label>
        <div className="row" onClick={() => update({ usePropertyAllowance: !settings.usePropertyAllowance })} style={{ cursor: 'pointer' }}>
          <span className="label">
            Abattement forfaitaire « property allowance » (£1,000)
            <span className="sub">
              Remplace toutes les dépenses déductibles (y compris le crédit sur les intérêts). À
              n’utiliser que si tes frais réels sont inférieurs à £1,000.
            </span>
          </span>
          <input type="checkbox" checked={settings.usePropertyAllowance} readOnly />
        </div>
      </div>

      <div className="card">
        <h2>📋 Ce que ça change pour toi</h2>
        <div className="row">
          <span className="label">
            Plafond de relief SIPP (règle des relevant UK earnings)
            <span className="sub">
              {profile.relevantUkEarnings > 0
                ? '100 % de tes revenus d’emploi/auto-entreprise UK.'
                : `Sans revenu d’emploi UK, le maximum avec relief est £${NON_EARNER_LIMIT_GROSS.toLocaleString('en-GB')} brut (£2,880 net). Le loyer ne compte pas.`}
            </span>
          </span>
          <span className="value">£{reliefCap.toLocaleString('en-GB')} brut</span>
        </div>
        <div className="row">
          <span className="label">
            Plafond annuel SIPP (annual allowance)
            <span className="sub">
              {profile.mpaaTriggered
                ? `MPAA déclenché : plafond ramené à £${MPAA_GROSS.toLocaleString('en-GB')}.`
                : allowance < ANNUAL_ALLOWANCE_GROSS
                  ? `Tapered annual allowance appliqué (revenus élevés).`
                  : 'Plafond standard 2025/26 (report possible sur 3 ans).'}
            </span>
          </span>
          <span className="value">£{allowance.toLocaleString('en-GB')}</span>
        </div>
      </div>

      <p className="disclaimer">
        ⚠️ Ces réglages servent à des estimations. Vérifie ton statut de résidence (Statutory
        Residence Test) et consulte un comptable pour les cas limites (split year, non-résidence,
        revenus étrangers).
      </p>
    </>
  )
}
