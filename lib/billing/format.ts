/** "₹199" from paise (prices are stored in the smallest unit). */
export function formatPrice(paise: number, currency = 'INR', locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(paise / 100)
}

/** ISO time when the monthly allowance resets: the 1st of the next month, India time. */
export function nextPeriodStartIso(periodStart: string): string {
  const [year, month] = periodStart.split('-').map(Number)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+05:30`).toISOString()
}
