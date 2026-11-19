import { crc32, deflateSync } from 'node:zlib'
import type { AspectRatio } from '@/lib/config/media'
import { AIError } from '@/services/ai/types'
import type { ImageGenerationRequest, ImageGenerationResponse, MediaProvider } from '../types'

/**
 * Deterministic image provider for automated tests (MEDIA_PROVIDER=mock). No network,
 * no cost. Returns a real PNG (soft gradient) so storage, validation and drawing are
 * exercised end to end.
 *
 * Failure simulation: a marker anywhere in the prompt (e.g. in the content title or the
 * scene direction), or MEDIA_MOCK_SCENARIO:
 *   [mock:fail] [mock:timeout] [mock:rate-limit] [mock:blocked] [mock:malformed] [mock:empty]
 */

const SIZES: Record<AspectRatio, [number, number]> = {
  '1:1': [768, 768],
  '4:5': [768, 960],
  '9:16': [720, 1280],
  '16:9': [1280, 720],
}

const SCENARIOS = ['fail', 'timeout', 'rate-limit', 'blocked', 'malformed', 'empty'] as const

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** A small valid RGB PNG with a diagonal gradient (seeded by the prompt). */
export function mockPng(width: number, height: number, seed = 0): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  const hue = seed % 3
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    raw[row] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2
      const base = [200 - t * 120, 140 + t * 80, 90 + t * 120]
      const o = row + 1 + x * 3
      raw[o] = base[hue % 3]
      raw[o + 1] = base[(hue + 1) % 3]
      raw[o + 2] = base[(hue + 2) % 3]
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: RGB
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return new Uint8Array(Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}

export class MockMediaProvider implements MediaProvider {
  readonly id = 'mock'
  readonly model = 'mock-image-1'

  constructor(private readonly delayMs = Number(process.env.AI_MOCK_DELAY_MS ?? 400)) {}

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    const marker = request.prompt.match(/\[mock:([a-z-]+)\]/)?.[1] ?? process.env.MEDIA_MOCK_SCENARIO
    switch (SCENARIOS.find((s) => s === marker)) {
      case 'fail':
        throw new AIError('unavailable', 'Mock image provider simulated an outage')
      case 'timeout':
        throw new AIError('timeout', 'Mock image provider simulated a timeout')
      case 'rate-limit':
        throw new AIError('rate_limited', 'Mock image provider simulated a rate limit')
      case 'blocked':
        throw new AIError('blocked', 'Mock image provider simulated a blocked request')
      case 'malformed':
        return { bytes: new TextEncoder().encode('<html>not an image</html>'), mimeType: 'image/png' }
      case 'empty':
        return { bytes: new Uint8Array(), mimeType: 'image/png' }
    }
    const [width, height] = SIZES[request.aspectRatio]
    const seed = [...request.prompt].reduce((sum, c) => sum + c.charCodeAt(0), 0)
    return { bytes: mockPng(width, height, seed), mimeType: 'image/png' }
  }
}
