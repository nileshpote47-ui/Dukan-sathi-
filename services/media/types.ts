/**
 * Media service boundary (Phase 4). The app depends only on these types; image/video
 * provider SDKs live in services/media/providers/* and never reach pages or components.
 * Errors reuse the Phase 3 AIError codes (services/ai/types.ts) so one set of friendly
 * messages covers text and pictures.
 */
import type { AspectRatio } from '@/lib/config/media'
import type { Storyboard } from '@/lib/media/storyboard'

export interface ImageGenerationRequest {
  /** Built only by buildImagePrompt() (services/media/prompts.ts). */
  prompt: string
  aspectRatio: AspectRatio
}

/** Normalized provider output: raw image bytes (validated again before storage). */
export interface ImageGenerationResponse {
  bytes: Uint8Array
  mimeType: string
}

export interface MediaProvider {
  readonly id: string
  readonly model: string
  /** One call, no automatic retries. Throws AIError. */
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse>
}

/**
 * Future video rendering (storyboard → MP4). Phase 4 ships the storyboard and an
 * in-browser preview; no renderer is configured yet, so export shows "Coming soon".
 * A renderer (e.g. a template video service or a generative video API) implements this.
 */
export interface VideoRenderRequest {
  storyboard: Storyboard
  /** Signed URLs of the pictures used by scenes, by media asset id. */
  assetUrls: Record<string, string>
}

export interface VideoRenderer {
  readonly id: string
  render(request: VideoRenderRequest): Promise<{ bytes: Uint8Array; mimeType: string }>
}
