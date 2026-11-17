import { useState } from 'react'
import { formatRupees, parseRupees, toRupeeInput } from '../lib/money'
import { addProduct, deleteProduct, isLowStock, updateProduct, type ProductInput } from '../lib/shop'
import type { Product, ShopData } from '../lib/types'
import type { ShopRun } from '../lib/useShop'

interface Props {
  data: ShopData
  run: ShopRun
}

interface FormState {
  name: string
  unit: string
  price: string
  cost: string
  stock: string
  lowStockAt: string
}

const blankForm: FormState = { name: '', unit: 'pcs', price: '', cost: '', stock: '', lowStockAt: '5' }

const toForm = (p: Product): FormState => ({
  name: p.name,
  unit: p.unit,
  price: toRupeeInput(p.price),
  cost: toRupeeInput(p.cost),
  stock: String(p.stock),
  lowStockAt: String(p.lowStockAt),
})

const parseForm = (f: FormState): ProductInput | string => {
  const price = parseRupees(f.price)
  const cost = f.cost.trim() === '' ? 0 : parseRupees(f.cost)
  const stock = Number(f.stock || 0)
  const lowStockAt = Number(f.lowStockAt || 0)
  if (price === null) return 'Enter a valid selling price.'
  if (cost === null) return 'Enter a valid cost price.'
  if (!Number.isFinite(stock)) return 'Enter a valid stock quantity.'
  if (!Number.isFinite(lowStockAt)) return 'Enter a valid low-stock level.'
  return { name: f.name, unit: f.unit, price, cost, stock, lowStockAt }
}

export function Stock({ data, run }: Props) {
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const products = data.products
    .filter((p) => p.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))

  const openNew = () => {
    setEditingId(null)
    setForm(blankForm)
    setError(null)
  }

  const openEdit = (p: Product) => {
    setEditingId(p.id)
    setForm(toForm(p))
    setError(null)
  }

  const close = () => {
    setForm(null)
    setEditingId(null)
    setError(null)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    const input = parseForm(form)
    if (typeof input === 'string') {
      setError(input)
      return
    }
    const err = run((d) => (editingId ? updateProduct(d, editingId, input) : addProduct(d, input)))
    if (err) setError(err)
    else close()
  }

  const remove = (p: Product) => {
    if (confirm(`Delete ${p.name}? Past bills keep their record.`)) {
      run((d) => deleteProduct(d, p.id))
      close()
    }
  }

  const field = (key: keyof FormState) => ({
    value: form?.[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f)),
  })

  const margin = (() => {
    if (!form) return null
    const price = parseRupees(form.price)
    const cost = parseRupees(form.cost)
    if (!price || cost === null) return null
    return Math.round(((price - cost) / price) * 100)
  })()

  return (
    <div className="stack">
      {form ? (
        <form className="card" onSubmit={submit}>
          <h2>{editingId ? 'Edit product' : 'Add product'}</h2>
          <div className="form-grid">
            <label className="span-2">
              Name
              <input {...field('name')} autoFocus required placeholder="e.g. Tata Salt 1kg" />
            </label>
            <label>
              Selling price (₹)
              <input {...field('price')} inputMode="decimal" required placeholder="0" />
            </label>
            <label>
              Cost price (₹)
              <input {...field('cost')} inputMode="decimal" placeholder="0" />
            </label>
            <label>
              Stock qty
              <input {...field('stock')} type="number" inputMode="decimal" min="0" step="any" placeholder="0" />
            </label>
            <label>
              Unit
              <input {...field('unit')} list="units" placeholder="pcs" />
              <datalist id="units">
                <option value="pcs" />
                <option value="kg" />
                <option value="g" />
                <option value="litre" />
                <option value="packet" />
                <option value="box" />
                <option value="dozen" />
              </datalist>
            </label>
            <label>
              Alert when stock ≤
              <input {...field('lowStockAt')} type="number" inputMode="decimal" min="0" step="any" />
            </label>
            {margin !== null && <p className="muted small span-2">Margin: {margin}%</p>}
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="actions">
            <button type="submit" className="primary">
              {editingId ? 'Save changes' : 'Add product'}
            </button>
            <button type="button" onClick={close}>
              Cancel
            </button>
            {editingId && (
              <button type="button" className="danger" onClick={() => remove(data.products.find((p) => p.id === editingId)!)}>
                Delete
              </button>
            )}
          </div>
        </form>
      ) : (
        <button className="primary big" onClick={openNew}>
          + Add product
        </button>
      )}

      <section className="card">
        <h2>Stock ({data.products.length})</h2>
        <input type="search" placeholder="Search products…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
        {products.length === 0 ? (
          <p className="muted">{data.products.length === 0 ? 'No products yet.' : 'No products match.'}</p>
        ) : (
          <ul className="list">
            {products.map((p) => (
              <li key={p.id}>
                <button className="row item-button" onClick={() => openEdit(p)}>
                  <span>
                    {p.name}
                    <span className="muted small block">
                      {formatRupees(p.price)}/{p.unit} · cost {formatRupees(p.cost)}
                    </span>
                  </span>
                  <span className={isLowStock(p) ? 'badge warn' : 'badge'}>
                    {p.stock} {p.unit}
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
