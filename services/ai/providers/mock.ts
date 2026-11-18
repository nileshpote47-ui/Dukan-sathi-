import type { ContentType } from '@/lib/config/content'
import type { LanguageCode } from '@/lib/config/languages'
import { normalizeAIOutput, OUTPUT_SPEC } from '../output'
import { AIError, type AIContentRequest, type AIContentResponse, type AIProvider } from '../types'

/**
 * Deterministic provider for automated tests (AI_PROVIDER=mock). No network, no cost.
 * Output is built only from the request (so it never invents prices or offers) and is
 * clearly marked as test output.
 *
 * Failure simulation: put a marker in the owner's instructions, or set AI_MOCK_SCENARIO:
 *   [mock:fail] [mock:timeout] [mock:rate-limit] [mock:malformed] [mock:empty] [mock:blocked]
 */

const PHRASES: Record<LanguageCode, { hello: string; visit: string; another: string; at: string; offer: string }> = {
  en: { hello: 'Hello from', visit: 'Visit us today', another: 'New version', at: 'at', offer: 'Offer' },
  mr: { hello: 'नमस्कार, आपले', visit: 'आजच भेट द्या', another: 'नवीन आवृत्ती', at: 'येथे', offer: 'ऑफर' },
  hi: { hello: 'नमस्ते, आपका', visit: 'आज ही आइए', another: 'नया संस्करण', at: 'पर', offer: 'ऑफ़र' },
}

const SCENARIOS = ['fail', 'timeout', 'rate-limit', 'malformed', 'empty', 'blocked'] as const
type Scenario = (typeof SCENARIOS)[number]

function scenarioFor(request: AIContentRequest): Scenario | null {
  const marker = request.generation.instructions?.match(/\[mock:([a-z-]+)\]/)?.[1] ?? process.env.AI_MOCK_SCENARIO
  return SCENARIOS.find((s) => s === marker) ?? null
}

export class MockProvider implements AIProvider {
  readonly id = 'mock'
  readonly model = 'mock-1'

  constructor(private readonly delayMs = Number(process.env.AI_MOCK_DELAY_MS ?? 400)) {}

  async generateContent(request: AIContentRequest): Promise<AIContentResponse> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs))

    switch (scenarioFor(request)) {
      case 'fail':
        throw new AIError('unavailable', 'Mock provider simulated an outage')
      case 'timeout':
        throw new AIError('timeout', 'Mock provider simulated a timeout')
      case 'rate-limit':
        throw new AIError('rate_limited', 'Mock provider simulated a rate limit')
      case 'blocked':
        throw new AIError('blocked', 'Mock provider simulated a blocked response')
      case 'malformed':
        return normalizeAIOutput(request.request.type, '{"unexpected": true')
      case 'empty':
        return normalizeAIOutput(request.request.type, '   ')
    }

    return normalizeAIOutput(request.request.type, JSON.stringify(this.raw(request)))
  }

  /** Raw output with the provider-facing keys for the content type. */
  private raw({ context, request, generation }: AIContentRequest): Record<string, unknown> {
    const p = PHRASES[generation.language]
    const variation = generation.previous ? `${p.another}: ` : ''
    const short = /short|छोट|लहान/i.test(generation.instructions ?? '')
    const subject = request.product ?? request.title
    const tone = generation.tone ?? context.preferences.tone ?? 'friendly'
    const offer = request.offer ? ` ${p.offer}: ${request.offer}.` : ''
    const price = request.price ? ` ${request.price}.` : ''
    const body = short
      ? `${variation}${subject}.${offer}`
      : `${variation}${p.hello} ${context.business.name}: ${subject} ${p.at} ${context.business.location ?? context.business.name}.${offer}${price} [mock ${tone}]`
    const cta = request.callToAction ?? request.template?.defaultCta ?? context.preferences.callToAction ?? p.visit

    const values: Record<string, unknown> = {}
    for (const spec of OUTPUT_SPEC[request.type as ContentType]) {
      if (spec.field === 'hashtags') values[spec.key] = ['#' + context.business.name.replace(/\s+/g, ''), '#LocalShop']
      else if (spec.field === 'call_to_action') values[spec.key] = cta
      else if (spec.field === 'headline' || spec.field === 'reel_hook') values[spec.key] = `${variation}${request.title}`
      else values[spec.key] = body
    }
    return values
  }
}
