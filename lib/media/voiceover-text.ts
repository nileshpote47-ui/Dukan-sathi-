import type { Storyboard } from './storyboard'

/** The owner's voiceover lines from the saved storyboard, in scene order, word for word (one line per scene). */
export function voiceoverText(storyboard: Pick<Storyboard, 'scenes'>): string {
  return storyboard.scenes
    .map((scene) => scene.voiceover_text.trim())
    .filter(Boolean)
    .join('\n')
}
