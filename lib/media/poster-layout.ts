import type { PosterLayoutDefinition } from '@/lib/config/poster-templates'

/*
 * Template-based poster composition. Pure functions: given a layout definition, a size,
 * the texts and a text-measuring function, return a list of drawing operations.
 * components/media/poster-canvas.tsx draws them on a <canvas> in the browser (which
 * shapes Marathi/Hindi correctly); unit tests use a fake measure function.
 * Text is never invented here — every slot comes from the owner's content.
 */

/** Font stack with Devanagari coverage on Android, Windows and desktop. */
export const POSTER_FONT_FAMILY = '"Noto Sans", "Noto Sans Devanagari", "Nirmala UI", "Mangal", "Segoe UI", Roboto, system-ui, sans-serif'

export interface PosterTexts {
  headline: string
  body: string
  /** Offer / value in a round badge. Empty = no badge (never invented). */
  badge: string
  cta: string
  businessName: string
  /** Second footer line: place and/or phone from the business profile. */
  footer: string
}

export type MeasureText = (text: string, sizePx: number, weight: number) => number

export type Fill = string | { from: string; to: string }

export type PosterOp =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill?: Fill; stroke?: string; lineWidth?: number; radius?: number; alpha?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string; alpha?: number }
  | { kind: 'polygon'; points: [number, number][]; fill: string; alpha?: number }
  | { kind: 'photo'; x: number; y: number; w: number; h: number }
  | { kind: 'shade'; x: number; y: number; w: number; h: number }
  | {
      kind: 'text'
      lines: string[]
      x: number
      y: number
      size: number
      lineHeight: number
      weight: number
      color: string
      align: 'left' | 'center'
    }

export interface PosterLayoutResult {
  width: number
  height: number
  ops: PosterOp[]
}

const ELLIPSIS = '…'

function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment)
  }
  return [...text]
}

/** Word-wrap (keeps Devanagari letters whole: overlong words break between graphemes). */
export function wrapText(text: string, maxWidth: number, size: number, weight: number, measure: MeasureText): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (measure(candidate, size, weight) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      if (measure(word, size, weight) <= maxWidth) {
        line = word
        continue
      }
      // A single word wider than the line: break it between graphemes.
      let part = ''
      for (const g of graphemes(word)) {
        if (part && measure(part + g, size, weight) > maxWidth) {
          lines.push(part)
          part = g
        } else {
          part += g
        }
      }
      line = part
    }
    if (line) lines.push(line)
  }
  return lines
}

/** Keep at most maxLines; the last kept line ends with an ellipsis when text was cut. */
export function clampLines(lines: string[], maxLines: number, maxWidth: number, size: number, weight: number, measure: MeasureText): string[] {
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && measure(last + ELLIPSIS, size, weight) > maxWidth) {
    last = graphemes(last).slice(0, -1).join('').trimEnd()
  }
  kept[maxLines - 1] = last + ELLIPSIS
  return kept
}

interface Block {
  lines: string[]
  size: number
  lineHeight: number
  weight: number
}

function textBlock(text: string, maxWidth: number, size: number, weight: number, lineHeight: number, maxLines: number, measure: MeasureText): Block {
  const lines = text.trim() ? clampLines(wrapText(text, maxWidth, size, weight, measure), maxLines, maxWidth, size, weight, measure) : []
  return { lines, size, lineHeight, weight }
}

const blockHeight = (b: Block) => b.lines.length * b.size * b.lineHeight

function decorate(ops: PosterOp[], layout: PosterLayoutDefinition, x: number, y: number, w: number, h: number) {
  const { accent } = layout.colors
  switch (layout.decoration) {
    case 'circles':
      ops.push({ kind: 'circle', cx: x + w * 0.88, cy: y + h * 0.2, r: Math.min(w, h) * 0.45, fill: accent, alpha: 0.12 })
      ops.push({ kind: 'circle', cx: x + w * 0.08, cy: y + h * 0.95, r: Math.min(w, h) * 0.3, fill: accent, alpha: 0.1 })
      break
    case 'stripes': {
      const step = Math.max(w, h) / 9
      for (let i = -9; i < 18; i += 2) {
        const sx = x + i * step
        ops.push({ kind: 'polygon', points: [[sx, y], [sx + step, y], [sx + step - h, y + h], [sx - h, y + h]], fill: accent, alpha: 0.1 })
      }
      break
    }
    case 'rays': {
      const cx = x + w / 2
      const cy = y + h * 0.15
      const r = Math.hypot(w, h)
      for (let i = 0; i < 24; i += 2) {
        const a1 = (i / 24) * Math.PI * 2
        const a2 = ((i + 1) / 24) * Math.PI * 2
        ops.push({ kind: 'polygon', points: [[cx, cy], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r], [cx + Math.cos(a2) * r, cy + Math.sin(a2) * r]], fill: accent, alpha: 0.12 })
      }
      break
    }
    case 'frame': {
      const inset = Math.min(w, h) * 0.06
      ops.push({ kind: 'rect', x: x + inset, y: y + inset, w: w - inset * 2, h: h - inset * 2, stroke: accent, lineWidth: Math.min(w, h) * 0.012, radius: inset })
      break
    }
    case 'none':
      break
  }
}

/** Compose a poster. `hasPhoto` = the owner chose a picture (drawn "cover" into the photo box). */
export function layoutPoster(input: {
  layout: PosterLayoutDefinition
  width: number
  height: number
  texts: PosterTexts
  hasPhoto: boolean
  measure: MeasureText
}): PosterLayoutResult {
  const { layout, width: W, height: H, texts, hasPhoto, measure } = input
  const { colors } = layout
  const u = Math.min(W, H) / 100
  const pad = 6 * u
  const wide = W > H * 1.2
  const ops: PosterOp[] = []

  // Background.
  ops.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, fill: { from: colors.background[0], to: colors.background[1] } })

  // Footer band with the business name (and place/phone), always at the bottom.
  const nameSize = 4.4 * u
  const footerSize = 3 * u
  const footerLines = texts.footer.trim() ? 1 : 0
  const footerH = pad * 0.9 + nameSize * 1.25 + footerLines * footerSize * 1.4 + pad * 0.7
  const footerTop = H - footerH
  ops.push({ kind: 'rect', x: 0, y: footerTop, w: W, h: footerH, fill: colors.accent })

  // Picture area (or decoration when there is no picture).
  let textTop: number
  let textLeft = pad
  const textRight = W - pad
  let bottomAligned = false
  const full = layout.photo === 'full'
  if (wide) {
    const photoW = W * 0.44
    if (hasPhoto) ops.push({ kind: 'photo', x: 0, y: 0, w: photoW, h: footerTop })
    else decorate(ops, layout, 0, 0, photoW, footerTop)
    textLeft = photoW + pad
    textTop = pad
  } else if (full && hasPhoto) {
    ops.push({ kind: 'photo', x: 0, y: 0, w: W, h: footerTop })
    ops.push({ kind: 'shade', x: 0, y: footerTop * 0.3, w: W, h: footerTop * 0.7 })
    textTop = footerTop * 0.4
    bottomAligned = true
  } else if (full) {
    decorate(ops, layout, 0, 0, W, footerTop)
    textTop = pad * 1.5
  } else {
    const ratio = H / W
    const photoH = hasPhoto ? H * (ratio >= 1.6 ? 0.45 : ratio >= 1.2 ? 0.46 : 0.42) : H * (ratio >= 1.6 ? 0.2 : 0.14)
    if (hasPhoto) ops.push({ kind: 'photo', x: 0, y: 0, w: W, h: photoH })
    else decorate(ops, layout, 0, 0, W, photoH)
    textTop = photoH + pad * 0.8
  }
  const textBottom = footerTop - pad * 0.8
  const maxWidth = textRight - textLeft
  const textColor = full && hasPhoto ? '#ffffff' : colors.text
  const mutedColor = full && hasPhoto ? '#f1f5f9' : colors.muted

  // Badge (top-right), only when the owner's content has an offer/value.
  if (texts.badge.trim()) {
    const r = 13 * u
    const cx = W - pad - r
    const cy = pad + r
    ops.push({ kind: 'circle', cx, cy, r, fill: colors.accent })
    ops.push({ kind: 'circle', cx, cy, r: r * 0.9, fill: colors.accentText, alpha: 0.15 })
    let size = 4.2 * u
    let badge = textBlock(texts.badge, r * 1.55, size, 800, 1.15, 3, measure)
    while (blockHeight(badge) > r * 1.4 && size > 2.6 * u) {
      size *= 0.9
      badge = textBlock(texts.badge, r * 1.55, size, 800, 1.15, 3, measure)
    }
    ops.push({ kind: 'text', lines: badge.lines, x: cx, y: cy - blockHeight(badge) / 2, size, lineHeight: 1.15, weight: 800, color: colors.accentText, align: 'center' })
    // Without a picture under it (or beside the text on wide posters) the badge shares the
    // text area: start the text below it.
    if (wide || !hasPhoto) textTop = Math.max(textTop, cy + r + 2 * u)
  }

  // Headline, body and CTA, shrunk together until they fit the text area.
  const available = textBottom - textTop
  const align = layout.align
  const ctaSize = 4 * u
  let scale = 1
  let headline: Block
  let body: Block
  let total: number
  const gap = 2.6 * u
  const ctaH = texts.cta.trim() ? ctaSize * 2.3 + 3.5 * u : 0
  for (;;) {
    headline = textBlock(texts.headline, maxWidth, layout.headlineSize * u * scale, 800, 1.15, 3, measure)
    body = textBlock(texts.body, maxWidth, 4.2 * u * scale, 500, 1.35, 5, measure)
    total = blockHeight(headline) + (body.lines.length ? gap + blockHeight(body) : 0) + ctaH
    if (total <= available || scale <= 0.55) break
    scale -= 0.05
  }
  // Still too tall at the smallest size: drop body lines from the end.
  while (total > available && body.lines.length > 1) {
    body = { ...body, lines: clampLines(body.lines, body.lines.length - 1, maxWidth, body.size, body.weight, measure) }
    total = blockHeight(headline) + gap + blockHeight(body) + ctaH
  }

  let y = bottomAligned ? textBottom - total : textTop + Math.max(0, (available - total) * 0.3)
  const anchorX = align === 'center' ? textLeft + maxWidth / 2 : textLeft
  if (headline.lines.length) {
    ops.push({ kind: 'text', lines: headline.lines, x: anchorX, y, size: headline.size, lineHeight: headline.lineHeight, weight: 800, color: textColor, align })
    y += blockHeight(headline)
  }
  if (body.lines.length) {
    y += gap
    ops.push({ kind: 'text', lines: body.lines, x: anchorX, y, size: body.size, lineHeight: body.lineHeight, weight: 500, color: mutedColor, align })
    y += blockHeight(body)
  }
  if (texts.cta.trim()) {
    y += 3.5 * u
    const ctaLines = clampLines(wrapText(texts.cta, maxWidth - ctaSize * 2, ctaSize, 700, measure), 1, maxWidth - ctaSize * 2, ctaSize, 700, measure)
    const ctaW = Math.min(maxWidth, measure(ctaLines[0] ?? '', ctaSize, 700) + ctaSize * 2.4)
    const ctaX = align === 'center' ? anchorX - ctaW / 2 : textLeft
    const pillH = ctaSize * 2.3
    ops.push({ kind: 'rect', x: ctaX, y, w: ctaW, h: pillH, fill: colors.accent, radius: pillH / 2 })
    ops.push({ kind: 'text', lines: ctaLines, x: ctaX + ctaW / 2, y: y + (pillH - ctaSize * 1.2) / 2, size: ctaSize, lineHeight: 1.2, weight: 700, color: colors.accentText, align: 'center' })
  }

  // Footer text.
  const footerAnchor = align === 'center' ? W / 2 : pad
  const fy = footerTop + pad * 0.9
  const name = clampLines(wrapText(texts.businessName, W - pad * 2, nameSize, 800, measure), 1, W - pad * 2, nameSize, 800, measure)
  ops.push({ kind: 'text', lines: name, x: footerAnchor, y: fy, size: nameSize, lineHeight: 1.25, weight: 800, color: colors.accentText, align })
  if (footerLines) {
    const footer = clampLines(wrapText(texts.footer, W - pad * 2, footerSize, 500, measure), 1, W - pad * 2, footerSize, 500, measure)
    ops.push({ kind: 'text', lines: footer, x: footerAnchor, y: fy + nameSize * 1.25, size: footerSize, lineHeight: 1.4, weight: 500, color: colors.accentText, align })
  }

  return { width: W, height: H, ops }
}
