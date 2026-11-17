import { useRef, useState } from 'react'
import { formatRupees } from '../lib/money'
import { dayStats, lowStockProducts, parseBackup, totalOutstanding } from '../lib/shop'
import type { ShopData } from '../lib/types'
import type { ShopRun } from '../lib/useShop'

interface Props {
  data: ShopData
  run: ShopRun
  onNavigate: (tab: 'bill' | 'stock' | 'udhaar') => void
}

export function Dashboard({ data, run, onNavigate }: Props) {
  const stats = dayStats(data)
  const low = lowStockProducts(data)
  const outstanding = totalOutstanding(data)
  const recent = [...data.bills].reverse().slice(0, 5)
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dukan-sathi-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importBackup = async (file: File) => {
    try {
      const restored = parseBackup(await file.text())
      if (!confirm('Replace all current data with this backup?')) return
      run(() => restored)
      setMessage('Backup restored.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not read the file.')
    }
  }

  const renameShop = () => {
    const name = prompt('Shop name', data.shopName)?.trim()
    if (name) run((d) => ({ ...d, shopName: name }))
  }

  return (
    <div className="stack">
      <section className="stats">
        <div className="stat">
          <span className="stat-label">Today's sales</span>
          <span className="stat-value">{formatRupees(stats.sales)}</span>
          <span className="stat-sub">{stats.billCount} bills</span>
        </div>
        <div className="stat">
          <span className="stat-label">Today's profit</span>
          <span className="stat-value">{formatRupees(stats.profit)}</span>
          <span className="stat-sub">after discounts</span>
        </div>
        <div className="stat">
          <span className="stat-label">Udhaar pending</span>
          <span className="stat-value warn">{formatRupees(outstanding)}</span>
          <span className="stat-sub">{formatRupees(stats.udhaarCollected)} collected today</span>
        </div>
        <div className="stat">
          <span className="stat-label">Payment split</span>
          <span className="stat-split">
            Cash {formatRupees(stats.byMode.cash)}
            <br />
            UPI {formatRupees(stats.byMode.upi)}
            <br />
            Credit {formatRupees(stats.byMode.credit)}
          </span>
        </div>
      </section>

      <button className="primary big" onClick={() => onNavigate('bill')}>
        + New bill
      </button>

      <section className="card">
        <h2>Low stock</h2>
        {low.length === 0 ? (
          <p className="muted">All products are above their low-stock level.</p>
        ) : (
          <ul className="list">
            {low.map((p) => (
              <li key={p.id} className="row">
                <span>{p.name}</span>
                <span className="badge warn">
                  {p.stock} {p.unit} left
                </span>
              </li>
            ))}
          </ul>
        )}
        {data.products.length === 0 && (
          <button className="link" onClick={() => onNavigate('stock')}>
            Add your first product →
          </button>
        )}
      </section>

      <section className="card">
        <h2>Recent bills</h2>
        {recent.length === 0 ? (
          <p className="muted">No bills yet.</p>
        ) : (
          <ul className="list">
            {recent.map((b) => (
              <li key={b.id} className="row">
                <span>
                  #{b.number} · {new Date(b.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span>
                  <span className={`badge mode-${b.paymentMode}`}>{b.paymentMode.toUpperCase()}</span>{' '}
                  {formatRupees(b.total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Settings & backup</h2>
        <p className="muted">
          Your data is stored only on this device. Export a backup regularly.
        </p>
        <div className="actions">
          <button onClick={renameShop}>Rename shop</button>
          <button onClick={exportBackup}>Export backup</button>
          <button onClick={() => fileRef.current?.click()}>Import backup</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importBackup(f)
              e.target.value = ''
            }}
          />
        </div>
        {message && <p className="note">{message}</p>}
      </section>
    </div>
  )
}
