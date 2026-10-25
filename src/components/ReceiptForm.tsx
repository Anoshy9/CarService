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
        if (!cancelled) setOcrError('Lecture automatique échouée — remplis les champs à la main.')
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
      alert('Merci de saisir un montant valide.')
      return
    }
    setSaving(true)
    try {
      const thumbnail = await makeThumbnail(file)
      const record: ReceiptRecord = {
        id: newId(),
        photo: file,
        thumbnail,
        merchant: merchant.trim() || 'Reçu sans nom',
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
      alert('Erreur lors de l’enregistrement du reçu.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <h2>Nouveau reçu</h2>
      {preview && <img className="photo-preview" src={preview} alt="Aperçu du reçu" />}
      {ocrRunning && <p className="ocr-status">🔍 Lecture automatique du reçu en cours…</p>}
      {ocrError && <p className="ocr-status">{ocrError}</p>}

      <label className="field">
        Commerçant
        <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Ex : British Gas" />
      </label>

      <label className="field">
        Montant (£)
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
        Catégorie
        <select value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
          {CATEGORIES.filter((c) => c.id !== 'rent').map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Usage
        <select value={source} onChange={(e) => setSource(e.target.value as Source)}>
          <option value="rental">🏠 Location (déclaration foncière)</option>
          <option value="sipp">💷 SIPP (retraite)</option>
          <option value="other">📦 Autre</option>
        </select>
      </label>

      <label className="field">
        Note (optionnel)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex : facture janvier" />
      </label>

      <div className="camera-actions">
        <button className="btn" onClick={handleSave} disabled={saving || ocrRunning}>
          {saving ? 'Enregistrement…' : '💾 Enregistrer le reçu'}
        </button>
        <button className="btn secondary" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}
