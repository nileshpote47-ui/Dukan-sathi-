import { describe, expect, it } from 'vitest'
import { formatRupees, parseRupees } from './money'
import {
  ShopError,
  addCustomer,
  addProduct,
  billTotals,
  createBill,
  customerBalance,
  customerLedger,
  dayStats,
  lowStockProducts,
  parseBackup,
  recordPayment,
  totalOutstanding,
  updateProduct,
} from './shop'
import { emptyShopData, type ShopData } from './types'

const seed = (): ShopData => {
  let d = emptyShopData()
  d = addProduct(d, { name: 'Sugar', unit: 'kg', price: 4500, cost: 4000, stock: 10, lowStockAt: 2 })
  d = addProduct(d, { name: 'Parle-G', unit: 'pcs', price: 1000, cost: 800, stock: 3, lowStockAt: 5 })
  d = addCustomer(d, { name: 'Ramesh', phone: '98765 43210' })
  return d
}
const sugar = (d: ShopData) => d.products.find((p) => p.name === 'Sugar')!
const biscuit = (d: ShopData) => d.products.find((p) => p.name === 'Parle-G')!

describe('money', () => {
  it('parses rupee input to paise', () => {
    expect(parseRupees('12.5')).toBe(1250)
    expect(parseRupees('₹1,200')).toBe(120000)
    expect(parseRupees('0.1')).toBe(10)
    expect(parseRupees('abc')).toBeNull()
    expect(parseRupees('')).toBeNull()
  })
  it('formats paise as INR', () => {
    expect(formatRupees(12345600)).toBe('₹1,23,456')
  })
})

describe('products', () => {
  it('rejects empty and duplicate names', () => {
    const d = seed()
    expect(() => addProduct(d, { name: ' ', unit: '', price: 1, cost: 1, stock: 1, lowStockAt: 0 })).toThrow(ShopError)
    expect(() => addProduct(d, { name: 'sugar', unit: '', price: 1, cost: 1, stock: 1, lowStockAt: 0 })).toThrow(/already exists/)
  })
  it('updates a product without tripping its own duplicate check', () => {
    const d = seed()
    const s = sugar(d)
    const next = updateProduct(d, s.id, { ...s, price: 5000 })
    expect(sugar(next).price).toBe(5000)
  })
  it('lists low stock items', () => {
    expect(lowStockProducts(seed()).map((p) => p.name)).toEqual(['Parle-G'])
  })
})

describe('billing', () => {
  it('computes totals, caps discount and computes profit', () => {
    const items = [
      { productId: 'a', name: 'A', unit: 'kg', qty: 1.5, price: 4500, cost: 4000 },
      { productId: 'b', name: 'B', unit: 'pcs', qty: 2, price: 1000, cost: 800 },
    ]
    expect(billTotals(items, 750)).toEqual({ subtotal: 8750, discount: 750, total: 8000, cost: 7600, profit: 400 })
    expect(billTotals(items, 99999).total).toBe(0)
  })

  it('saves a cash bill, numbers it and reduces stock', () => {
    const d = seed()
    const { data, bill } = createBill(d, {
      lines: [{ productId: sugar(d).id, qty: 1.5 }, { productId: sugar(d).id, qty: 1 }],
      discount: 0,
      paymentMode: 'cash',
      customerId: null,
    })
    expect(bill.number).toBe(1)
    expect(bill.items).toHaveLength(1)
    expect(bill.total).toBe(11250)
    expect(sugar(data).stock).toBe(7.5)
    const second = createBill(data, { lines: [{ productId: sugar(d).id, qty: 1 }], discount: 0, paymentMode: 'upi', customerId: null })
    expect(second.bill.number).toBe(2)
  })

  it('refuses to sell more than stock', () => {
    const d = seed()
    expect(() =>
      createBill(d, { lines: [{ productId: biscuit(d).id, qty: 4 }], discount: 0, paymentMode: 'cash', customerId: null }),
    ).toThrow(/Only 3 pcs/)
  })

  it('requires a customer for credit bills', () => {
    const d = seed()
    expect(() =>
      createBill(d, { lines: [{ productId: biscuit(d).id, qty: 1 }], discount: 0, paymentMode: 'credit', customerId: null }),
    ).toThrow(/customer/)
  })

  it('rejects an empty bill and zero quantities', () => {
    const d = seed()
    expect(() => createBill(d, { lines: [], discount: 0, paymentMode: 'cash', customerId: null })).toThrow(ShopError)
    expect(() =>
      createBill(d, { lines: [{ productId: biscuit(d).id, qty: 0 }], discount: 0, paymentMode: 'cash', customerId: null }),
    ).toThrow(ShopError)
  })
})

describe('udhaar ledger', () => {
  it('tracks credit bills and payments with running balance', () => {
    let d = seed()
    const ramesh = d.customers[0]
    expect(ramesh.phone).toBe('9876543210')
    d = createBill(d, { lines: [{ productId: sugar(d).id, qty: 2 }], discount: 0, paymentMode: 'credit', customerId: ramesh.id }, 1000).data
    d = createBill(d, { lines: [{ productId: biscuit(d).id, qty: 1 }], discount: 0, paymentMode: 'cash', customerId: ramesh.id }, 2000).data
    d = recordPayment(d, { customerId: ramesh.id, amount: 5000, note: 'Part payment' }, 3000)

    expect(customerBalance(d, ramesh.id)).toBe(4000)
    expect(totalOutstanding(d)).toBe(4000)
    expect(customerLedger(d, ramesh.id).map((e) => [e.kind, e.balance])).toEqual([
      ['credit', 9000],
      ['payment', 4000],
    ])
  })

  it('rejects non-positive payments and duplicate phones', () => {
    const d = seed()
    expect(() => recordPayment(d, { customerId: d.customers[0].id, amount: 0 })).toThrow(ShopError)
    expect(() => addCustomer(d, { name: 'Other', phone: '9876543210' })).toThrow(/already exists/)
  })
})

describe('dashboard', () => {
  it("summarises only today's bills", () => {
    let d = seed()
    const today = new Date(2026, 10, 17, 12).getTime()
    const yesterday = new Date(2026, 10, 16, 12).getTime()
    d = createBill(d, { lines: [{ productId: sugar(d).id, qty: 1 }], discount: 0, paymentMode: 'cash', customerId: null }, yesterday).data
    d = createBill(d, { lines: [{ productId: sugar(d).id, qty: 2 }], discount: 500, paymentMode: 'upi', customerId: null }, today).data
    const s = dayStats(d, today)
    expect(s.billCount).toBe(1)
    expect(s.sales).toBe(8500)
    expect(s.byMode.upi).toBe(8500)
    expect(s.profit).toBe(500)
  })
})

describe('backup', () => {
  it('round-trips and rejects foreign files', () => {
    const d = seed()
    expect(parseBackup(JSON.stringify(d))).toEqual(d)
    expect(() => parseBackup('{"foo":1}')).toThrow(/not a Dukan Sathi backup/)
    expect(() => parseBackup('nope')).toThrow(/not valid JSON/)
  })
})
