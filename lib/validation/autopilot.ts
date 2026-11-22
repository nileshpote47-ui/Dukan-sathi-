import { z } from 'zod'
import { AUTOPILOT_OFFERS_MAX, AUTOPILOT_TIMES } from '@/lib/config/autopilot'

/** Autopilot settings from the owner (accounts are checked again on the server against their own accounts). */
export const autopilotSettingsSchema = z.object({
  enabled: z.boolean(),
  accountIds: z.array(z.uuid()).max(10).refine((ids) => new Set(ids).size === ids.length),
  postTime: z.enum(AUTOPILOT_TIMES),
  ownerOffers: z.string().trim().max(AUTOPILOT_OFFERS_MAX).optional().default(''),
})
export type AutopilotSettingsInput = z.infer<typeof autopilotSettingsSchema>

export const autopilotPostIdSchema = z.uuid()
