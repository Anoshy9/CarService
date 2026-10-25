import type { TaxYear } from './taxYear'
import { formatTaxYear } from './taxYear'
import type { ReceiptRecord, RentalRecord, SippRecord } from '../db/database'
import { getCategory } from './categories'
import { summariseSipp, type TaxBand } from './sipp'
import { summariseRental, type RentalEntry } from './rental'

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escapeCsv).join(',')).join('\n')
}

export function rentalCsv(entries: RentalRecord[], _taxYear: TaxYear): string {
  const rows: string[][] = [
    ['Catégorie', 'Libellé', 'Montant (£)', 'Date', 'Note'],
    ...entries.map((e) => [
      e.category,
      getCategory(e.category).label,
      e.amount.toFixed(2),
      e.date,
      e.note ?? '',
    ]),
  ]
  const summary = summariseRental(entries as RentalEntry[])
  rows.push([], ['Résumé', '', '', '', ''])
  rows.push(['Revenus locatifs', '', summary.income.toFixed(2), '', ''])
  rows.push(['Frais déductibles', '', summary.deductibleExpenses.toFixed(2), '', ''])
  rows.push(['Crédit d’impôt intérêts (20 %)', '', summary.financeCostCredit.toFixed(2), '', ''])
  rows.push(['Bénéfice imposable', '', summary.taxableProfit.toFixed(2), '', ''])
  return toCsv(rows)
}

export function sippCsv(contributions: SippRecord[], band: TaxBand, _taxYear: TaxYear): string {
  const rows: string[][] = [
    ['Date', 'Montant net versé (£)', 'Relief de base 20 % (£)', 'Contribution brute (£)', 'Fournisseur', 'Note'],
    ...contributions.map((c) => {
      const gross = Math.round((c.netAmount / 0.8) * 100) / 100
      const relief = Math.round(c.netAmount * 0.25 * 100) / 100
      return [
        c.date,
        c.netAmount.toFixed(2),
        relief.toFixed(2),
        gross.toFixed(2),
        c.provider ?? '',
        c.note ?? '',
      ]
    }),
  ]
  const summary = summariseSipp(contributions, band)
  rows.push([], ['Résumé', '', '', '', '', ''])
  rows.push(['Total net versé', summary.netPaid.toFixed(2), '', '', '', ''])
  rows.push(['Total brut (net + relief de base)', '', '', summary.grossContributions.toFixed(2), '', ''])
  rows.push([
    'Relief complémentaire à réclamer (Self Assessment)',
    '',
    '',
    (summary.higherRateRelief + summary.additionalRateRelief).toFixed(2),
    '',
    '',
  ])
  rows.push(['Plafond annuel restant', '', '', summary.remainingAnnualAllowance.toFixed(2), '', ''])
  return toCsv(rows)
}

export function receiptsCsv(receipts: ReceiptRecord[]): string {
  const rows: string[][] = [
    ['Date', 'Commerçant', 'Montant (£)', 'Catégorie', 'Source', 'Note'],
    ...receipts.map((r) => [
      r.date,
      r.merchant,
      r.amount.toFixed(2),
      `${r.category} (${getCategory(r.category).label})`,
      r.source,
      r.note ?? '',
    ]),
  ]
  return toCsv(rows)
}

/** Map French accented characters to WinAnsi octal escapes for the base-14 fonts. */
const ACCENTS: Record<string, string> = {
  é: '\\351', è: '\\350', ê: '\\352', ë: '\\353',
  à: '\\340', â: '\\342', ç: '\\347',
  ù: '\\371', û: '\\373', ü: '\\374',
  î: '\\356', ï: '\\357', ô: '\\364', ö: '\\366',
  É: '\\311', È: '\\310', À: '\\300', Ç: '\\307',
  'œ': '\\234', '’': '\\222', '«': '\\253', '»': '\\273',
  '€': '\\200', '£': '\\243', '°': '\\260', '—': '\\227',
}

function escapePdfText(s: string): string {
  return s
    .replace(/[\\()]/g, (c) => `\\${c}`)
    .replace(/[\u00C0-\u017F]/g, (c) => ACCENTS[c] ?? '?')
    .replace(/[^\x20-\x7e]/g, '?')
}

/** Minimal valid single-page PDF (WinAnsi, Helvetica, no compression). */
export function simplePdf(title: string, lines: string[]): Blob {
  const content = [
    'BT',
    '/F1 14 Tf',
    '50 790 Td',
    `(${escapePdfText(title)}) Tj`,
    '/F1 10 Tf',
    '0 -24 Td',
    '14 TL',
    ...lines.map((l) => `(${escapePdfText(l)}) Tj T*`),
    'ET',
  ].join('\n')

  const objects: string[] = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
  objects[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  objects[5] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let i = 1; i <= 5; i++) {
    offsets[i] = pdf.length
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefStart = pdf.length
  pdf += 'xref\n0 6\n0000000000 65535 f \n'
  for (let i = 1; i <= 5; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return new Blob([pdf], { type: 'application/pdf' })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function exportRentalPdf(entries: RentalRecord[], taxYear: TaxYear): void {
  const summary = summariseRental(entries as RentalEntry[])
  const lines = entries.map(
    (e) =>
      `${e.date}  ${getCategory(e.category).label.padEnd(24)} ${e.amount
        .toFixed(2)
        .padStart(10)} GBP`,
  )
  lines.push('----------------------------------------')
  lines.push(`Revenus locatifs        ${summary.income.toFixed(2).padStart(10)} GBP`)
  lines.push(`Frais deductibles       ${summary.deductibleExpenses.toFixed(2).padStart(10)} GBP`)
  lines.push(`Credit impot interets   ${summary.financeCostCredit.toFixed(2).padStart(10)} GBP`)
  lines.push(`Benefice imposable      ${summary.taxableProfit.toFixed(2).padStart(10)} GBP`)
  downloadBlob(
    simplePdf(`TaxTrack UK - Location - annee fiscale ${formatTaxYear(taxYear)}`, lines),
    `taxtrack-location-${formatTaxYear(taxYear).replace('/', '-')}.pdf`,
  )
}

export function exportSippPdf(contributions: SippRecord[], band: TaxBand, taxYear: TaxYear): void {
  const summary = summariseSipp(contributions, band)
  const lines = contributions.map((c) => {
    const gross = Math.round((c.netAmount / 0.8) * 100) / 100
    return `${c.date}  net ${c.netAmount.toFixed(2).padStart(10)} GBP   brut ${gross
      .toFixed(2)
      .padStart(10)} GBP   ${(c.provider ?? '').slice(0, 20)}`
  })
  lines.push('----------------------------------------')
  lines.push(`Total net verse           ${summary.netPaid.toFixed(2).padStart(10)} GBP`)
  lines.push(`Relief de base (20 %)    ${summary.basicRateRelief.toFixed(2).padStart(10)} GBP`)
  lines.push(`Total brut               ${summary.grossContributions.toFixed(2).padStart(10)} GBP`)
  lines.push(
    `Relief complementaire    ${(summary.higherRateRelief + summary.additionalRateRelief)
      .toFixed(2)
      .padStart(10)} GBP`,
  )
  lines.push(`Plafond annuel restant   ${summary.remainingAnnualAllowance.toFixed(2).padStart(10)} GBP`)
  downloadBlob(
    simplePdf(`TaxTrack UK - SIPP - annee fiscale ${formatTaxYear(taxYear)}`, lines),
    `taxtrack-sipp-${formatTaxYear(taxYear).replace('/', '-')}.pdf`,
  )
}
