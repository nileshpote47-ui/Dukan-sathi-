import type { ContentType } from '@/lib/config/content'
import type { MessageKey } from '@/lib/i18n'
import { en } from '@/lib/i18n/messages/en'
import type { OutputField } from '@/services/ai/types'

/** Label key for an AI output field: type-specific when defined (e.g. WhatsApp "Opening"), else generic. */
export function aiFieldLabelKey(type: ContentType, field: OutputField): MessageKey {
  const specific = `aiField.${type}.${field}`
  return (specific in en ? specific : `aiField.${field}`) as MessageKey
}
