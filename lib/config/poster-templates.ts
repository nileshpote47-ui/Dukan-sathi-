/*
 * Visual layouts for posters and social creatives.
 *
 * Reuses the Phase 2 template system: each layout is keyed by the slug of a row in
 * `content_templates` (name, description, categories and languages come from there),
 * plus `basic` for content without a template. The layout data is declarative —
 * colours, where the picture goes, decoration, text sizes — and is drawn by
 * lib/media/poster-layout.ts. Nothing here depends on a business name or language.
 * tests/unit/config-sync.test.ts checks that every seeded template has a layout.
 */

export type PhotoPlacement = 'top' | 'full'
export type Decoration = 'none' | 'circles' | 'stripes' | 'rays' | 'frame'

export interface PosterLayoutDefinition {
  /** Where an optional picture goes. Without a picture the decoration fills its place. */
  photo: PhotoPlacement
  align: 'left' | 'center'
  decoration: Decoration
  /** Headline size in % of the shorter side. */
  headlineSize: number
  colors: {
    /** Background gradient (top → bottom). */
    background: [string, string]
    text: string
    muted: string
    accent: string
    accentText: string
  }
}

export const BASIC_LAYOUT_SLUG = 'basic'

export const POSTER_LAYOUTS: Record<string, PosterLayoutDefinition> = {
  [BASIC_LAYOUT_SLUG]: {
    photo: 'top',
    align: 'left',
    decoration: 'circles',
    headlineSize: 8,
    colors: { background: ['#ffffff', '#f1f5f9'], text: '#0f172a', muted: '#475569', accent: '#0f766e', accentText: '#ffffff' },
  },
  'product-showcase': {
    photo: 'top',
    align: 'left',
    decoration: 'circles',
    headlineSize: 8,
    colors: { background: ['#ffffff', '#ecfdf5'], text: '#0f172a', muted: '#334155', accent: '#0f766e', accentText: '#ffffff' },
  },
  'special-offer': {
    photo: 'top',
    align: 'center',
    decoration: 'stripes',
    headlineSize: 8.5,
    colors: { background: ['#fff7ed', '#ffedd5'], text: '#431407', muted: '#7c2d12', accent: '#ea580c', accentText: '#ffffff' },
  },
  'new-arrival': {
    photo: 'full',
    align: 'left',
    decoration: 'circles',
    headlineSize: 8.5,
    colors: { background: ['#4c1d95', '#1e1b4b'], text: '#ffffff', muted: '#e9d5ff', accent: '#a855f7', accentText: '#ffffff' },
  },
  'festival-offer': {
    photo: 'top',
    align: 'center',
    decoration: 'rays',
    headlineSize: 8.5,
    colors: { background: ['#7f1d1d', '#b45309'], text: '#fff7ed', muted: '#fde68a', accent: '#facc15', accentText: '#422006' },
  },
  'customer-attraction': {
    photo: 'full',
    align: 'center',
    decoration: 'stripes',
    headlineSize: 9.5,
    colors: { background: ['#1e3a8a', '#0f172a'], text: '#ffffff', muted: '#bfdbfe', accent: '#facc15', accentText: '#1e293b' },
  },
  educational: {
    photo: 'top',
    align: 'left',
    decoration: 'frame',
    headlineSize: 7,
    colors: { background: ['#f8fafc', '#e0f2fe'], text: '#0c4a6e', muted: '#334155', accent: '#0284c7', accentText: '#ffffff' },
  },
  'limited-time-offer': {
    photo: 'top',
    align: 'center',
    decoration: 'stripes',
    headlineSize: 8.5,
    colors: { background: ['#111827', '#1f2937'], text: '#f9fafb', muted: '#d1d5db', accent: '#ef4444', accentText: '#ffffff' },
  },
}

export function getPosterLayout(slug: string | null | undefined): PosterLayoutDefinition {
  return (slug && POSTER_LAYOUTS[slug]) || POSTER_LAYOUTS[BASIC_LAYOUT_SLUG]
}

export const isPosterLayoutSlug = (slug: string) => Object.hasOwn(POSTER_LAYOUTS, slug)
