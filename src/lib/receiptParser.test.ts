import { describe, expect, it } from 'vitest'
import { parseReceiptText } from './receiptParser'

const SAMPLE_RECEIPT = `
TESCO STORES 3521
123 HIGH STREET, LONDON E1 6PQ
VAT REG NO: GB 123 4567 89
Tel: 020 7946 0123

MILK 2L            £1.85
BREAD               £1.20
BANANAS             £0.95

SUBTOTAL            £3.99
VAT                 £0.01
TOTAL               £4.00
CASH                £5.00
CHANGE              £1.00

01/02/2025  14:32
THANK YOU
`

describe('parseReceiptText', () => {
  it('extracts the merchant name from the first meaningful line', () => {
    const parsed = parseReceiptText(SAMPLE_RECEIPT)
    expect(parsed.merchant).toBe('TESCO STORES 3521')
  })

  it('extracts the TOTAL amount, not subtotal or change', () => {
    const parsed = parseReceiptText(SAMPLE_RECEIPT)
    expect(parsed.amount).toBe(4.0)
  })

  it('parses UK date format dd/mm/yyyy into ISO', () => {
    const parsed = parseReceiptText(SAMPLE_RECEIPT)
    expect(parsed.date).toBe('2025-02-01')
  })

  it('handles amounts with thousands separators and £ symbol', () => {
    const parsed = parseReceiptText('BRITISH GAS\nTOTAL DUE £1,234.56\n15/03/2025')
    expect(parsed.amount).toBe(1234.56)
  })

  it('handles ISO dates', () => {
    const parsed = parseReceiptText('SOME SHOP\nTotal: £9.99\n2025-04-06')
    expect(parsed.date).toBe('2025-04-06')
  })

  it('returns nulls when nothing is found', () => {
    const parsed = parseReceiptText('')
    expect(parsed.merchant).toBeNull()
    expect(parsed.amount).toBeNull()
    expect(parsed.date).toBeNull()
  })

  it('ignores VAT/address lines when finding the merchant', () => {
    const parsed = parseReceiptText('VAT NO 123\n42 Oxford Road\nMY CORNER SHOP\nTOTAL £2.50\n')
    expect(parsed.merchant).toBe('MY CORNER SHOP')
  })
})
