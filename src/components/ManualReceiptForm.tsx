import { useState } from 'react'
import { CATEGORIES, type CategoryId } from '../lib/categories'
import { toISODate } from '../lib/taxYear'
import { addReceipt, newId, type ReceiptRecord } from '../db/database'

interface ManualReceiptFormProps {
  onSaved: () => void
  onCancel: () => void
}

type Source = 'rental' | 'sipp' | 'other'

export function ManualReceiptForm({ onSaved, onCancel }: ManualReceiptFormProps) {
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(toISODate(new Date()))
  const [category, setCategory] = useState<CategoryId>('other')
  const [source, setSource] = useState<Source>('rental')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const parsedAmount = Number.parseFloat(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      alert('Please enter a valid amount.')
      return
    }
    if (!merchant.trim()) {
      alert('Please enter a merchant or description.')
      return
    }
    setSaving(true)
    try {
      const record: ReceiptRecord = {
        id: newId(),
        photo: new Blob([], { type: 'application/octet-stream' }),
        thumbnail: '',
        merchant: merchant.trim(),
        amount: Math.round(parsedAmount * 100) / 100,
        date,
        category,
        note: note.trim() || undefined,
        source,
        createdAt: new Date().toISOString(),
        manual: true,
      }
      await addReceipt(record)
      onSaved()
    } catch (e) {
      console.error(e)
      alert('Error while saving the entry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <h2>✏️ Manual entry</h2>
      <p style={{ fontSize: 13, color: '#64748b', marginTop: -4 }}>
        No photo needed — just type the details.
      </p>

      <label className="field">
        Merchant / description
        <input
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="E.g. British Gas, letting agent fee…"
          autoFocus
        />
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
        <button className="btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : '💾 Save entry'}
        </button>
        <button className="btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
