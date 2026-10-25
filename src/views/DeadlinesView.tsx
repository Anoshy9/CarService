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
  overdue: 'En retard',
  upcoming: 'À venir',
  done: 'Fait',
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
        <h2>📅 Échéances HMRC — {formatTaxYear(taxYear)}</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          du 6 avril {taxYear.label - 1} au 5 avril {taxYear.label}. Coche chaque échéance au fur et
          à mesure.
        </p>
        {mtd && (
          <p className="ocr-status" style={{ background: '#eff6ff', color: '#1d4ed8', marginTop: 8 }}>
            ℹ️ Making Tax Digital (MTD) s’applique à toi pour cette année (revenus bruts &gt; seuil) :
            mises à jour trimestrielles obligatoires en plus de la déclaration finale.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Calendrier</h2>
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
                {new Date(d.date + 'T12:00:00').toLocaleDateString('fr-FR', {
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
                <span className="badge warn">J-{d.daysUntil}</span>
              )}
              <span className={STATUS_CLASS[d.status]}>{STATUS_LABEL[d.status]}</span>
              <input type="checkbox" checked={d.status === 'done'} readOnly />
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>💷 Paiements sur compte (payments on account)</h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Si ta facture d’impôt dépasse £1,000 et que moins de 80 % est prélevé à la source, HMRC
          demande deux acomptes de 50 % de l’impôt de l’année précédente : le 31 janvier et le
          31 juillet suivant la fin de l’année fiscale. Ils sont déduits du solde final.
        </p>
      </div>

      <div className="card">
        <h2>⚠️ Pénalités en cas de retard</h2>
        <div className="row">
          <span className="label">Déclaration en retard</span>
          <span className="value">£100 dès le 1er jour</span>
        </div>
        <div className="row">
          <span className="label">Après 3 mois</span>
          <span className="value">£10/jour (max £900)</span>
        </div>
        <div className="row">
          <span className="label">Après 6 / 12 mois</span>
          <span className="value">5 % de l’impôt ou £300</span>
        </div>
        <div className="row">
          <span className="label">Paiement en retard</span>
          <span className="value">5 % à 30 j, 6 et 12 mois + intérêts</span>
        </div>
      </div>

      <p className="disclaimer">
        ⚠️ Calendrier indicatif pour un résident UK avec revenus locatifs uniquement. Les règles MTD
        évoluent : vérifie sur gov.uk avant chaque échéance.
      </p>
    </>
  )
}
