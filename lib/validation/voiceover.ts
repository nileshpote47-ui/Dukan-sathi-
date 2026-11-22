import { z } from 'zod'
import { VOICE_IDS } from '@/lib/config/voiceover'
import { contentIdSchema } from './content'

/** Only the item and the chosen voice come from the browser; the text is read from the saved storyboard. */
export const voiceoverRequestSchema = z.object({
  content_id: contentIdSchema,
  voice: z.enum(VOICE_IDS),
})

/** Shape of content_items.voiceover when read back. */
export const voiceoverRecordSchema = z.object({
  path: z.string().min(1).max(300),
  voice: z.enum(VOICE_IDS),
  language: z.enum(['en', 'mr', 'hi']),
  chars: z.number().int().nonnegative(),
  created_at: z.string(),
})
