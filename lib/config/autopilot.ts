import type { Channel } from './publishing'

/*
 * Premium Autopilot (Phase 9). How many posts a week is plan data (billing_plans.autopilot_posts_per_week);
 * the rest is here. Nothing is published without the owner's approval.
 */

/** Channels Autopilot posts to. WhatsApp follows once WhatsApp Business is set up (shown as Coming soon). */
export const AUTOPILOT_CHANNELS = ['FACEBOOK', 'INSTAGRAM'] as const satisfies readonly Channel[]
export const AUTOPILOT_COMING_SOON: readonly Channel[] = ['WHATSAPP']

/** Days of the week (0 = Monday) the prepared posts are planned for, in order. */
export const AUTOPILOT_DAYS = [0, 1, 3, 4, 5, 2, 6] as const
/** Post times the owner can choose (India time). */
export const AUTOPILOT_TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00', '17:00', '18:00', '19:00', '20:00'] as const
export const AUTOPILOT_DEFAULT_TIME = '10:00'
/** A slot must be at least this far ahead to be planned or scheduled. */
export const AUTOPILOT_LEAD_MINUTES = 30
/** The owner's own offers and prices, used word for word (stored as the posts' offer). */
export const AUTOPILOT_OFFERS_MAX = 300
/** Size of the poster made for each approved post. */
export const AUTOPILOT_POSTER_RATIO = '4:5' as const
