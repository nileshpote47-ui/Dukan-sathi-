import { useState } from 'react'
import { useShop } from './lib/useShop'
import { Dashboard } from './screens/Dashboard'
import { Billing } from './screens/Billing'
import { Stock } from './screens/Stock'
import { Customers } from './screens/Customers'

type Tab = 'home' | 'bill' | 'stock' | 'udhaar'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'bill', label: 'Bill', icon: '🧾' },
  { id: 'stock', label: 'Stock', icon: '📦' },
  { id: 'udhaar', label: 'Udhaar', icon: '📒' },
]

export default function App() {
  const shop = useShop()
  const [tab, setTab] = useState<Tab>('home')

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Dukan Sathi</span>
        <span className="shop-name">{shop.data.shopName}</span>
      </header>

      {shop.saveError && <div className="banner error">{shop.saveError}</div>}

      <main className="content">
        {tab === 'home' && <Dashboard {...shop} onNavigate={setTab} />}
        {tab === 'bill' && <Billing {...shop} />}
        {tab === 'stock' && <Stock {...shop} />}
        {tab === 'udhaar' && <Customers {...shop} />}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
