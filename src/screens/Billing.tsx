import { useMemo, useState } from 'react'
import { formatRupees, parseRupees } from '../lib/money'
import { addCustomer, billTotals, createBill, lineTotal } from '../lib/shop'
import type { Bill, PaymentMode, ShopData } from '../lib/types'
import type { ShopRun } from '../lib/useShop'

interface Props {
  data: ShopData
  run: ShopRun
}

interface Line {
  productId: string
  qty: string
}

const MODES: { id: PaymentMode; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'credit', label: 'Udhaar' },
]

export function Billing({ data, run }: Props) {
  const [query, setQuery] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [discount, setDiscount] = useState('')
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [customerId, setCustomerId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lastBill, setLastBill] = useState<Bill | null>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return data.products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8)
  }, [data.products, query])

  const productById = (id: string) => data.products.find((p) => p.id === id)

  // Live preview; lines whose product was deleted are skipped here and rejected on save.
  const previewItems = lines.flatMap((l) => {
    const p = productById(l.productId)
    const qty = Number(l.qty)
    return p && qty > 0 ? [{ ...p, productId: p.id, qty }] : []
  })
  const discountPaise = parseRupees(discount) ?? 0
  const totals = billTotals(previewItems, discountPaise)

  const addLine = (productId: string) => {
    setLastBill(null)
    setError(null)
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId)
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l))
      }
      return [...prev, { productId, qty: '1' }]
    })
    setQuery('')
  }

  const setQty = (productId: string, qty: string) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty } : l)))

  const removeLine = (productId: string) => setLines((prev) => prev.filter((l) => l.productId !== productId))

  const quickAddCustomer = () => {
    const name = prompt('Customer name')?.trim()
    if (!name) return
    const phone = prompt('Phone number (optional)') ?? ''
    let createdId = ''
    const err = run((d) => {
      const next = addCustomer(d, { name, phone })
      createdId = next.customers[next.customers.length - 1].id
      return next
    })
    if (err) setError(err)
    else setCustomerId(createdId)
  }

  const save = () => {
    if (discount && parseRupees(discount) === null) {
      setError('Discount must be a number.')
      return
    }
    let saved: Bill | null = null
    const err = run((d) => {
      const result = createBill(d, {
        lines: lines.map((l) => ({ productId: l.productId, qty: Number(l.qty) })),
        discount: discountPaise,
        paymentMode: mode,
        customerId: customerId || null,
      })
      saved = result.bill
      return result.data
    })
    if (err) {
      setError(err)
      return
    }
    setLastBill(saved)
    setLines([])
    setDiscount('')
    setMode('cash')
    setCustomerId('')
    setError(null)
  }

  const history = [...data.bills].reverse().slice(0, 30)

  return (
    <div className="stack">
      {lastBill && <Receipt bill={lastBill} data={data} onClose={() => setLastBill(null)} />}

      <section className="card">
        <h2>New bill</h2>
        {data.products.length === 0 ? (
          <p className="muted">Add products in the Stock tab first.</p>
        ) : (
          <div className="search">
            <input
              type="search"
              placeholder="Search product to add…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches[0]) addLine(matches[0].id)
              }}
              aria-label="Search product"
            />
            {matches.length > 0 && (
              <ul className="dropdown">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button disabled={p.stock <= 0} onClick={() => addLine(p.id)}>
                      <span>{p.name}</span>
                      <span className="muted">
                        {formatRupees(p.price)}/{p.unit} · {p.stock > 0 ? `${p.stock} left` : 'out of stock'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim() && matches.length === 0 && <p className="muted">No product matches “{query}”.</p>}
          </div>
        )}

        {lines.length > 0 && (
          <table className="cart">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th className="num">Amount</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const p = productById(l.productId)
                const qty = Number(l.qty)
                const over = p && qty > p.stock
                return (
                  <tr key={l.productId}>
                    <td>
                      {p?.name ?? 'Deleted product'}
                      <div className="muted small">{p && `${formatRupees(p.price)}/${p.unit}`}</div>
                    </td>
                    <td>
                      <input
                        className={over ? 'qty invalid' : 'qty'}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={l.qty}
                        onChange={(e) => setQty(l.productId, e.target.value)}
                        aria-label={`Quantity of ${p?.name ?? 'item'}`}
                      />
                      {over && <div className="small error-text">max {p.stock}</div>}
                    </td>
                    <td className="num">{p && qty > 0 ? formatRupees(lineTotal({ price: p.price, qty })) : '—'}</td>
                    <td>
                      <button className="icon" onClick={() => removeLine(l.productId)} aria-label="Remove item">
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {lines.length > 0 && (
          <>
            <div className="form-grid">
              <label>
                Discount (₹)
                <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </label>
              <label>
                Customer {mode === 'credit' ? '(required)' : '(optional)'}
                <span className="inline">
                  <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    <option value="">— Walk-in —</option>
                    {data.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` (${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={quickAddCustomer} aria-label="Add customer">
                    +
                  </button>
                </span>
              </label>
            </div>

            <div className="segmented" role="radiogroup" aria-label="Payment mode">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={mode === m.id}
                  className={mode === m.id ? 'active' : ''}
                  onClick={() => setMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="totals">
              <div className="row">
                <span>Subtotal</span>
                <span>{formatRupees(totals.subtotal)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="row">
                  <span>Discount</span>
                  <span>− {formatRupees(totals.discount)}</span>
                </div>
              )}
              <div className="row grand">
                <span>Total</span>
                <span>{formatRupees(totals.total)}</span>
              </div>
            </div>

            {error && <p className="error-text">{error}</p>}
            <button className="primary big" onClick={save}>
              Save bill · {formatRupees(totals.total)}
            </button>
          </>
        )}
        {lines.length === 0 && error && <p className="error-text">{error}</p>}
      </section>

      <section className="card">
        <h2>Bill history</h2>
        {history.length === 0 ? (
          <p className="muted">No bills yet.</p>
        ) : (
          <ul className="list">
            {history.map((b) => (
              <li key={b.id}>
                <details>
                  <summary className="row">
                    <span>
                      #{b.number} · {new Date(b.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    <span>
                      <span className={`badge mode-${b.paymentMode}`}>{b.paymentMode.toUpperCase()}</span>{' '}
                      {formatRupees(b.total)}
                    </span>
                  </summary>
                  <BillLines bill={b} data={data} />
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function BillLines({ bill, data }: { bill: Bill; data: ShopData }) {
  const customer = data.customers.find((c) => c.id === bill.customerId)
  return (
    <div className="bill-lines">
      {customer && <p className="muted small">Customer: {customer.name}</p>}
      {bill.items.map((i) => (
        <div key={i.productId} className="row small">
          <span>
            {i.name} × {i.qty} {i.unit}
          </span>
          <span>{formatRupees(lineTotal(i))}</span>
        </div>
      ))}
      {bill.discount > 0 && (
        <div className="row small">
          <span>Discount</span>
          <span>− {formatRupees(bill.discount)}</span>
        </div>
      )}
    </div>
  )
}

function Receipt({ bill, data, onClose }: { bill: Bill; data: ShopData; onClose: () => void }) {
  const customer = data.customers.find((c) => c.id === bill.customerId)
  const text = [
    `${data.shopName} — Bill #${bill.number}`,
    ...bill.items.map((i) => `${i.name} × ${i.qty} ${i.unit} = ${formatRupees(lineTotal(i))}`),
    ...(bill.discount > 0 ? [`Discount: −${formatRupees(bill.discount)}`] : []),
    `Total: ${formatRupees(bill.total)} (${bill.paymentMode === 'credit' ? 'Udhaar' : bill.paymentMode.toUpperCase()})`,
    'Thank you!',
  ].join('\n')
  const digits = customer?.phone.replace(/\D/g, '') ?? ''
  const waNumber = digits.length === 10 ? `91${digits}` : digits
  const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`

  return (
    <section className="card success">
      <h2>Bill #{bill.number} saved</h2>
      <p>
        {formatRupees(bill.total)} · {bill.paymentMode === 'credit' ? 'Udhaar' : bill.paymentMode.toUpperCase()}
        {customer && ` · ${customer.name}`}
      </p>
      <div className="actions">
        <a className="button" href={waLink} target="_blank" rel="noreferrer">
          Share on WhatsApp
        </a>
        <button onClick={onClose}>Done</button>
      </div>
    </section>
  )
}
