import { useEffect, useState } from 'react'
import { CameraCapture } from '../components/CameraCapture'
import { ReceiptForm } from '../components/ReceiptForm'
import { deleteReceipt, listReceipts, type ReceiptRecord } from '../db/database'
import { getCategory } from '../lib/categories'

type Stage = 'idle' | 'camera' | 'form'

export function ReceiptsView() {
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [stage, setStage] = useState<Stage>('idle')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [selected, setSelected] = useState<ReceiptRecord | null>(null)

  const refresh = () => listReceipts().then(setReceipts)

  useEffect(() => {
    refresh()
  }, [])

  const handleCapture = (file: File) => {
    setPendingFile(file)
    setStage('form')
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce reçu ?')) return
    await deleteReceipt(id)
    if (selected?.id === id) setSelected(null)
    refresh()
  }

  const total = receipts.reduce((sum, r) => sum + r.amount, 0)

  if (stage === 'camera') {
    return (
      <CameraCapture
        onCapture={handleCapture}
        onCancel={() => setStage('idle')}
      />
    )
  }

  if (stage === 'form' && pendingFile) {
    return (
      <ReceiptForm
        file={pendingFile}
        onSaved={() => {
          setStage('idle')
          setPendingFile(null)
          refresh()
        }}
        onCancel={() => {
          setStage('idle')
          setPendingFile(null)
        }}
      />
    )
  }

  return (
    <>
      <div className="card">
        <h2>📸 Reçus</h2>
        <div className="row">
          <span className="label">Total des reçus enregistrés</span>
          <span className="value">£{total.toFixed(2)}</span>
        </div>
        <div className="row">
          <span className="label">Nombre de reçus</span>
          <span className="value">{receipts.length}</span>
        </div>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => setStage('camera')}>
          📷 Photographier un reçu
        </button>
      </div>

      <div className="card">
        <h2>Historique</h2>
        {receipts.length === 0 && (
          <p className="empty-state">Aucun reçu pour le moment. Photographie ton premier reçu !</p>
        )}
        {receipts.map((r) => (
          <div
            className="receipt-item"
            key={r.id}
            onClick={() => setSelected(r)}
            style={{ cursor: 'pointer' }}
          >
            <img className="receipt-thumb" src={r.thumbnail} alt="" />
            <div className="receipt-info">
              <div className="t">{r.merchant}</div>
              <div className="d">
                {new Date(r.date).toLocaleDateString('fr-FR')} · {getCategory(r.category).label}
              </div>
              <span className="badge">
                {r.source === 'rental' ? '🏠 Location' : r.source === 'sipp' ? '💷 SIPP' : '📦 Autre'}
              </span>
            </div>
            <span className="receipt-amount">£{r.amount.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
          onClick={() => setSelected(null)}
        >
          <div className="card" style={{ maxWidth: 420, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h2>{selected.merchant}</h2>
            <img
              src={URL.createObjectURL(selected.photo)}
              alt="Reçu"
              style={{ width: '100%', borderRadius: 12, marginBottom: 12 }}
            />
            <div className="row">
              <span className="label">Montant</span>
              <span className="value">£{selected.amount.toFixed(2)}</span>
            </div>
            <div className="row">
              <span className="label">Date</span>
              <span className="value">{new Date(selected.date).toLocaleDateString('fr-FR')}</span>
            </div>
            <div className="row">
              <span className="label">Catégorie</span>
              <span className="value">{getCategory(selected.category).label}</span>
            </div>
            {selected.note && (
              <div className="row">
                <span className="label">Note</span>
                <span className="value">{selected.note}</span>
              </div>
            )}
            <div className="camera-actions" style={{ marginTop: 14 }}>
              <button className="btn danger" onClick={() => handleDelete(selected.id)}>
                🗑 Supprimer
              </button>
              <button className="btn secondary" onClick={() => setSelected(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
