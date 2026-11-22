import type { MessageKey } from '@/lib/i18n'

/*
 * Media (Phase 4) configuration. Lists mirrored in database check constraints
 * (asset types, source types, statuses, MIME types) must match the media migration —
 * tests/unit/config-sync.test.ts checks this.
 */

/** Kinds of stored media. VIDEO / AUDIO come with a video renderer in a later phase. */
export const MEDIA_ASSET_TYPES = ['IMAGE', 'POSTER'] as const
export type MediaAssetType = (typeof MEDIA_ASSET_TYPES)[number]

/** Where a file came from. */
export const MEDIA_SOURCE_TYPES = ['UPLOAD', 'AI_GENERATED', 'TEMPLATE_RENDERED', 'STOCK'] as const
export type MediaSourceType = (typeof MEDIA_SOURCE_TYPES)[number]

/** GENERATING → READY or FAILED. A failed generation is never marked READY. */
export const MEDIA_STATUSES = ['GENERATING', 'READY', 'FAILED'] as const
export type MediaStatus = (typeof MEDIA_STATUSES)[number]

/** File types accepted for storage (checked by content, not by the name or browser-sent type). */
export const MEDIA_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type MediaMimeType = (typeof MEDIA_MIME_TYPES)[number]
export const MEDIA_EXTENSIONS: Record<MediaMimeType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/** One private bucket for all business media; objects live under `<owner_id>/`. */
export const MEDIA_BUCKET = 'business-media'
/**
 * Largest file accepted. Server Action bodies are limited to 4 MB (next.config.ts) and
 * Vercel functions to 4.5 MB, so files stay below that with room for form overhead.
 */
export const MEDIA_MAX_BYTES = 3_500_000
/** Largest side of a stored picture. Photos are resized in the browser before upload. */
export const MEDIA_MAX_DIMENSION = 4096
export const UPLOAD_RESIZE_TO = 1600
/** Private files are shown through short-lived signed links. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60
export const MEDIA_PAGE_SIZE = 24
/** A generation still "GENERATING" after this long is treated as failed (e.g. the function was stopped). */
export const GENERATION_STALE_MS = 3 * 60 * 1000
/** One image generation may not take longer than this (no automatic retries). */
export const MEDIA_TIMEOUT_MS = 50_000

/** Image providers (MEDIA_PROVIDER). Unset = AI pictures are off; posters still work. */
export const MEDIA_PROVIDERS = ['gemini', 'mock'] as const
export type MediaProviderId = (typeof MEDIA_PROVIDERS)[number]
export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image'

/*
 * Direct posters (Phase 9): one AI image that already carries the owner's own text.
 * DIRECT_POSTER_PROVIDER = openai | mock (unset = openai when OPENAI_API_KEY is set).
 * The model draws at a native size; the result is padded (never cropped, so no text is cut)
 * to the chosen social size.
 */
export const DIRECT_POSTER_PROVIDERS = ['openai', 'mock'] as const
export type DirectPosterProviderId = (typeof DIRECT_POSTER_PROVIDERS)[number]
export const DEFAULT_DIRECT_POSTER_MODEL = 'gpt-image-2.6-sunburst'
export const DIRECT_POSTER_TIMEOUT_MS = 110_000
export const DIRECT_POSTER_NATIVE_SIZES = { '1:1': '1024x1024', '4:5': '1024x1536', '9:16': '1024x1536', '16:9': '1536x1024' } as const
/** metadata.kind on media_assets for direct posters; they stay out of publishing until the owner confirms the text. */
export const DIRECT_POSTER_KIND = 'direct_poster'

/** Poster / creative sizes in pixels (social-media friendly). */
export const ASPECT_RATIOS = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
} as const
export type AspectRatio = keyof typeof ASPECT_RATIOS
export const ASPECT_RATIO_KEYS = Object.keys(ASPECT_RATIOS) as AspectRatio[]
export const DEFAULT_ASPECT_RATIO: AspectRatio = '4:5'
export const ASPECT_RATIO_LABELS: Record<AspectRatio, MessageKey> = {
  '1:1': 'media.ratio.square',
  '4:5': 'media.ratio.portrait',
  '9:16': 'media.ratio.story',
  '16:9': 'media.ratio.wide',
}

/* Reel storyboards */
export const REEL_ASPECT_RATIO: AspectRatio = '9:16'
export const REEL_SCENES = { min: 3, max: 8 } as const
export const REEL_DURATION = { min: 8, max: 60 } as const
export const SCENE_DURATION = { min: 1, max: 15 } as const
export const SCENE_TYPES = ['TEXT', 'IMAGE', 'VIDEO', 'PRODUCT', 'BRAND', 'CTA'] as const
export type SceneType = (typeof SCENE_TYPES)[number]
export const SCENE_TRANSITIONS = ['cut', 'fade', 'slide'] as const
export type SceneTransition = (typeof SCENE_TRANSITIONS)[number]
