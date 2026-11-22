import 'server-only'
import { exampleGroupFor } from '@/lib/config/category-examples'
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from '@/lib/config/languages'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { buildAIContentRequest, buildMarketingContext } from '@/lib/marketing/context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { istDateKey } from '@/lib/utils/datetime'
import { generateMarketingContent } from '@/services/ai/service'
import { serverSecret } from '@/services/publishing/env'
import type { Json, Tables } from '@/types/database'
import { plannedSlots, weekIdeas, weekStartOf, type AutopilotIdea } from './plan'

/*
 * The weekly Autopilot generator (owner-approved exception to "AI only on an explicit tap": it runs only for
 * Premium shops whose owner turned Autopilot on). Called by the hourly scheduler with the server secret; the
 * database functions check the secret, the plan and the once-per-week marker. Each post costs one AI post from
 * the plan (reserved first, committed on success, released on failure); one AI call per post, no retries.
 * Posts are saved as DRAFT content with AI copy; nothing is published until the owner approves.
 */

const RUN_BUDGET_MS = 200_000

type DueRow = {
  business_id: string
  owner_id: string
  business: Json
  preferred_language: string | null
  owner_offers: string | null
  posts_per_week: number
  post_time: string
}

/** Title and the sentence the AI works from, in the shop's content language. */
export function ideaText(idea: AutopilotIdea, language: LanguageCode): { title: string; brief: string; type: 'POST' | 'OFFER' | 'FESTIVAL' } {
  const t = getTranslator(language)
  const type = idea.type === 'OFFER' || idea.type === 'FESTIVAL' ? idea.type : 'POST'
  if (idea.kind === 'festival') {
    const festival = t(`festival.${idea.slug}` as MessageKey)
    const brief = t(idea.type === 'FESTIVAL' ? 'ideas.festival.brief.FESTIVAL' : 'ideas.festival.brief.OFFER', { festival })
    return { title: t('ideas.festival.title', { festival }).slice(0, 120), brief, type }
  }
  const base = `ideas.${idea.group}.${idea.n}`
  return { title: t(`${base}.title` as MessageKey).slice(0, 120), brief: t(`${base}.brief` as MessageKey), type }
}

export async function runAutopilot(now = new Date()): Promise<{ businesses: number; posts: number }> {
  const secret = serverSecret()
  if (!secret) return { businesses: 0, posts: 0 }
  const started = Date.now()
  const supabase = await createClient()
  const weekStart = weekStartOf(istDateKey(now))
  const { data, error } = await supabase.rpc('autopilot_due', { p_secret: secret, p_week_start: weekStart })
  if (error) {
    log.error('[autopilot] due', { code: error.code })
    return { businesses: 0, posts: 0 }
  }

  let businesses = 0
  let total = 0
  for (const row of (data ?? []) as DueRow[]) {
    if (Date.now() - started > RUN_BUDGET_MS) break // the next hourly run continues
    const business = row.business as unknown as Tables<'businesses'>
    const slots = plannedSlots(weekStart, row.post_time, row.posts_per_week, now)
    const { data: reservations, error: beginError } = await supabase.rpc('autopilot_begin', {
      p_secret: secret,
      p_business_id: row.business_id,
      p_week_start: weekStart,
      p_count: slots.length,
    })
    if (beginError) {
      log.error('[autopilot] begin', { code: beginError.code })
      continue
    }
    const ids = (reservations ?? []) as string[]
    if (!ids.length) continue // already ran this week, no time left this week, or no AI posts left this month
    businesses++

    const language: LanguageCode = isLanguageCode(business.content_language ?? '')
      ? (business.content_language as LanguageCode)
      : isLanguageCode(row.preferred_language ?? '')
        ? (row.preferred_language as LanguageCode)
        : DEFAULT_LANGUAGE
    const context = buildMarketingContext(business, { preferred_language: row.preferred_language ?? DEFAULT_LANGUAGE })
    const ideas = weekIdeas(weekStart, exampleGroupFor(business.business_category), ids.length)
    const offers = row.owner_offers?.trim() || null

    const posts: Record<string, unknown>[] = []
    const used: string[] = []
    for (let i = 0; i < ids.length; i++) {
      const idea = ideas[i]
      const text = ideaText(idea, language)
      try {
        const request = buildAIContentRequest(context, { content_type: text.type, title: text.title, description: text.brief, offer_text: offers, language })
        const result = await generateMarketingContent(request)
        posts.push({
          slot: i + 1,
          planned_for: slots[i],
          title: text.title,
          content_type: text.type,
          language,
          description: text.brief,
          offer_text: offers ?? '',
          generated_copy: result.content,
          ai_provider: result.provider,
          ai_model: result.model,
          idea,
        })
        used.push(ids[i])
      } catch {
        // Logged by the AI service; this post is skipped and its credit released below.
      }
    }

    const { error: saveError } = await supabase.rpc('autopilot_save', {
      p_secret: secret,
      p_business_id: row.business_id,
      p_week_start: weekStart,
      p_posts: posts as unknown as Json,
      p_commit: used,
      p_release: ids.filter((id) => !used.includes(id)),
    })
    if (saveError) {
      log.error('[autopilot] save', { code: saveError.code, message: saveError.message.slice(0, 120) })
      continue
    }
    total += posts.length
    log.info('[autopilot] prepared', { posts: posts.length, of: ids.length })
  }
  return { businesses, posts: total }
}
