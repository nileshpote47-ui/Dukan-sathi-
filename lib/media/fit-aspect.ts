import 'server-only'
import sharp from 'sharp'
import { ASPECT_RATIOS, type AspectRatio } from '@/lib/config/media'

/**
 * Fit a generated poster to a social size WITHOUT cropping: the whole poster is scaled to fit
 * inside the target and centred on a softly blurred, slightly darker copy of itself, so no text
 * near an edge can be cut and the extra space looks intentional. Saved as JPEG to stay well under
 * the storage size limit.
 */
export async function padToAspect(bytes: Uint8Array, ratio: AspectRatio): Promise<Uint8Array> {
  const target = ASPECT_RATIOS[ratio]
  const { width = 0, height = 0 } = await sharp(bytes).metadata()
  if (!width || !height) throw new Error('Unreadable image')

  const poster = await sharp(bytes).resize(target.width, target.height, { fit: 'inside' }).png().toBuffer()
  const background = await sharp(bytes)
    .resize(target.width, target.height, { fit: 'cover' })
    .blur(40)
    .modulate({ brightness: 0.8 })
    .png()
    .toBuffer()
  const output = await sharp(background)
    .composite([{ input: poster, gravity: 'centre' }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
  return new Uint8Array(output)
}
