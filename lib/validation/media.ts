import { z } from 'zod'
import {
  ASPECT_RATIO_KEYS,
  MEDIA_ASSET_TYPES,
  REEL_DURATION,
  REEL_SCENES,
  SCENE_DURATION,
  SCENE_TRANSITIONS,
  SCENE_TYPES,
  type AspectRatio,
} from '@/lib/config/media'
import { isPosterLayoutSlug } from '@/lib/config/poster-templates'
import { sumDurations } from '@/lib/media/storyboard'
import { LANGUAGE_CODES } from '@/lib/config/languages'

/** Trimmed text with a maximum length ('' allowed). */
const text = (max: number) => z.string().trim().max(max)

export const mediaIdSchema = z.uuid()
export const aspectRatioSchema = z.enum(ASPECT_RATIO_KEYS as [AspectRatio, ...AspectRatio[]])

/** The texts placed on a poster (the owner reviews/edits them before rendering). */
export const posterTextsSchema = z.object({
  headline: text(120).min(1),
  body: text(400),
  badge: text(60),
  cta: text(80),
  businessName: text(100).min(1),
  footer: text(120),
})

/** Everything needed to re-create a poster; saved in media_assets.metadata. */
export const posterSpecSchema = z.object({
  content_id: z.uuid(),
  template: z.string().max(60).refine(isPosterLayoutSlug),
  aspect_ratio: aspectRatioSchema,
  texts: posterTextsSchema,
  image_asset_id: z.uuid().nullable(),
})
export type PosterSpec = z.infer<typeof posterSpecSchema>

/** "Let AI design the whole poster" input: the owner's own lines, size and style. */
export const directPosterSchema = z.object({
  content_id: z.uuid(),
  template: z.string().max(60).refine(isPosterLayoutSlug),
  aspect_ratio: aspectRatioSchema,
  texts: posterTextsSchema,
})

/** "Generate a picture" input. The prompt is built on the server from stored data. */
export const imageGenerationSchema = z.object({
  content_id: z.uuid(),
  purpose: z.enum(['poster', 'scene']),
  aspect_ratio: aspectRatioSchema,
  template: z.string().max(60).refine(isPosterLayoutSlug).optional(),
  /** Scene direction from the storyboard (owner-editable, quoted as data in the prompt). */
  visual: text(200).optional(),
})

export const storyboardSceneSchema = z.object({
  id: z.uuid(),
  scene_type: z.enum(SCENE_TYPES),
  duration_seconds: z.number().int().min(SCENE_DURATION.min).max(SCENE_DURATION.max),
  on_screen_text: text(120),
  voiceover_text: text(300),
  visual_prompt: text(200),
  transition: z.enum(SCENE_TRANSITIONS),
  asset_id: z.uuid().nullable(),
})

export const storyboardSchema = z
  .object({
    version: z.literal(1),
    title: text(120),
    hook: text(200),
    language: z.enum(LANGUAGE_CODES),
    total_duration: z.number().int(),
    scenes: z.array(storyboardSceneSchema).min(REEL_SCENES.min).max(REEL_SCENES.max),
  })
  // The total is always recomputed from the scenes, never trusted.
  .transform((s) => ({ ...s, total_duration: sumDurations(s.scenes) }))
  .refine((s) => s.total_duration >= REEL_DURATION.min && s.total_duration <= REEL_DURATION.max, {
    message: 'duration',
    path: ['total_duration'],
  })
  .refine((s) => new Set(s.scenes.map((scene) => scene.id)).size === s.scenes.length, { message: 'ids' })

export const saveStoryboardSchema = z.object({ content_id: z.uuid(), storyboard: storyboardSchema })

export const mediaListParamsSchema = z.object({
  type: z.enum(MEDIA_ASSET_TYPES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
})
export type MediaListParams = z.output<typeof mediaListParamsSchema>

export function parseMediaListParams(raw: Record<string, string | string[] | undefined>): MediaListParams {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  return mediaListParamsSchema.parse({ type: first(raw.type) || undefined, page: first(raw.page) ?? 1 })
}
