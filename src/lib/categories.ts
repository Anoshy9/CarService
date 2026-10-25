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
  | 'improvements' // capital: NOT deductible, added to the CGT base cost
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
  /** True when it is capital expenditure (improvement): not deductible, kept for CGT base cost. */
  capital: boolean
  description: string
}

export const CATEGORIES: Category[] = [
  {
    id: 'rent',
    label: 'Loyer perçu',
    deductible: false,
    income: true,
    taxCredit: false,
    capital: false,
    description: 'Revenus locatifs bruts perçus sur l’année fiscale.',
  },
  {
    id: 'council_tax',
    label: 'Council tax',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Taxe d’habitation locale payée par le propriétaire.',
  },
  {
    id: 'water_rates',
    label: 'Eau / assainissement',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Factures d’eau et de tout-à-l’égout.',
  },
  {
    id: 'ground_rent',
    label: 'Ground rent',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Loyer foncier (leasehold).',
  },
  {
    id: 'service_charges',
    label: 'Service charges',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Charges de copropriété (leasehold).',
  },
  {
    id: 'letting_fees',
    label: 'Frais d’agence',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Frais de gestion locative et de mise en location.',
  },
  {
    id: 'insurance',
    label: 'Assurance',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Assurance propriétaire / locative.',
  },
  {
    id: 'repairs_maintenance',
    label: 'Réparations / entretien',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Réparations et entretien « wholly and exclusively » pour la location. Les réparations initiales au moment de l’achat ne sont PAS déductibles.',
  },
  {
    id: 'replacement_furniture',
    label: 'Remplacement mobilier (RDIR)',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Replacement Domestic Items Relief : remplacement « like-for-like » d’objets mobiliers (meubles, électroménager, literie) — pas les installations encastrées (chaudière, salle de bains). Livraison/installation incluses, moins les produits de cession de l’ancien bien.',
  },
  {
    id: 'improvements',
    label: 'Améliorations (capital)',
    deductible: false,
    income: false,
    taxCredit: false,
    capital: true,
    description: 'Travaux d’amélioration (ex : extension, rénovation complète, nouvelle chaudière en remplacement d’un système vétuste). NON déductible du revenu locatif — à conserver pour le calcul du CGT (base cost) lors d’une vente.',
  },
  {
    id: 'legal_accounting',
    label: 'Juridique / comptabilité',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Honoraires d’avocat, comptable, tenue de livres.',
  },
  {
    id: 'advertising',
    label: 'Publicité',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Annonces pour trouver un locataire.',
  },
  {
    id: 'travel',
    label: 'Déplacements',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Frais de déplacement liés à la gestion du bien.',
  },
  {
    id: 'utilities',
    label: 'Énergie (gaz/élec)',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Factures payées par le propriétaire.',
  },
  {
    id: 'mortgage_interest',
    label: 'Intérêts d’emprunt (Section 24)',
    deductible: false,
    income: false,
    taxCredit: true,
    capital: false,
    description: 'Crédit d’impôt à taux de base (20 %) sur les intérêts — jamais déduit du bénéfice (case 44 du SA105).',
  },
  {
    id: 'other',
    label: 'Autre dépense',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
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
