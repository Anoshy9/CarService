import { useRef, useState } from 'react'

interface CameraCaptureProps {
  onCapture: (file: File) => void
  onCancel: () => void
}

/** Full-screen camera capture: live preview with photo button, or file picker fallback. */
export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const startCamera = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch {
      setError('Camera unavailable — pick a photo from your gallery instead.')
    }
  }

  const takePhoto = () => {
    const video = videoRef.current
    if (!video || !streamRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    stopStream()
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCapture(new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' }))
        }
      },
      'image/jpeg',
      0.92,
    )
  }

  const handleClose = () => {
    stopStream()
    onCancel()
  }

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onCapture(file)
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ width: '100%', display: 'block', background: '#000', minHeight: 280 }}
      />
      {error && <p className="ocr-status">{error}</p>}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="camera-actions">
          <button className="btn" onClick={streamRef.current ? takePhoto : startCamera}>
            {streamRef.current ? '📸 Take the photo' : '📷 Open camera'}
          </button>
          <button className="btn secondary" onClick={() => fileInputRef.current?.click()}>
            🖼 Gallery
          </button>
        </div>
        <button className="btn secondary" onClick={handleClose}>
          Cancel
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFilePicked}
        />
      </div>
    </div>
  )
}
