/**
 * Deductible property-business expense categories for UK landlords
 * (HMRC "Property income" rules), kept generic so the user can map their
 * own receipts. Amounts are always in GBP.
 */

export type CategoryId =
  | 'rent' // rent received (income, not an expense)
  | 'council_tax'
  | 'water_rates'
  | 'ground_rent'
  | 'service_charges'
  | 'letting_fees'
  | 'insurance'
  | 'repairs_maintenance'
  | 'replacement_furniture' // replacement domestic items relief
  | 'legal_accounting'
  | 'advertising'
  | 'travel'
  | 'utilities'
  | 'mortgage_interest' // tax credit (restricted to basic rate), not a full deduction
  | 'other'

export interface Category {
  id: CategoryId
  label: string
  /** True when the amount reduces taxable profit directly. */
  deductible: boolean
  /** True when it is income (rent received). */
  income: boolean
  /** True when it is only a tax credit at basic rate (mortgage interest). */
  taxCredit: boolean
  description: string
}

export const CATEGORIES: Category[] = [
  {
    id: 'rent',
    label: 'Loyer perçu',
    deductible: false,
    income: true,
    taxCredit: false,
    description: 'Revenus locatifs bruts perçus sur l’année fiscale.',
  },
  {
    id: 'council_tax',
    label: 'Council tax',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Taxe d’habitation locale payée par le propriétaire.',
  },
  {
    id: 'water_rates',
    label: 'Eau / assainissement',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Factures d’eau et de tout-à-l’égout.',
  },
  {
    id: 'ground_rent',
    label: 'Ground rent',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Loyer foncier (leasehold).',
  },
  {
    id: 'service_charges',
    label: 'Service charges',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Charges de copropriété (leasehold).',
  },
  {
    id: 'letting_fees',
    label: 'Frais d’agence',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Frais de gestion locative et de mise en location.',
  },
  {
    id: 'insurance',
    label: 'Assurance',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Assurance propriétaire / locative.',
  },
  {
    id: 'repairs_maintenance',
    label: 'Réparations / entretien',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Entretien et réparations (pas les améliorations).',
  },
  {
    id: 'replacement_furniture',
    label: 'Remplacement mobilier',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Remplacement d’équipements domestiques (relief).',
  },
  {
    id: 'legal_accounting',
    label: 'Juridique / comptabilité',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Honoraires d’avocat, comptable, tenue de livres.',
  },
  {
    id: 'advertising',
    label: 'Publicité',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Annonces pour trouver un locataire.',
  },
  {
    id: 'travel',
    label: 'Déplacements',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Frais de déplacement liés à la gestion du bien.',
  },
  {
    id: 'utilities',
    label: 'Énergie (gaz/élec)',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Factures payées par le propriétaire.',
  },
  {
    id: 'mortgage_interest',
    label: 'Intérêts d’emprunt',
    deductible: false,
    income: false,
    taxCredit: true,
    description: 'Crédit d’impôt à taux de base (20 %), plafonné, pas une déduction de revenu.',
  },
  {
    id: 'other',
    label: 'Autre dépense',
    deductible: true,
    income: false,
    taxCredit: false,
    description: 'Toute autre dépense déductible liée à la location.',
  },
]

export function getCategory(id: CategoryId): Category {
  const found = CATEGORIES.find((c) => c.id === id)
  if (!found) throw new Error(`Unknown category: ${id}`)
  return found
}

export function sumByCategory(
  entries: { category: CategoryId; amount: number }[],
): Record<CategoryId, number> {
  const totals = {} as Record<CategoryId, number>
  for (const c of CATEGORIES) totals[c.id] = 0
  for (const e of entries) {
    totals[e.category] = (totals[e.category] ?? 0) + e.amount
  }
  return totals
}
