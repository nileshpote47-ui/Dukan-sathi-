import { MEDIA_MAX_BYTES, UPLOAD_RESIZE_TO } from '@/lib/config/media'

/*
 * Browser-only helpers (used by client components). Photos are resized before upload so
 * phone pictures stay small; posters are exported from the canvas. The server checks
 * the result again — these helpers are for speed, not for security.
 */

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** Resize a photo to at most UPLOAD_RESIZE_TO px on its longest side, as JPEG. */
export async function resizeForUpload(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, UPLOAD_RESIZE_TO / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await toBlob(canvas, 'image/jpeg', 0.86)
  if (!blob) throw new Error('Could not encode image')
  return blob
}

/** Export a rendered poster: PNG, or JPEG when the PNG would be too large to upload. */
export async function exportCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  const png = await toBlob(canvas, 'image/png')
  if (png && png.size <= MEDIA_MAX_BYTES) return png
  for (const quality of [0.92, 0.85, 0.75]) {
    const jpeg = await toBlob(canvas, 'image/jpeg', quality)
    if (jpeg && jpeg.size <= MEDIA_MAX_BYTES) return jpeg
  }
  throw new Error('Poster too large')
}
