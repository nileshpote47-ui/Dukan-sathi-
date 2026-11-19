import { MEDIA_MAX_BYTES, MEDIA_MAX_DIMENSION, type MediaMimeType } from '@/lib/config/media'

/*
 * Server-side inspection of uploaded / generated image bytes. The type and size come
 * from the file content itself — never from the file name or the browser-sent type.
 */

export interface ImageInfo {
  mimeType: MediaMimeType
  width: number
  height: number
  size: number
}

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v)
const ascii = (b: Uint8Array, offset: number, length: number) => String.fromCharCode(...b.subarray(offset, offset + length))
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])

function pngSize(b: Uint8Array) {
  // Signature, then the IHDR chunk: length(4) "IHDR"(4) width(4) height(4).
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null
  return { width: u32be(b, 16), height: u32be(b, 20) }
}

function jpegSize(b: Uint8Array) {
  let o = 2
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) return null
    const marker = b[o + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2
      continue
    }
    const length = u16be(b, o + 2)
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16be(b, o + 5), width: u16be(b, o + 7) }
    }
    if (length < 2) return null
    o += 2 + length
  }
  return null
}

function webpSize(b: Uint8Array) {
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8 ' && b.length >= 30) return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  if (chunk === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X' && b.length >= 30) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
  return null
}

/** Detect PNG / JPEG / WebP and read the dimensions. null = not an accepted image. */
export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  let mimeType: MediaMimeType
  let size: { width: number; height: number } | null
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    mimeType = 'image/png'
    size = pngSize(bytes)
  } else if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    mimeType = 'image/jpeg'
    size = jpegSize(bytes)
  } else if (bytes.length >= 16 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    mimeType = 'image/webp'
    size = webpSize(bytes)
  } else {
    return null
  }
  if (!size || size.width < 1 || size.height < 1) return null
  return { mimeType, ...size, size: bytes.length }
}

export type ImageProblem = 'empty' | 'tooLarge' | 'notImage' | 'dimensions'

/** Validate bytes for storage. Returns the image info or the reason it was refused. */
export function validateImage(bytes: Uint8Array): { ok: true; info: ImageInfo } | { ok: false; problem: ImageProblem } {
  if (!bytes.length) return { ok: false, problem: 'empty' }
  if (bytes.length > MEDIA_MAX_BYTES) return { ok: false, problem: 'tooLarge' }
  const info = inspectImage(bytes)
  if (!info) return { ok: false, problem: 'notImage' }
  if (info.width > MEDIA_MAX_DIMENSION || info.height > MEDIA_MAX_DIMENSION) return { ok: false, problem: 'dimensions' }
  return { ok: true, info }
}
