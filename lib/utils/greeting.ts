import { siteConfig } from '@/lib/config/site'
import type { MessageKey } from '@/lib/i18n'

/**
 * Greeting based on the time in India, not the server's clock
 * (servers usually run on UTC).
 */
export function greetingKey(now: Date = new Date(), timeZone: string = siteConfig.timeZone): MessageKey {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now),
  )
  if (hour >= 4 && hour < 12) return 'greeting.morning'
  if (hour >= 12 && hour < 17) return 'greeting.afternoon'
  return 'greeting.evening'
}
