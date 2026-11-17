import type { Paise } from './types'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export const formatRupees = (paise: Paise): string => inr.format(paise / 100)

/** Parse a rupee amount typed by the user ("12.5", "₹1,200") into paise. Returns null if invalid. */
export const parseRupees = (input: string): Paise | null => {
  const cleaned = input.replace(/[₹,\s]/g, '')
  if (cleaned === '' || !/^\d*\.?\d*$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

/** Paise as a plain editable rupee string, e.g. 1250 -> "12.5". */
export const toRupeeInput = (paise: Paise): string => String(paise / 100)
