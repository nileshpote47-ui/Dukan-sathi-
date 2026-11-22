import { z } from 'zod'
import { STOCK_QUERY_MAX } from '@/lib/config/stock'

export const stockSearchSchema = z.object({
  query: z.string().trim().min(2).max(STOCK_QUERY_MAX),
  page: z.number().int().min(1).max(20).default(1),
})

/** Only the provider's photo id and (optionally) the owner's content item come from the browser. */
export const stockSaveSchema = z.object({
  photo_id: z.string().regex(/^\d{1,12}$/),
  content_id: z.union([z.literal(''), z.uuid()]).optional().transform((v) => v || null),
})
