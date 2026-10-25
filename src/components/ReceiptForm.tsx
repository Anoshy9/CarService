import { useEffect, useState } from 'react'
import Tesseract from 'tesseract.js'
import { CATEGORIES, type CategoryId } from '../lib/categories'
import { parseReceiptText } from '../lib/receiptParser'
import { toISODate } from '../lib/taxYear'
import { makeThumbnail } from '../lib/images'
import { addReceipt, newId, type ReceiptRecord } from '../db/database'

interface ReceiptFormProps {
  file: File
  onSaved: () => void
  onCancel: () => void
}

type Source = 'rental' | 'sipp' | 'other'

export function ReceiptForm({ file, onSaved, onCancel }: ReceiptFormProps) {
  const [preview, setPreview] = useState<string>('')
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(toISODate(new Date()))
  const [category, setCategory] = useState<CategoryId>('other')
  const [source, setSource] = useState<Source>('rental')
  const [note, setNote] = useState('')
  const [ocrRunning, setOcrRunning] = useState(true)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const url = URL.createObjectURL(file)
    setPreview(url)

    const runOcr = async () => {
      try {
        const result = await Tesseract.recognize(file, 'eng+fra', {
          logger: () => {},
        })
        if (cancelled) return
        const parsed = parseReceiptText(result.data.text)
        if (parsed.merchant) setMerchant(parsed.merchant)
        if (parsed.amount !== null) setAmount(parsed.amount.toFixed(2))
        if (parsed.date) setDate(parsed.date)
      } catch {
        if (!cancelled) setOcrError('Automatic reading failed — please fill in the fields manually.')
      } finally {
        if (!cancelled) setOcrRunning(false)
      }
    }

    runOcr()
    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [file])

  const handleSave = async () => {
    const parsedAmount = Number.parseFloat(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      alert('Please enter a valid amount.')
      return
    }
    setSaving(true)
    try {
      const thumbnail = await makeThumbnail(file)
      const record: ReceiptRecord = {
        id: newId(),
        photo: file,
        thumbnail,
        merchant: merchant.trim() || 'Unnamed receipt',
        amount: Math.round(parsedAmount * 100) / 100,
        date,
        category,
        note: note.trim() || undefined,
        source,
        createdAt: new Date().toISOString(),
      }
      await addReceipt(record)
      onSaved()
    } catch (e) {
      console.error(e)
      alert('Error while saving the receipt.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <h2>New receipt</h2>
      {preview && <img className="photo-preview" src={preview} alt="Receipt preview" />}
      {ocrRunning && <p className="ocr-status">🔍 Reading the receipt automatically…</p>}
      {ocrError && <p className="ocr-status">{ocrError}</p>}

      <label className="field">
        Merchant
        <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="E.g. British Gas" />
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
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
          {CATEGORIES.filter((c) => c.id !== 'rent').map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Purpose
        <select value={source} onChange={(e) => setSource(e.target.value as Source)}>
          <option value="rental">🏠 Rental (property income return)</option>
          <option value="sipp">💷 SIPP (pension)</option>
          <option value="other">📦 Other</option>
        </select>
      </label>

      <label className="field">
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="E.g. January bill" />
      </label>

      <div className="camera-actions">
        <button className="btn" onClick={handleSave} disabled={saving || ocrRunning}>
          {saving ? 'Saving…' : '💾 Save receipt'}
        </button>
        <button className="btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
