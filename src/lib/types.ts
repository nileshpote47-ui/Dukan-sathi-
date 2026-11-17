/** All money values are integer paise (1 rupee = 100 paise). */
export type Paise = number

export type PaymentMode = 'cash' | 'upi' | 'credit'

export interface Product {
  id: string
  name: string
  /** e.g. "pcs", "kg", "packet" */
  unit: string
  price: Paise
  cost: Paise
  stock: number
  lowStockAt: number
  createdAt: number
}

export interface Customer {
  id: string
  name: string
  phone: string
  createdAt: number
}

/** A bill line keeps a snapshot of the product so history survives edits and deletes. */
export interface BillItem {
  productId: string
  name: string
  unit: string
  qty: number
  price: Paise
  cost: Paise
}

export interface Bill {
  id: string
  number: number
  items: BillItem[]
  subtotal: Paise
  discount: Paise
  total: Paise
  paymentMode: PaymentMode
  customerId: string | null
  createdAt: number
}

/** Money received from a customer against their udhaar balance. */
export interface Payment {
  id: string
  customerId: string
  amount: Paise
  note: string
  createdAt: number
}

export interface ShopData {
  version: 1
  shopName: string
  products: Product[]
  customers: Customer[]
  bills: Bill[]
  payments: Payment[]
}

export const emptyShopData = (): ShopData => ({
  version: 1,
  shopName: 'My Dukan',
  products: [],
  customers: [],
  bills: [],
  payments: [],
})
