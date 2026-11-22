'use client'

import { useEffect, useRef, useState, type Ref } from 'react'
import { ASPECT_RATIOS, type AspectRatio } from '@/lib/config/media'
import { getPosterLayout } from '@/lib/config/poster-templates'
import { layoutPoster, POSTER_FONT_FAMILY, type Fill, type PosterLayoutResult, type PosterTexts } from '@/lib/media/poster-layout'
import { cn } from '@/lib/utils/cn'

/*
 * Draws a template poster on a full-size <canvas> (e.g. 1080×1350). The same canvas is
 * the preview (scaled down with CSS) and the export, so what the owner sees is exactly
 * what is saved. The browser shapes Marathi/Hindi text correctly.
 */

const font = (size: number, weight: number) => `${weight} ${Math.round(size)}px ${POSTER_FONT_FAMILY}`

function fillStyle(ctx: CanvasRenderingContext2D, fill: Fill, y: number, h: number): string | CanvasGradient {
  if (typeof fill === 'string') return fill
  const gradient = ctx.createLinearGradient(0, y, 0, y + h)
  gradient.addColorStop(0, fill.from)
  gradient.addColorStop(1, fill.to)
  return gradient
}

function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h)
}

export function drawPoster(ctx: CanvasRenderingContext2D, result: PosterLayoutResult, image: HTMLImageElement | null) {
  ctx.clearRect(0, 0, result.width, result.height)
  for (const op of result.ops) {
    ctx.save()
    if ('alpha' in op && op.alpha !== undefined) ctx.globalAlpha = op.alpha
    switch (op.kind) {
      case 'rect':
        ctx.beginPath()
        if (op.radius) ctx.roundRect(op.x, op.y, op.w, op.h, op.radius)
        else ctx.rect(op.x, op.y, op.w, op.h)
        if (op.fill) {
          ctx.fillStyle = fillStyle(ctx, op.fill, op.y, op.h)
          ctx.fill()
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke
          ctx.lineWidth = op.lineWidth ?? 4
          ctx.stroke()
        }
        break
      case 'circle':
        ctx.beginPath()
        ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2)
        ctx.fillStyle = op.fill
        ctx.fill()
        break
      case 'polygon':
        ctx.beginPath()
        op.points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
        ctx.closePath()
        ctx.fillStyle = op.fill
        ctx.fill()
        break
      case 'photo':
        if (image) {
          ctx.beginPath()
          ctx.rect(op.x, op.y, op.w, op.h)
          ctx.clip()
          drawCover(ctx, image, op.x, op.y, op.w, op.h)
        }
        break
      case 'shade': {
        const gradient = ctx.createLinearGradient(0, op.y, 0, op.y + op.h)
        gradient.addColorStop(0, 'rgba(0,0,0,0)')
        gradient.addColorStop(1, 'rgba(0,0,0,0.78)')
        ctx.fillStyle = gradient
        ctx.fillRect(op.x, op.y, op.w, op.h)
        break
      }
      case 'text':
        ctx.font = font(op.size, op.weight)
        ctx.fillStyle = op.color
        ctx.textAlign = op.align
        ctx.textBaseline = 'top'
        op.lines.forEach((line, i) => {
          ctx.fillText(line, op.x, op.y + i * op.size * op.lineHeight + (op.size * (op.lineHeight - 1)) / 2)
        })
        break
    }
    ctx.restore()
  }
}

/** Load a picture so it can be drawn and exported (signed storage URLs allow CORS). */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image failed to load'))
    image.src = url
  })
}

interface PosterCanvasProps {
  template: string
  aspectRatio: AspectRatio
  texts: PosterTexts
  imageUrl: string | null
  className?: string
  ref?: Ref<HTMLCanvasElement>
  label: string
  onImageError?: () => void
  /** Draw at a fraction of full size (template thumbnails); the layout scales with the canvas. */
  scale?: number
}

export function PosterCanvas({ template, aspectRatio, texts, imageUrl, className, ref, label, onImageError, scale = 1 }: PosterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [image, setImage] = useState<{ url: string; element: HTMLImageElement } | null>(null)
  const [fontsReady, setFontsReady] = useState(false)
  const full = ASPECT_RATIOS[aspectRatio]
  const width = Math.round(full.width * scale)
  const height = Math.round(full.height * scale)

  // Wait for web fonts (if any) so text is measured with the final font.
  useEffect(() => {
    let active = true
    document.fonts.ready.then(() => active && setFontsReady(true))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!imageUrl) return
    let active = true
    loadImage(imageUrl)
      .then((element) => active && setImage({ url: imageUrl, element }))
      .catch(() => active && onImageError?.())
    return () => {
      active = false
    }
  }, [imageUrl, onImageError])

  const current = imageUrl && image?.url === imageUrl ? image.element : null

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const result = layoutPoster({
      layout: getPosterLayout(template),
      width,
      height,
      texts,
      hasPhoto: Boolean(current),
      measure: (text, size, weight) => {
        ctx.font = font(size, weight)
        return ctx.measureText(text).width
      },
    })
    drawPoster(ctx, result, current)
  }, [template, width, height, texts, current, fontsReady])

  return (
    <canvas
      ref={(node) => {
        canvasRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      data-ready={imageUrl ? Boolean(current) : true}
      className={cn('h-auto w-full rounded-xl border bg-muted shadow-sm', className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    />
  )
}
