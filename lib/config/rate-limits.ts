/*
 * Short-window burst limits per signed-in user (Phase 8). A safety layer against scripted or
 * accidental floods of expensive calls; monthly plan limits (Phase 5) still decide what an
 * owner may use. Generous enough that nobody using the app normally ever meets them.
 */
export const RATE_LIMITS = {
  ai_text_generation: { limit: 20, windowSeconds: 5 * 60 },
  image_generation: { limit: 10, windowSeconds: 5 * 60 },
  reel_generation: { limit: 10, windowSeconds: 5 * 60 },
  media_export: { limit: 30, windowSeconds: 5 * 60 },
  social_publishing: { limit: 30, windowSeconds: 10 * 60 },
  direct_poster: { limit: 6, windowSeconds: 10 * 60 },
  voiceover: { limit: 10, windowSeconds: 10 * 60 },
  // Free stock photo search and save (Pixabay allows 100 requests a minute for the whole app).
  stock_search: { limit: 30, windowSeconds: 5 * 60 },
  stock_save: { limit: 20, windowSeconds: 10 * 60 },
  social_connect: { limit: 20, windowSeconds: 10 * 60 },
} as const satisfies Record<string, { limit: number; windowSeconds: number }>

export type RateLimitedAction = keyof typeof RATE_LIMITS
