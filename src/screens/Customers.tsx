import { useState } from 'react'
import { formatRupees, parseRupees } from '../lib/money'
import { addCustomer, customerBalance, customerLedger, recordPayment } from '../lib/shop'
import type { Customer, ShopData } from '../lib/types'
import type { ShopRun } from '../lib/useShop'

interface Props {
  data: ShopData
  run: ShopRun
}

export function Customers({ data, run }: Props) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const selected = data.customers.find((c) => c.id === selectedId)
  if (selected) return <CustomerDetail customer={selected} data={data} run={run} onBack={() => setSelectedId(null)} />

  const q = query.trim().toLowerCase()
  const customers = data.customers
    .filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
    .map((c) => ({ ...c, balance: customerBalance(data, c.id) }))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const err = run((d) => addCustomer(d, { name, phone }))
    if (err) {
      setError(err)
      return
    }
    setName('')
    setPhone('')
    setAdding(false)
    setError(null)
  }

  return (
    <div className="stack">
      {adding ? (
        <form className="card" onSubmit={submit}>
          <h2>Add customer</h2>
          <div className="form-grid">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
            </label>
            <label>
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="10-digit mobile" />
            </label>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="actions">
            <button type="submit" className="primary">
              Add customer
            </button>
            <button type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="primary big" onClick={() => setAdding(true)}>
          + Add customer
        </button>
      )}

      <section className="card">
        <h2>Udhaar khata</h2>
        <input type="search" placeholder="Search by name or phone…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search customers" />
        {customers.length === 0 ? (
          <p className="muted">{data.customers.length === 0 ? 'No customers yet.' : 'No customers match.'}</p>
        ) : (
          <ul className="list">
            {customers.map((c) => (
              <li key={c.id}>
                <button className="row item-button" onClick={() => setSelectedId(c.id)}>
                  <span>
                    {c.name}
                    {c.phone && <span className="muted small block">{c.phone}</span>}
                  </span>
                  <span className={c.balance > 0 ? 'badge warn' : 'badge ok'}>
                    {c.balance > 0 ? `Owes ${formatRupees(c.balance)}` : c.balance < 0 ? `Advance ${formatRupees(-c.balance)}` : 'Settled'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function CustomerDetail({ customer, data, run, onBack }: { customer: Customer; data: ShopData; run: ShopRun; onBack: () => void }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const balance = customerBalance(data, customer.id)
  const ledger = [...customerLedger(data, customer.id)].reverse()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const paise = parseRupees(amount)
    if (paise === null) {
      setError('Enter a valid amount.')
      return
    }
    const err = run((d) => recordPayment(d, { customerId: customer.id, amount: paise, note }))
    if (err) {
      setError(err)
      return
    }
    setAmount('')
    setNote('')
    setError(null)
  }

  const digits = customer.phone.replace(/\D/g, '')
  const waNumber = digits.length === 10 ? `91${digits}` : digits
  const reminder = `Namaste ${customer.name}, your pending balance at ${data.shopName} is ${formatRupees(balance)}. Thank you!`

  return (
    <div className="stack">
      <button className="link" onClick={onBack}>
        ← All customers
      </button>
      <section className="card">
        <h2>{customer.name}</h2>
        {customer.phone && <p className="muted">{customer.phone}</p>}
        <p className="balance">
          {balance > 0 ? 'Owes' : balance < 0 ? 'Advance' : 'Balance'}{' '}
          <strong className={balance > 0 ? 'warn' : ''}>{formatRupees(Math.abs(balance))}</strong>
        </p>
        {balance > 0 && digits && (
          <a className="button" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(reminder)}`} target="_blank" rel="noreferrer">
            Send WhatsApp reminder
          </a>
        )}
      </section>

      <form className="card" onSubmit={submit}>
        <h2>Payment received</h2>
        <div className="form-grid">
          <label>
            Amount (₹)
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required placeholder="0" />
          </label>
          <label>
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary">
            Record payment
          </button>
          {balance > 0 && (
            <button type="button" onClick={() => setAmount(String(balance / 100))}>
              Full {formatRupees(balance)}
            </button>
          )}
        </div>
      </form>

      <section className="card">
        <h2>Ledger</h2>
        {ledger.length === 0 ? (
          <p className="muted">No udhaar or payments yet.</p>
        ) : (
          <ul className="list">
            {ledger.map((e) => (
              <li key={e.id} className="row">
                <span>
                  {e.label}
                  <span className="muted small block">{new Date(e.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </span>
                <span className="num">
                  <span className={e.kind === 'credit' ? 'warn' : 'ok'}>
                    {e.kind === 'credit' ? '+' : '−'} {formatRupees(e.amount)}
                  </span>
                  <span className="muted small block">bal {formatRupees(e.balance)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
