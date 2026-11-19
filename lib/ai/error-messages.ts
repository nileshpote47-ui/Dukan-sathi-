import type { MessageKey } from '@/lib/i18n'
import type { AIErrorCode } from '@/services/ai/types'

/** Friendly message for each AI error code (text and pictures share them). */
export const AI_ERROR_MESSAGES: Record<AIErrorCode, MessageKey> = {
  not_configured: 'ai.error.notConfigured',
  invalid_request: 'ai.error.invalid',
  rate_limited: 'ai.error.rateLimited',
  blocked: 'ai.error.blocked',
  timeout: 'ai.error.failed',
  unavailable: 'ai.error.failed',
  invalid_response: 'ai.error.failed',
  empty_response: 'ai.error.failed',
  unknown: 'ai.error.failed',
}
