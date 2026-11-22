import { afterEach, describe, expect, it, vi } from 'vitest'
import { RATE_LIMITS } from '@/lib/config/rate-limits'
import { VOICE_IDS, VOICE_LANGUAGE_CODES, VOICES } from '@/lib/config/voiceover'
import { LANGUAGE_CODES } from '@/lib/config/languages'
import { en } from '@/lib/i18n/messages/en'
import { hi } from '@/lib/i18n/messages/hi'
import { mr } from '@/lib/i18n/messages/mr'
import { isMp3 } from '@/lib/media/audio-file'
import { voiceoverText } from '@/lib/media/voiceover-text'
import { voiceoverRecordSchema, voiceoverRequestSchema } from '@/lib/validation/voiceover'
import { getVoiceConfig } from '@/services/voice/provider'
import { MockVoiceProvider } from '@/services/voice/providers/mock'
import { sarvamError, SarvamVoiceProvider } from '@/services/voice/providers/sarvam'

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
afterEach(() => vi.unstubAllEnvs())

const scene = (voiceover_text: string) => ({ voiceover_text }) as never

describe('voiceover text', () => {
  it('reads only the owner\'s lines, in scene order, word for word', () => {
    const text = voiceoverText({ scenes: [scene('  दिवाळी धमाका ऑफर! '), scene(''), scene('काजू ₹899/किलो'), scene('   ')] })
    expect(text).toBe('दिवाळी धमाका ऑफर!\nकाजू ₹899/किलो')
    expect(voiceoverText({ scenes: [scene(''), scene(' ')] })).toBe('')
  })
})

describe('voiceover request', () => {
  it('accepts only the item and a known voice (no text, no owner ids from the browser)', () => {
    const ok = voiceoverRequestSchema.safeParse({ content_id: '7d2f3e6a-1b2c-4d5e-8f90-123456789abc', voice: 'male', text: 'x', owner_id: 'y' })
    expect(ok.success && Object.keys(ok.data).sort()).toEqual(['content_id', 'voice'])
    expect(voiceoverRequestSchema.safeParse({ content_id: 'nope', voice: 'male' }).success).toBe(false)
    expect(voiceoverRequestSchema.safeParse({ content_id: '7d2f3e6a-1b2c-4d5e-8f90-123456789abc', voice: 'robot' }).success).toBe(false)
  })

  it('reads back stored records and rejects anything else', () => {
    expect(voiceoverRecordSchema.safeParse({ path: 'u/voiceovers/c/x.mp3', voice: 'female', language: 'mr', chars: 40, created_at: 'now' }).success).toBe(true)
    expect(voiceoverRecordSchema.safeParse({ path: 'u/x.mp3', voice: 'female', language: 'ta', chars: 1, created_at: 'now' }).success).toBe(false)
  })

  it('has a voice and language code for every option', () => {
    expect(VOICE_IDS).toEqual(VOICES.map((v) => v.id))
    for (const code of LANGUAGE_CODES) expect(VOICE_LANGUAGE_CODES[code]).toMatch(/^[a-z]{2}-IN$/)
    expect(RATE_LIMITS.voiceover.limit).toBeGreaterThan(0)
  })
})

describe('Sarvam provider', () => {
  it('sends the owner\'s text, language and speaker with the key in its header, and returns MP3 bytes', async () => {
    const mp3 = Buffer.from([0xff, 0xf3, 0xc0, 0xc4, 0, 0])
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ request_id: 'r', audios: [mp3.toString('base64')] }), { status: 200 }))
    const provider = new SarvamVoiceProvider('bulbul:v3', { apiKey: 'secret-key', fetchImpl })
    const result = await provider.synthesize({ text: 'काजू ₹899/किलो', languageCode: 'mr-IN', speaker: 'priya' })
    expect(Buffer.from(result.bytes)).toEqual(mp3)
    expect(result.mimeType).toBe('audio/mpeg')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.sarvam.ai/text-to-speech')
    expect((init.headers as Record<string, string>)['api-subscription-key']).toBe('secret-key')
    expect(JSON.parse(init.body as string)).toMatchObject({
      text: 'काजू ₹899/किलो',
      language_code: 'mr-IN',
      speaker: 'priya',
      model: 'bulbul:v3',
      output_audio_codec: 'mp3',
    })
  })

  it('refuses without a key and maps errors to safe codes', async () => {
    await expect(new SarvamVoiceProvider('bulbul:v3').synthesize({ text: 'x', languageCode: 'hi-IN', speaker: 'rahul' })).rejects.toMatchObject({ code: 'not_configured' })
    expect(sarvamError(403, '{"error":{"code":"invalid_api_key_error"}}').code).toBe('not_configured')
    expect(sarvamError(402, '{"error":{"code":"insufficient_quota_error"}}').code).toBe('unavailable')
    expect(sarvamError(429, '').code).toBe('rate_limited')
    expect(sarvamError(400, 'not json').code).toBe('invalid_request')
    expect(sarvamError(503, '').code).toBe('unavailable')
    expect(sarvamError(403, '{"error":{"code":"invalid_api_key_error","message":"key abc"}}').message).not.toContain('abc')
  })

  it('treats an empty answer as an error', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ audios: [] }), { status: 200 }))
    await expect(new SarvamVoiceProvider('bulbul:v3', { apiKey: 'k', fetchImpl }).synthesize({ text: 'x', languageCode: 'en-IN', speaker: 'priya' })).rejects.toMatchObject({ code: 'empty_response' })
  })
})

describe('provider selection and test provider', () => {
  it('is chosen from server-only settings; the test provider never runs in production', () => {
    vi.stubEnv('VOICE_PROVIDER', '')
    vi.stubEnv('SARVAM_API_KEY', '')
    expect(getVoiceConfig()).toBeNull()
    vi.stubEnv('SARVAM_API_KEY', 'k')
    expect(getVoiceConfig()).toEqual({ provider: 'sarvam', model: 'bulbul:v3' })
    vi.stubEnv('VOICE_PROVIDER', 'mock')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(getVoiceConfig()).toBeNull()
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(getVoiceConfig()?.provider).toBe('mock')
  })

  it('mock returns a real MP3 and can simulate failure', async () => {
    const mock = new MockVoiceProvider()
    expect(isMp3((await mock.synthesize({ text: 'hello', languageCode: 'en-IN', speaker: 'priya' })).bytes)).toBe(true)
    await expect(mock.synthesize({ text: '[mock:fail]', languageCode: 'en-IN', speaker: 'priya' })).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('checks MP3 by content', () => {
    expect(isMp3(new Uint8Array([0x49, 0x44, 0x33, 4]))).toBe(true)
    expect(isMp3(new Uint8Array([0xff, 0xfb, 0x90, 0]))).toBe(true)
    expect(isMp3(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // WAV
    expect(isMp3(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
  })
})

describe('voiceover texts', () => {
  it('exist in English, Marathi and Hindi', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('voiceover.') || k.startsWith('billing.') && k.endsWith('.voiceover'))
    expect(keys.length).toBeGreaterThan(15)
    for (const dict of [mr, hi] as Record<string, string>[]) for (const key of keys) expect(dict[key], key).toBeTruthy()
  })
})
