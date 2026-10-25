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
    label: 'Rent received',
    deductible: false,
    income: true,
    taxCredit: false,
    capital: false,
    description: 'Gross rental income received during the tax year.',
  },
  {
    id: 'council_tax',
    label: 'Council tax',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Local council tax paid by the landlord.',
  },
  {
    id: 'water_rates',
    label: 'Water / sewerage',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Water and drainage bills.',
  },
  {
    id: 'ground_rent',
    label: 'Ground rent',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Ground rent (leasehold properties).',
  },
  {
    id: 'service_charges',
    label: 'Service charges',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Leasehold service charges / estate charges.',
  },
  {
    id: 'letting_fees',
    label: 'Letting agent fees',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Letting and property management fees.',
  },
  {
    id: 'insurance',
    label: 'Insurance',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Landlord / buildings insurance.',
  },
  {
    id: 'repairs_maintenance',
    label: 'Repairs & maintenance',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Repairs and upkeep incurred wholly and exclusively for the letting. Initial repairs when first buying are NOT deductible.',
  },
  {
    id: 'replacement_furniture',
    label: 'Replacement of domestic items (RDIR)',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Replacement Domestic Items Relief: like-for-like replacement of movable items (furniture, appliances, linen) — not fixtures such as boilers or bathrooms. Includes delivery/installation, less any proceeds from disposing of the old item.',
  },
  {
    id: 'improvements',
    label: 'Improvements (capital)',
    deductible: false,
    income: false,
    taxCredit: false,
    capital: true,
    description: 'Capital improvements (e.g. extension, full refurbishment, new boiler replacing a worn-out system). NOT deductible from rental income — keep for the CGT base cost on a future sale.',
  },
  {
    id: 'legal_accounting',
    label: 'Legal / accounting',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Solicitor, accountant and bookkeeping fees.',
  },
  {
    id: 'advertising',
    label: 'Advertising',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Advertising to find a tenant.',
  },
  {
    id: 'travel',
    label: 'Travel',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Travel costs for managing the property (HMRC mileage rates: 45p/mile first 10,000 miles).',
  },
  {
    id: 'utilities',
    label: 'Utilities (gas/electric)',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Utility bills paid by the landlord.',
  },
  {
    id: 'mortgage_interest',
    label: 'Mortgage interest (Section 24)',
    deductible: false,
    income: false,
    taxCredit: true,
    capital: false,
    description: 'Basic-rate tax credit (20%; 22% from 2027/28) on interest — never deducted from profit (SA105 box 44).',
  },
  {
    id: 'other',
    label: 'Other expense',
    deductible: true,
    income: false,
    taxCredit: false,
    capital: false,
    description: 'Any other expense deductible for the rental business.',
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
