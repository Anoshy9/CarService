import { useState } from 'react'
import { DashboardView } from './views/DashboardView'
import { ReceiptsView } from './views/ReceiptsView'
import { RentalView } from './views/RentalView'
import { SippView } from './views/SippView'
import { DeadlinesView } from './views/DeadlinesView'
import { SettingsView } from './views/SettingsView'

type Tab = 'dashboard' | 'receipts' | 'rental' | 'sipp' | 'deadlines' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Accueil', icon: '📊' },
  { id: 'receipts', label: 'Reçus', icon: '📸' },
  { id: 'rental', label: 'Location', icon: '🏠' },
  { id: 'sipp', label: 'SIPP', icon: '💷' },
  { id: 'deadlines', label: 'Échéances', icon: '📅' },
  { id: 'settings', label: 'Réglages', icon: '⚙️' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
    <>
      <header className="app-header">
        <h1>🇬🇧 TaxTrack UK</h1>
        <p>Reçus, location & SIPP pour ta déclaration fiscale</p>
        <nav className="app-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {tab === 'dashboard' && <DashboardView />}
        {tab === 'receipts' && <ReceiptsView />}
        {tab === 'rental' && <RentalView />}
        {tab === 'sipp' && <SippView />}
        {tab === 'deadlines' && <DeadlinesView />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </>
  )
}
