import {
  REEL_DURATION,
  REEL_SCENES,
  SCENE_DURATION,
  type SceneTransition,
  type SceneType,
} from '@/lib/config/media'
import type { AIContentResponse } from '@/services/ai/types'

/*
 * Reel storyboard generator. Turns the Phase 3 reel copy (hook, script, call to action)
 * into a short list of timed scenes a renderer can follow. Deterministic and free: it
 * re-uses the owner's saved copy instead of asking the AI for a new concept.
 */

export interface StoryboardScene {
  /** Stable key for editing/reordering in the UI. */
  id: string
  scene_type: SceneType
  duration_seconds: number
  on_screen_text: string
  voiceover_text: string
  /** Language-independent description of what to show (also the prompt for an AI picture). */
  visual_prompt: string
  transition: SceneTransition
  /** A picture from the owner's media (media_assets.id), or null. */
  asset_id: string | null
}

export interface Storyboard {
  version: 1
  title: string
  hook: string
  language: string
  total_duration: number
  scenes: StoryboardScene[]
}

/** Seconds needed to read/say a text: about 2.5 words per second, plus a moment to look. */
export function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.min(8, Math.max(2, Math.ceil(words / 2.5) + 1))
}

/** Split a script into sentences (also on the Devanagari danda "।"). */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Group sentences into at most `max` chunks of similar length. */
function groupSentences(sentences: string[], max: number): string[] {
  if (sentences.length <= max) return sentences
  const groups: string[][] = Array.from({ length: max }, () => [])
  const perGroup = Math.ceil(sentences.length / max)
  sentences.forEach((s, i) => groups[Math.min(max - 1, Math.floor(i / perGroup))].push(s))
  return groups.filter((g) => g.length).map((g) => g.join(' '))
}

export const sumDurations = (scenes: Pick<StoryboardScene, 'duration_seconds'>[]) =>
  scenes.reduce((total, s) => total + s.duration_seconds, 0)

/** Scale durations so the total stays within the reel limits (8–60 s). */
export function fitDurations<T extends Pick<StoryboardScene, 'duration_seconds'>>(scenes: T[]): T[] {
  const total = sumDurations(scenes)
  if (total >= REEL_DURATION.min && total <= REEL_DURATION.max) return scenes
  const target = total > REEL_DURATION.max ? REEL_DURATION.max : REEL_DURATION.min
  const factor = target / total
  const fitted = scenes.map((s) => ({
    ...s,
    duration_seconds: Math.min(SCENE_DURATION.max, Math.max(SCENE_DURATION.min, Math.floor(s.duration_seconds * factor))),
  }))
  // Rounding: add/remove whole seconds on the longest/last scenes until inside the limits.
  let diff = target - sumDurations(fitted)
  for (let i = fitted.length - 1; diff !== 0 && i >= 0; i = i === 0 ? fitted.length - 1 : i - 1) {
    const next = fitted[i].duration_seconds + Math.sign(diff)
    if (next >= SCENE_DURATION.min && next <= SCENE_DURATION.max) {
      fitted[i] = { ...fitted[i], duration_seconds: next }
      diff -= Math.sign(diff)
    } else if (fitted.every((s) => s.duration_seconds + Math.sign(diff) < SCENE_DURATION.min || s.duration_seconds + Math.sign(diff) > SCENE_DURATION.max)) {
      break
    }
  }
  return fitted
}

const newId = () => globalThis.crypto.randomUUID()

/** Language-independent visual directions (owner text is quoted, never translated). */
function visualFor(type: SceneType, product: string | null): string {
  switch (type) {
    case 'TEXT':
      return 'Bold opening text on a clean, colourful background.'
    case 'PRODUCT':
      return product ? `Close-up of the product "${product}", well lit, on the shop counter.` : 'Close-up of the main product, well lit, on the shop counter.'
    case 'IMAGE':
      return 'Inside the shop: shelves and products, bright and welcoming.'
    case 'BRAND':
      return 'The shop front with its name board clearly visible.'
    case 'CTA':
      return 'Friendly closing shot of the shop counter, ready to welcome customers.'
    case 'VIDEO':
      return 'Short moving shot of the shop.'
  }
}

export interface StoryboardSource {
  title: string
  language: string
  productName: string | null
  businessName: string
  copy: Pick<AIContentResponse, 'reel_hook' | 'reel_script' | 'call_to_action'>
}

/** True when the saved copy has what a storyboard needs. */
export const hasReelCopy = (copy: AIContentResponse | null | undefined): boolean =>
  Boolean(copy?.reel_hook?.trim() && copy?.reel_script?.trim())

export function buildStoryboard(source: StoryboardSource): Storyboard {
  const hook = source.copy.reel_hook?.trim() ?? ''
  const cta = source.copy.call_to_action?.trim() ?? ''
  const sentences = splitSentences(source.copy.reel_script ?? '')

  // Hook + script scenes + brand + CTA, within 3–8 scenes in total.
  const fixed = 1 + (cta ? 1 : 0)
  const brand = sentences.length <= REEL_SCENES.max - fixed - 1 ? 1 : 0
  const scriptParts = groupSentences(sentences, REEL_SCENES.max - fixed - brand)

  const scenes: StoryboardScene[] = []
  scenes.push({
    id: newId(),
    scene_type: 'TEXT',
    duration_seconds: Math.min(4, estimateDuration(hook)),
    on_screen_text: hook,
    voiceover_text: hook,
    visual_prompt: visualFor('TEXT', source.productName),
    transition: 'cut',
    asset_id: null,
  })
  scriptParts.forEach((part, i) => {
    const type: SceneType = i === 0 && source.productName ? 'PRODUCT' : 'IMAGE'
    scenes.push({
      id: newId(),
      scene_type: type,
      duration_seconds: estimateDuration(part),
      // On-screen text stays short; the full sentence is the voice-over.
      on_screen_text: part.length > 90 ? `${part.slice(0, 87).replace(/\s+\S*$/, '')}…` : part,
      voiceover_text: part,
      visual_prompt: visualFor(type, source.productName),
      transition: 'fade',
      asset_id: null,
    })
  })
  if (brand) {
    scenes.push({
      id: newId(),
      scene_type: 'BRAND',
      duration_seconds: 2,
      on_screen_text: source.businessName,
      voiceover_text: '',
      visual_prompt: visualFor('BRAND', source.productName),
      transition: 'slide',
      asset_id: null,
    })
  }
  if (cta) {
    scenes.push({
      id: newId(),
      scene_type: 'CTA',
      duration_seconds: Math.max(3, estimateDuration(cta)),
      on_screen_text: cta,
      voiceover_text: cta,
      visual_prompt: visualFor('CTA', source.productName),
      transition: 'fade',
      asset_id: null,
    })
  }
  // Very short copy: make sure there are at least 3 scenes.
  while (scenes.length < REEL_SCENES.min) {
    scenes.splice(scenes.length - (cta ? 1 : 0), 0, {
      id: newId(),
      scene_type: 'BRAND',
      duration_seconds: 3,
      on_screen_text: source.businessName,
      voiceover_text: '',
      visual_prompt: visualFor('BRAND', source.productName),
      transition: 'slide',
      asset_id: null,
    })
  }

  const fitted = fitDurations(scenes)
  return {
    version: 1,
    title: source.title,
    hook,
    language: source.language,
    total_duration: sumDurations(fitted),
    scenes: fitted,
  }
}
