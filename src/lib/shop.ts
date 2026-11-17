import type { Bill, BillItem, Customer, Paise, Payment, PaymentMode, Product, ShopData } from './types'

/** Thrown for invalid user actions; the message is safe to show in the UI. */
export class ShopError extends Error {}

const newId = (): string => crypto.randomUUID()

// ---------- Products ----------

export interface ProductInput {
  name: string
  unit: string
  price: Paise
  cost: Paise
  stock: number
  lowStockAt: number
}

const validateProduct = (data: ShopData, input: ProductInput, ignoreId?: string): ProductInput => {
  const name = input.name.trim()
  if (!name) throw new ShopError('Product name is required.')
  if (data.products.some((p) => p.id !== ignoreId && p.name.toLowerCase() === name.toLowerCase())) {
    throw new ShopError(`A product named "${name}" already exists.`)
  }
  if (!(input.price >= 0)) throw new ShopError('Selling price must be zero or more.')
  if (!(input.cost >= 0)) throw new ShopError('Cost price must be zero or more.')
  if (!(input.stock >= 0)) throw new ShopError('Stock must be zero or more.')
  if (!(input.lowStockAt >= 0)) throw new ShopError('Low-stock level must be zero or more.')
  return { ...input, name, unit: input.unit.trim() || 'pcs' }
}

export const addProduct = (data: ShopData, input: ProductInput, now = Date.now()): ShopData => {
  const clean = validateProduct(data, input)
  const product: Product = { id: newId(), createdAt: now, ...clean }
  return { ...data, products: [...data.products, product] }
}

export const updateProduct = (data: ShopData, id: string, input: ProductInput): ShopData => {
  if (!data.products.some((p) => p.id === id)) throw new ShopError('Product not found.')
  const clean = validateProduct(data, input, id)
  return { ...data, products: data.products.map((p) => (p.id === id ? { ...p, ...clean } : p)) }
}

export const deleteProduct = (data: ShopData, id: string): ShopData => ({
  ...data,
  products: data.products.filter((p) => p.id !== id),
})

export const isLowStock = (p: Product): boolean => p.stock <= p.lowStockAt

export const lowStockProducts = (data: ShopData): Product[] =>
  data.products.filter(isLowStock).sort((a, b) => a.stock - b.stock)

// ---------- Customers & udhaar ----------

export const addCustomer = (
  data: ShopData,
  input: { name: string; phone: string },
  now = Date.now(),
): ShopData => {
  const name = input.name.trim()
  const phone = input.phone.replace(/[^\d+]/g, '')
  if (!name) throw new ShopError('Customer name is required.')
  if (phone && data.customers.some((c) => c.phone === phone)) {
    throw new ShopError('A customer with this phone number already exists.')
  }
  const customer: Customer = { id: newId(), name, phone, createdAt: now }
  return { ...data, customers: [...data.customers, customer] }
}

export const recordPayment = (
  data: ShopData,
  input: { customerId: string; amount: Paise; note?: string },
  now = Date.now(),
): ShopData => {
  if (!data.customers.some((c) => c.id === input.customerId)) throw new ShopError('Customer not found.')
  if (!(input.amount > 0)) throw new ShopError('Payment amount must be more than zero.')
  const payment: Payment = {
    id: newId(),
    customerId: input.customerId,
    amount: Math.round(input.amount),
    note: input.note?.trim() ?? '',
    createdAt: now,
  }
  return { ...data, payments: [...data.payments, payment] }
}

export interface LedgerEntry {
  id: string
  kind: 'credit' | 'payment'
  amount: Paise
  label: string
  createdAt: number
  /** Balance after this entry. */
  balance: Paise
}

/** Credit bills and payments for a customer, oldest first, with running balance. */
export const customerLedger = (data: ShopData, customerId: string): LedgerEntry[] => {
  const raw = [
    ...data.bills
      .filter((b) => b.customerId === customerId && b.paymentMode === 'credit')
      .map((b) => ({ id: b.id, kind: 'credit' as const, amount: b.total, label: `Bill #${b.number}`, createdAt: b.createdAt })),
    ...data.payments
      .filter((p) => p.customerId === customerId)
      .map((p) => ({ id: p.id, kind: 'payment' as const, amount: p.amount, label: p.note || 'Payment received', createdAt: p.createdAt })),
  ].sort((a, b) => a.createdAt - b.createdAt)

  let balance = 0
  return raw.map((e) => {
    balance += e.kind === 'credit' ? e.amount : -e.amount
    return { ...e, balance }
  })
}

/** Amount the customer owes the shop (negative means the shop owes them / advance). */
export const customerBalance = (data: ShopData, customerId: string): Paise => {
  const credit = data.bills
    .filter((b) => b.customerId === customerId && b.paymentMode === 'credit')
    .reduce((s, b) => s + b.total, 0)
  const paid = data.payments.filter((p) => p.customerId === customerId).reduce((s, p) => s + p.amount, 0)
  return credit - paid
}

export const totalOutstanding = (data: ShopData): Paise =>
  data.customers.reduce((s, c) => s + Math.max(0, customerBalance(data, c.id)), 0)

// ---------- Billing ----------

export interface CartLine {
  productId: string
  qty: number
}

export interface BillDraft {
  lines: CartLine[]
  discount: Paise
  paymentMode: PaymentMode
  customerId: string | null
}

export const lineTotal = (item: { price: Paise; qty: number }): Paise => Math.round(item.price * item.qty)

export const billTotals = (items: BillItem[], discount: Paise) => {
  const subtotal = items.reduce((s, i) => s + lineTotal(i), 0)
  const cost = items.reduce((s, i) => s + Math.round(i.cost * i.qty), 0)
  const appliedDiscount = Math.min(Math.max(0, Math.round(discount)), subtotal)
  const total = subtotal - appliedDiscount
  return { subtotal, discount: appliedDiscount, total, cost, profit: total - cost }
}

/** Resolve cart lines into priced bill items, merging duplicate products. */
export const draftItems = (data: ShopData, lines: CartLine[]): BillItem[] => {
  const merged = new Map<string, number>()
  for (const l of lines) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.qty)
  return [...merged].map(([productId, qty]) => {
    const p = data.products.find((x) => x.id === productId)
    if (!p) throw new ShopError('A product in the bill no longer exists.')
    return { productId, name: p.name, unit: p.unit, qty, price: p.price, cost: p.cost }
  })
}

/** Validate and save a bill, reducing stock. Returns the new data and the saved bill. */
export const createBill = (
  data: ShopData,
  draft: BillDraft,
  now = Date.now(),
): { data: ShopData; bill: Bill } => {
  if (draft.lines.length === 0) throw new ShopError('Add at least one item to the bill.')
  for (const l of draft.lines) {
    if (!(l.qty > 0)) throw new ShopError('Every item needs a quantity above zero.')
  }
  const items = draftItems(data, draft.lines)
  for (const item of items) {
    const p = data.products.find((x) => x.id === item.productId)!
    if (item.qty > p.stock) {
      throw new ShopError(`Only ${p.stock} ${p.unit} of ${p.name} in stock.`)
    }
  }
  if (draft.paymentMode === 'credit') {
    if (!draft.customerId) throw new ShopError('Choose a customer for an udhaar (credit) bill.')
  }
  if (draft.customerId && !data.customers.some((c) => c.id === draft.customerId)) {
    throw new ShopError('Customer not found.')
  }

  const totals = billTotals(items, draft.discount)
  const bill: Bill = {
    id: newId(),
    number: data.bills.reduce((m, b) => Math.max(m, b.number), 0) + 1,
    items,
    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
    paymentMode: draft.paymentMode,
    customerId: draft.customerId,
    createdAt: now,
  }

  const sold = new Map(items.map((i) => [i.productId, i.qty]))
  const products = data.products.map((p) =>
    sold.has(p.id) ? { ...p, stock: roundQty(p.stock - sold.get(p.id)!) } : p,
  )
  return { data: { ...data, products, bills: [...data.bills, bill] }, bill }
}

/** Avoid floating point noise like 2.9999999 for loose items sold by weight. */
const roundQty = (n: number): number => Math.round(n * 1000) / 1000

// ---------- Dashboard ----------

export const isSameLocalDay = (a: number, b: number): boolean => {
  const x = new Date(a)
  const y = new Date(b)
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
}

export const dayStats = (data: ShopData, day = Date.now()) => {
  const bills = data.bills.filter((b) => isSameLocalDay(b.createdAt, day))
  const byMode: Record<PaymentMode, Paise> = { cash: 0, upi: 0, credit: 0 }
  let sales = 0
  let profit = 0
  for (const b of bills) {
    sales += b.total
    byMode[b.paymentMode] += b.total
    profit += billTotals(b.items, b.discount).profit
  }
  const collected = data.payments
    .filter((p) => isSameLocalDay(p.createdAt, day))
    .reduce((s, p) => s + p.amount, 0)
  return { billCount: bills.length, sales, profit, byMode, udhaarCollected: collected }
}

// ---------- Backup ----------

export const parseBackup = (json: string): ShopData => {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new ShopError('This file is not valid JSON.')
  }
  const d = raw as Partial<ShopData>
  if (
    !d ||
    typeof d !== 'object' ||
    d.version !== 1 ||
    !Array.isArray(d.products) ||
    !Array.isArray(d.customers) ||
    !Array.isArray(d.bills) ||
    !Array.isArray(d.payments)
  ) {
    throw new ShopError('This file is not a Dukan Sathi backup.')
  }
  return {
    version: 1,
    shopName: typeof d.shopName === 'string' ? d.shopName : 'My Dukan',
    products: d.products,
    customers: d.customers,
    bills: d.bills,
    payments: d.payments,
  }
}
