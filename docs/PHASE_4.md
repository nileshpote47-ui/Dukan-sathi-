# Phase 4 — Media / Reel / Video Engine

## Objective
Turn the owner's existing content (Phase 2) and AI copy (Phase 3) into visual marketing assets — posters and social creatives — and into structured short-form reel storyboards, with secure private storage. Template-based composition and provider abstractions come first; no paid video API is required. No publishing, billing or credits.

## Architecture
```
Content item (Phase 2) + saved AI copy (Phase 3) + business profile
   │
   ├─ Poster:  /dashboard/content/[id]/poster
   │     posterDefaults() ── texts only from the owner's data (lib/media/poster-defaults.ts)
   │     PosterEditor ──── template (Phase 2 slug) → size → texts → picture → live preview
   │     layoutPoster() ── pure layout engine (lib/media/poster-layout.ts) → drawn on <canvas>
   │     savePoster ────── Server Action: session, ownership, spec validation, file inspection,
   │                        exact size check → storage (private) → media_assets (POSTER, TEMPLATE_RENDERED)
   │
   ├─ Picture: PicturePicker → uploadPicture (UPLOAD) or generatePicture (AI_GENERATED)
   │     buildImagePrompt() ── services/media/prompts.ts (visuals only, no text/prices in pictures)
   │     generateMarketingImage() ── services/media/service.ts (one call, output validated, metadata logs)
   │     getMediaProvider() ── MEDIA_PROVIDER: GeminiImageProvider | MockMediaProvider
   │
   └─ Reel:    /dashboard/content/[id]/storyboard   (REEL items)
         generateStoryboard ── Server Action: buildStoryboard() from the SAVED reel copy (no AI call)
         StoryboardEditor ── edit text/voice-over/visual, duration, type, transition, order, picture
         ReelPreview ─────── 9:16 in-browser playback of scenes (no video file)
         saveStoryboard ──── validated (3–8 scenes, 8–60 s, owned pictures) → content_items.storyboard
```

| File | Responsibility |
|---|---|
| `lib/config/media.ts` | Asset types/sources/statuses, MIME types, bucket, size limits, aspect ratios, reel limits, scene types |
| `lib/config/poster-templates.ts` | Visual layouts keyed by the Phase 2 `content_templates` slugs (+ `basic`) |
| `lib/media/poster-layout.ts` | Pure template composition → draw operations (wrapping, Devanagari-safe breaks, fitting) |
| `lib/media/poster-defaults.ts` | Poster texts from saved copy, content request and business profile |
| `lib/media/storyboard.ts` | Reel storyboard generator (hook → script scenes → brand → CTA, timed) |
| `lib/media/image-file.ts` | Server-side PNG/JPEG/WebP detection and dimensions from file bytes |
| `lib/media/browser-image.ts` | Browser-only: resize photos before upload, export the poster canvas |
| `lib/data/media.ts` / `lib/services/media.ts` | Owner-filtered reads (signed URLs) / writes (storage + rows, generation lock) |
| `lib/validation/media.ts` | Zod schemas: poster spec, picture generation, storyboard, list params |
| `services/media/*` | `MediaProvider` + `VideoRenderer` interfaces, prompts, provider selection, service, providers |
| `app/dashboard/media/*` | Library, asset detail, Server Actions (upload, save poster, generate picture, delete) |
| `app/dashboard/content/[id]/{poster,storyboard}` | Poster editor, reel storyboard (+ actions) |
| `components/media/*` | PosterCanvas, PosterEditor, PicturePicker, StoryboardEditor, ReelPreview, badges, buttons |

## Reuse of earlier phases
- **Templates:** the 7 Phase 2 templates (Product Showcase, Special Offer, New Arrival, Festival Offer, Customer Attraction, Educational, Limited Time Offer) are the visual template list — names/descriptions come from `content_templates`; each slug gets a declarative layout. No second template table.
- **AI:** pictures reuse the Phase 3 key (`GEMINI_API_KEY`), `AIError` codes, Gemini error mapping and friendly messages, and `buildMarketingContext()`. Copy stays in the Phase 3 text workflow; image prompts describe visuals only. Storyboards are built from the saved Phase 3 reel copy without a new AI call.
- **Auth/ownership:** every page and Server Action uses `requireOnboardedBusiness()` / `getContentItem()`; RLS as in earlier phases.

## Storage architecture
- One **private** Supabase Storage bucket `business-media` (3.5 MB limit; PNG/JPEG/WebP only), created by migration.
- Objects live at `<owner_id>/<random uuid>.<ext>`; storage RLS lets a user read, upload and delete **only inside their own folder**. No update policy (files are never overwritten).
- Pages show files through **signed URLs** (1 hour) created on the server for the owner's own READY assets; downloads use a signed URL with a download file name.
- Uploads and posters go through Server Actions (body limit 4 MB, `next.config.ts`); the server checks the real type and dimensions from the bytes, never the file name or browser type. Posters must be exactly the size of the chosen ratio.
- If saving the row fails, the uploaded file is removed again.

## Database (migrations)
| Migration | Change |
|---|---|
| `20261118202852_media_engine.sql` | `media_assets` table + RLS; `content_items.storyboard` (object ≤ 32 KB, REEL only); bucket + storage policies |
| `20261118203349_media_generation_lock.sql` | Unique partial index: one `GENERATING` asset per owner (no duplicate provider calls) |
| `20261119003500_media_assets_business_owner_index.sql` | Index for the (business_id, owner_id) foreign key |

`media_assets`: id, business_id + owner_id (composite FK to the owner's business), content_item_id (optional, `on delete set null`), asset_type (`IMAGE`, `POSTER`), source_type (`UPLOAD`, `AI_GENERATED`, `TEMPLATE_RENDERED`), status (`GENERATING`, `READY`, `FAILED`), storage_path (must start with `owner_id/`), mime_type, width, height, file_size, provider, model, metadata (poster spec / generation summary, ≤ 8 KB), timestamps.
Rules in the database: READY needs a stored file; ownership, type and file cannot change; a status other than GENERATING cannot change (a failed generation is never marked READY).
Not created on purpose: video/audio asset types (no renderer yet), separate storyboard/scene tables (scenes are edited and saved as one validated document on the REEL item), duration column (no video files).

## RLS
`media_assets`: select/update/delete only `owner_id = auth.uid()`; insert only for the user's own business and, if linked, the user's own content in that business (`WITH CHECK` on insert and update). `anon` has no access. Storage policies as above. pgTAP: `supabase/tests/database/media.test.sql` (22 checks).

## Media provider abstraction
```ts
interface MediaProvider {
  readonly id: string
  readonly model: string
  generateImage(request: { prompt: string; aspectRatio: AspectRatio }): Promise<{ bytes: Uint8Array; mimeType: string }>
}
interface VideoRenderer { render(request: { storyboard; assetUrls }): Promise<{ bytes; mimeType }> } // none configured yet
```
- `MEDIA_PROVIDER=gemini` → `GeminiImageProvider` (`@google/genai`, `responseModalities: ['IMAGE']`, `imageConfig.aspectRatio`, no retries, 50 s timeout; 4:5 is requested as 3:4 and cropped by the template). `MEDIA_PROVIDER=mock` → deterministic PNGs with failure simulation (refused in production). Unset → AI pictures are off; posters (templates + uploaded photos) and storyboards work fully.
- `generateMarketingImage()` validates the returned bytes like an upload; malformed/empty output becomes an error and the asset is marked FAILED.
- Adding a provider: one file in `services/media/providers/` + one case in `services/media/provider.ts`.

### Image prompts
`buildImagePrompt()` includes SUBJECT (owner's product/title, quoted), optional SCENE DIRECTION (quoted), SETTING (category + place), VISUAL STYLE, COMPOSITION (space for template text), ASPECT RATIO and RULES: no words, letters, numbers, prices, logos, signs or brand names; nothing the owner did not mention (no certificates, awards, discounts or special features). Owner text is quoted so it cannot override the rules.

## Poster workflow
Open content → **Create poster** → design (template) → size (1:1, **4:5 default**, 9:16, 16:9) → review/edit text → optional picture (none / own picture / upload / AI) → live preview (the exact file) → **Save poster** → media detail → **Download**, **Make another version** (re-opens the saved settings) or Delete.
- Texts: headline/body/CTA from the saved AI copy, else from the request; badge only from the owner's own price or short offer (never invented); footer = business name + place/phone from the profile.
- Layout: headline up to 3 lines, body up to 5, CTA up to 2; text shrinks to fit and is clamped with "…" rather than overflowing; long Devanagari words break between whole letters. The browser canvas shapes Marathi/Hindi correctly (server-side PNG renderers often do not).
- Logo: the profile only has an external logo URL, which cannot be drawn safely (cross-origin); not used (see limitations).

## Reel storyboard
Format 9:16. Generated from the saved reel copy: TEXT scene (hook), PRODUCT/IMAGE scenes (script sentences, split also on "।", grouped into at most the available slots), a BRAND scene (business name) when there is room, and a CTA scene. Durations: about 2.5 words/second + 1 s (2–8 s per scene), then fitted to 8–60 s. 3–8 scenes. Each scene: type, duration (1–15 s), on-screen text, voice-over, visual direction (language-independent; also the AI-picture prompt), transition (cut/fade/slide), optional picture. Edits: text, duration (±1 s), type, transition, reorder, add/remove (within 3–8), assign picture. Preview: play/pause/replay with progress per scene. Save validates limits and that every picture is the owner's own READY picture. **Video file export: Coming soon** (no renderer configured). Nothing is published.

## Asset management
`/dashboard/media` (Media in the menu): grid of the owner's assets with thumbnail (lazy, signed), type (+ AI), status if not ready, linked content, date; filter All / Pictures / Posters; pagination (24); Upload photo. Detail: preview, details (type, source, shape, size, file size, provider, date, linked content), Download, Make another version (posters), Delete (confirmation; removes the file). Content detail: "Posters & media" card with Create poster, reel storyboard link + summary, and thumbnails of linked media.

## Security
- Server-side everywhere: session + owner's own business per action; client `owner_id`/`business_id` are never accepted (stripped by Zod); content and picture ids are checked against the owner.
- Private bucket, owner-folder storage policies, signed URLs only for the owner's files, no public URLs; other users' ids look "not found".
- File checks by content (magic bytes + dimensions), size limits in app, bucket and database.
- Provider secrets server-only; logs contain provider, model, ratio, size, error code and duration — never prompts, pictures or keys.

## Cost controls
- Pictures are generated only by an explicit button press; nothing on page load (tested). Buttons lock while running (ref guard) and the database allows only one `GENERATING` picture per owner, so double clicks or a second tab cannot start a second paid call. Stale generations (> 3 min) are marked FAILED.
- One provider call per press, no automatic retries, prompt size limit, 50 s timeout.
- Storyboards use no AI call. No video API at all.
- Automated tests use mock providers only.

## Phase 3 compatibility fixes (minimal)
Real reel-script requests to Gemini kept ending in Google's 504 deadline while other types answered in ~3 s. Changes: one-line values and one-paragraph reel scripts in the prompt, `maxLength` on every schema string, `thinkingLevel MINIMAL`, `maxOutputTokens 1024`, token-count logging (no text). The poster CTA now wraps to two lines (seen cut short on a real poster).

## Testing
| Suite | Result |
|---|---|
| Unit (Vitest) | 107 / 107 — incl. file inspection (PNG/JPEG/WebP, fake images, limits), poster layout (all templates × sizes × picture/no picture inside the canvas, no invented badge, shrinking/clamping, Devanagari-safe wrapping, two-line CTA), poster defaults, validation (unknown templates/sizes, stripping owner_id), storyboard (3–8 scenes, 8–60 s, hook/CTA, danda splitting, recomputed totals), image prompt rules, mock provider failures, Gemini image provider with a fake client, media config, media service (malformed/empty output never ready), config ↔ database sync |
| Database (pgTAP) | `media.test.sql` 22 / 22 (bucket private; own media ok; other user's content/business/identity refused; owner folder; READY needs file; unsupported types; cross-user read/update/delete; file swap; one generation at a time; FAILED never READY; storyboard REEL-only and owner-only; storage read/upload isolation; anon). Regression: content 31 / 31, ai 8 / 8 |
| End-to-end (Playwright, mock providers, phone viewport, real Supabase) | 5 Phase 4 tests (poster journey incl. AI picture, 4:5, save, download, new version 9:16, library filters; reel journey incl. edit, duration, upload/assign, preview, save, reload; provider failure → FAILED never READY, fake file refused, delete failed item; cross-user API/storage/pages; delete with file removal) + 21 Phase 1–3 regression = 26 / 26 |
| Real-world (production, real Gemini text) | See below |

## Real-world checks
Run on the deployed app (https://dukan-sathi-nine.vercel.app) through the real UI on a phone viewport, 2026-11-19. Copy was written by real Gemini in the Phase 3 flow (`gemini-3.5-flash` for the grocery and salon cases; `gemini-3.5-flash-lite` for the reel, see below), saved, then turned into media.

| Scenario | Result |
|---|---|
| Grocery (Shree Ganesh Kirana), OFFER, Marathi, Local → poster 4:5 → preview → save | **Pass.** Special Offer template preselected, 4:5, 1080 × 1350 PNG saved and downloaded. Marathi rendered correctly (conjuncts and matras). Badge `₹90/kg` = the owner's own price; no other price, discount or claim added. |
| Salon (Glow Salon), POST, English, Premium → social creative 1:1 → preview → save | **Pass.** 1080 × 1080 PNG saved and downloaded; polished English; no badge (no price given), no invented offer. Found and fixed: a long call to action was cut short on one line; it now wraps to two lines. |
| Mobile shop (Sai Mobile Point), REEL, Hindi, Energetic → storyboard → 3–8 scenes → edit one → preview | **Pass.** Real Gemini (`gemini-3.5-flash-lite`, 1.5 s, 88 output tokens, no thinking) wrote a natural Hindi hook, script and CTA using only the shop name and place — no price, brand, specification or claim invented. Storyboard: 6 scenes (hook, product, 2 × picture, brand, CTA), 26 s; scene text edited; preview played; saved. Before the model change, `gemini-3.5-flash` failed this request 3 × with Google's 504 deadline (~44 s) and 3 × with 503 "high demand" (handled safely: friendly message, no retry). The storyboard step was also verified on production with a hand-written script. |


## Known limitations
- No video file rendering: the storyboard and preview are the deliverable; export shows "Coming soon" (`VideoRenderer` interface ready).
- AI pictures are off in production unless `MEDIA_PROVIDER` is set; image models may need a paid Gemini tier. Posters work without them.
- Logo not drawn (the profile stores an external URL; a logo upload belongs to a later profile change).
- Poster text uses device fonts; very old phones without Devanagari fonts may render poorly.
- One poster per save; no folders, tags or version history (by design).
- Signed URLs expire after 1 hour (reload the page to refresh).
- Uploads/posters are limited to 3.5 MB (Vercel request limit).

## Future provider integration
- Image: add `providers/<name>.ts` implementing `MediaProvider` (e.g. Imagen, OpenAI images) + a case in `provider.ts`.
- Video: implement `VideoRenderer` (template video service or a generative video API) that reads the storyboard and signed asset URLs; add `VIDEO` (and `AUDIO` for voice-over) to the asset types with a migration and a `duration_seconds` column.
- Publishing (Phase 6) can use media assets and storyboards without schema changes.
