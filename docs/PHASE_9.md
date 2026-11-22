# Phase 9 — UX Refresh & AI Studio

Requested after launch readiness (Phase 8). Based on a study of a comparable creator tool's interaction patterns (not its brand or visuals) and of Dukaan Sathi's own screens. The study and an interactive mockup were shared as a separate page.

| Stage | Scope | Status |
|---|---|---|
| 1 | Dashboard composer, one-tap AI from the content page, grouped navigation, attention bell, Devanagari fonts, illustrated tool cards | **COMPLETED** (2026-11-21) |
| 2 | "Ideas for today" (festival calendar + ideas per business category), weekly progress from real data, real poster-template previews | **COMPLETED** (2026-11-22) |
| 3a | **Direct poster**: AI designs the whole poster with the owner's own lines (GPT Image 2.6 Sunburst) | **COMPLETED** (2026-11-21) |
| 3b | Reel voiceover (Sarvam Bulbul) · free stock photos (Pixabay — Pexels stopped issuing keys) | **COMPLETED** (2026-11-22) |

## Stage 1 — what changed

### Dashboard: "What shall we make today: a reel, a poster or a WhatsApp status?"
- The page opens with one question and a composer (`components/dashboard/composer.tsx`): the owner writes one sentence in their own words or taps an example (Diwali offer, new stock, festival wishes, home delivery; text in en/mr/hi), chooses what it becomes (Reel script / Poster text / WhatsApp / Post / Offer / Festival) and the language on cards that show a sample line in that language.
- **Make it** runs `quickCreateWithAI` (`app/dashboard/content/ai-actions.ts`): validates (`quickCreateSchema`), creates a draft (title = first clause of the sentence, `lib/content/quick-title.ts`; the full sentence is kept as the description, word for word), then one AI generation through the shared `generateCopy` (`lib/services/ai-content.ts`: own business resolved on the server, plan limit + burst limit via `withUsage`). The owner lands on the content page with a "Your post is ready" confirmation. If the AI step fails (limit reached, provider down) the draft is kept and the message links to it.
- Remaining AI posts this month are shown under the heading and next to the button (from the Phase 5 usage summary; nothing is estimated).
- Below: a compact profile-completion strip, illustrated tool cards, recent content, content counts, and the plan with usage folded into "See this month's usage".

### Content page: Write with AI
- Content without AI copy shows **Write with AI** directly (`components/ai/write-with-ai-button.tsx` → `writeCopyForContent`): one explicit tap, metered like every generation, refuses to overwrite existing copy (Edit is still the place for new versions).

### Navigation
- Sidebar grouped into Create content / Reach customers / My shop (`NAV_GROUPS`, `lib/config/navigation.ts`), active item filled, the business card at the bottom (desktop and the phone "More" sheet).
- **Attention bell** (desktop sidebar and phone header) counts posts that failed in the last 7 days and accounts to reconnect (`getAttentionSummary`, head-only counts as the owner under RLS) and links to them; with nothing to do it says so.

### Look and feel
- Self-hosted Mukta (text) and Baloo 2 (headings) via `@fontsource` — both cover Latin and Devanagari, no external font requests; system fonts remain the fallback.
- New theme tokens (`--accent-foreground`, `--rose(-soft)`, `--indigo(-soft)`, light and dark) for illustrated tool cards; buttons and cards give press/hover feedback; `prefers-reduced-motion` respected globally.
- The shared AI generation code was moved out of the edit-page action into `lib/services/ai-content.ts`, so all three entry points behave identically.

### i18n
33 new strings in English, Marathi and Hindi (composer, examples, quotas, navigation groups, attention, Write with AI).

## Tests
- Unit: composer title + form input accepted by the content schema for every type and language, composer validation (strips client-supplied owner ids), example/language translations in en/mr/hi, navigation grouping (`tests/unit/hardening.test.ts`).
- E2E (`tests/e2e/experience.spec.ts`, mock AI): example sentence → Marathi offer with AI copy and the owner's words kept; Write with AI on the content page; grouped navigation, business card and bell, no horizontal scroll. Full regression: 52/52 end-to-end tests passed on the final build.

## Not changed
No database migration; no new environment variables; no new paid API. AI still runs only on an explicit tap, through the existing provider, limits and logging.

## Stage 2 — Ideas for today, this week, template previews

### Ideas for today (dashboard, above the composer)
- Up to two **upcoming festivals** within 21 days (`ideasForToday()`, `lib/ideas/today.ts`) from a curated calendar (`lib/config/festivals.ts`: Christmas 2026 → Diwali 2027, dates checked against published 2027 calendars; Dhanteras only for shops that sell gold, clothes, electronics or tools). Badge "Today / Tomorrow / In N days".
- Then two **everyday ideas** for the shop's group (grocery, mobile, fashion, agri, food, services, general; 4 per group), rotated by date so the dashboard changes daily.
- Tapping a card fills the composer with a ready sentence and the matching type (Offer, Festival, WhatsApp, Reel…), focuses it, and the owner edits and presses **Make it**. No AI call, no database, no cost until then.
- Text in English, Marathi and Hindi (`ideas.*`, `festival.*`).
- After `CALENDAR_COVERS_UNTIL` (2027-10-31) only everyday ideas show; extend the list yearly.

### This week
- Monday–Sunday in IST: a filled day when content was created, plus "N made · M published" (`getWeeklyProgress()`, `lib/data/progress.ts`, owner-filtered; published = publishing jobs with status PUBLISHED). Empty week → nudge to use an idea. No goals or streaks are invented.

### Real template previews
- In the poster editor each template card is a small (¼ size) real rendering by the same canvas code, with the owner's current lines and picture (`PosterCanvas scale`). Decorative for screen readers; the card keeps the template name.

### Tests
Unit `tests/unit/ideas.test.ts` (12): calendar dates valid/ordered/unique/in range, types and groups valid, every name/idea in en/mr/hi, look-ahead and ordering, festival day included and past excluded, group filter, daily rotation, after-calendar fallback, translated cards, IST week and day marking. E2E: ideas fill the composer and "This week" counts the content made (`experience.spec.ts`); each template card contains a canvas (`media.spec.ts`). Runs: unit 226/226; E2E 48/48 across experience, media, foundation, content, AI, direct poster, hardening, publishing and analytics.

## Stage 3b — Reel voiceover

**What the owner sees.** On the reel storyboard page, under the editor: **Voiceover**. The owner picks a female or male voice and taps **Make voiceover**: the voiceover lines they wrote in the saved storyboard are read aloud in the reel's language (Marathi, Hindi or English). The MP3 plays together with the preview (Play starts it from the same second) and can be downloaded. **Make a new voiceover** replaces it (uses one more).

**Voice choice.** OpenAI voices (gpt-4o-mini-tts, gpt-audio) were tried first; the owner found the Marathi pronunciation not native. Sarvam AI's Bulbul v3 (built for Indian languages) was chosen after the owner listened to samples. Voices: `priya` (female), `rahul` (male) — `VOICES` in `lib/config/voiceover.ts`. Price: ₹3 per 1,000 characters (a typical reel ≈ 150–300 characters ≈ ₹0.5–1). Commercial use of generated audio is licensed by Sarvam when credits are consumed (including free credits).

**How it works**
- `generateVoiceoverAction` (`app/dashboard/content/[id]/storyboard/actions.ts`): session → `voiceoverRequestSchema` (only item + voice) → the item's SAVED storyboard → `voiceoverText()` (owner lines, scene order, word for word) → `withUsage('voiceover')` (plan limit + burst limit 10 per 10 min) → `generateVoiceover()` → MP3 checked by content (`isMp3`) → `saveVoiceover()` uploads to `<owner_id>/voiceovers/<content_id>/<uuid>.mp3`, stores `{path, voice, language, chars, created_at}` on `content_items.voiceover`, removes the previous file. Any failure releases the credit; the provider is called once, no retries.
- Provider: `SarvamVoiceProvider` (`services/voice/providers/sarvam.ts`, plain HTTPS, `api-subscription-key` header, `bulbul:v3`, MP3, number/price normalisation on; safe error codes, 402 = credits used up). `getVoiceConfig()`: `sarvam` when `SARVAM_API_KEY` is set; `mock` for tests, refused in production.
- Deleting a reel also removes its voiceover file.

**Database.** Migration `20261122055753_voiceover.sql`: feature `voiceover` (check constraints, `billing_reserve_for`), limits Free 3 / Starter 20 / Growth 50 / Premium 100; `content_items.voiceover` (reels only, path must be inside the owner's own `voiceovers/` folder); bucket accepts `audio/mpeg`.

**Tests.** Unit `tests/unit/voiceover.test.ts` (12): owner lines only, request accepts only item + voice, record shape, Sarvam request/header/MP3 + error mapping (key never in messages), provider selection (mock refused in production), MP3 check by content, texts in en/mr/hi. pgTAP `voiceover.test.sql` 10/10 on the live database (rolled back): limits, MP3 allowed, own-folder and reels-only constraints, reserve/release/commit, isolation. E2E (`media.spec.ts`): write a line → save → make (female) → plays/downloads → new version (male) replaces the file → other owner cannot read it; ran with the mock voice and once with real Sarvam (2 real calls, 1.3–2.8 s).

## Stage 3b — Free stock photos (Pixabay)

**Why Pixabay.** Pexels (planned) stopped issuing new API keys in November 2026. Pixabay is free, allows commercial use without attribution, and requires apps to download photos to their own server instead of hotlinking, which matches how Dukaan Sathi stores pictures.

**What the owner sees.** In every picture picker (poster editor, each reel scene) a **Free photos** button opens a search box with suggestions for the shop's category (labels in Marathi/Hindi/English, e.g. मसाले → "indian spices"; Pixabay searches only in English). Tapping a photo saves it to the owner's pictures and selects it. "Free photos from Pixabay" is shown with results; the media page shows "Free photo (Pixabay)" and the photographer.

**How it works**
- `searchStockPhotosAction` → `stockSearchSchema` → burst limit (30 per 5 min) → `searchStockPhotos()` (cached 24 h by provider + query + page with `unstable_cache`; the key is never in the cache key or logs).
- `saveStockPhotoAction` → `stockSaveSchema` (only the numeric photo id + optional own content item) → burst limit (20 per 10 min) → `downloadStockPhoto()` looks the photo up again by id and downloads the 1280 px version only from `pixabay.com`/`cdn.pixabay.com` → `validateImage()` → `storeMedia({ sourceType: 'STOCK', metadata.stock: {provider, photo_id, photographer, page_url} })`.
- Not metered (the photos are free); search grid previews are the provider's URLs, shown only while searching, as Pixabay allows.
- Migration `20261122061947_stock_photos.sql`: `media_assets.source_type` allows `STOCK`.

**Tests.** Unit `tests/unit/stock.test.ts` (8): request parameters (English, photos only, safe search), off-host results dropped, download by id only and only from Pixabay hosts (no metadata/IP hosts), error mapping without the key, provider selection (mock refused in production), input accepts only a numeric id, mock images pass the file check, suggestions + texts in en/mr/hi. E2E (`media.spec.ts`, mock provider): open → suggestion → more → tap → saved as STOCK with the photographer, linked to the content, shown on the media page. Full media suite 7/7.

## Stage 3a — Direct poster (AI designs the whole poster)

**What the owner sees.** On the poster page, under the template preview: "Or let AI design the whole poster". It uses the same lines (headline, message, badge, call to action, shop name, place/phone), size and style the owner already chose. **Design with AI** makes one poster in about 30 seconds; the owner must tick "I checked the spelling, the price and the offer" before **Use this poster**. "Make another version" uses one more credit. A poster that was not confirmed shows the same check on its media page.

**Model test before building** (8 posters, 4 shops, Marathi and Hindi): GPT Image 2.6 Sunburst and Flare both wrote every line, price and offer exactly; Sunburst chosen (~$0.04 vs $0.07–0.16 per poster). One real poster made through the app afterwards was also exact (29 s, 4:5).

**How it works**
- `generateDirectPosterAction` (`app/dashboard/media/actions.ts`): own business resolved on the server → validation (`directPosterSchema`) → plan limit `direct_poster` + burst limit (6 per 10 min) → `startGeneration` (POSTER, one at a time per owner) → `generateDirectPoster()` → `finishGeneration` → commit; any failure releases the credit and marks the asset FAILED.
- Prompt: `buildDirectPosterPrompt()` (`services/media/prompts.ts`) lists the owner's non-empty lines, quoted as data, and tells the model to write exactly those and nothing else (no translation, no added numbers, logos or claims). Ordinary AI pictures keep the "no text in the image" rule.
- Provider: `OpenAIImageProvider` (`services/media/providers/openai.ts`, plain HTTPS, no SDK, one call, 110 s timeout, safe error codes; the key is never logged). Selected by `getDirectPosterConfig()`; `mock` for tests, refused in production.
- Size: the model draws at 1024×1024 / 1024×1536 / 1536×1024; `padToAspect()` (`lib/media/fit-aspect.ts`) fits the whole poster inside 1080×1080, 1080×1350, 1080×1920 or 1920×1080 on a blurred copy of itself — never cropped, so no text is cut — and saves JPEG.
- Safety: stored with `metadata.reviewed = false`; `needsReview()` keeps it out of the publish picker and `createPublication` refuses it on the server until `confirmDirectPosterAction` sets `reviewed = true`.

**Billing.** Migration `20261121145815_direct_poster.sql`: feature `direct_poster` (check constraints, `billing_reserve_for`), entitlements Free 3 / Starter 30 / Growth 70 (owner's decision). Full Growth use ≈ ₹250/month at current prices.

**Tests.** Unit (`tests/unit/direct-poster.test.ts`, 8): owner lines verbatim in the prompt, visuals-only rule kept for pictures, input validation, OpenAI request/key/error mapping, provider selection (mock refused in production), padding to each size, publishing hold. pgTAP (`direct_poster.test.sql`, 9/9 on the live database, rolled back): limits per plan, reserve/commit/release, limit refused, isolation. E2E (`tests/e2e/direct-poster.spec.ts`, mock provider): make → must tick → use; unconfirmed poster asks for the check on its media page. Real OpenAI run through the app: exact Marathi text.

## Premium plan (owner's request, 2026-11-21)

₹999/month, listed after Growth (migration `20261121160050_premium_plan.sql`). Limits chosen for value against AI cost: features that cost almost nothing per use are generous; the two that cost real money (~₹3.5 each) are capped so even a month of full use stays within the price.

| Feature | Free | Starter ₹199 | Growth ₹499 | **Premium ₹999** |
|---|---|---|---|---|
| AI texts | 30 | 200 | 600 | **1500** |
| AI-designed posters | 3 | 30 | 70 | **120** |
| AI pictures | 3 | 20 | 60 | **80** |
| Saved posters | 10 | 100 | 300 | **1000** |
| Reel storyboards | 5 | 30 | 100 | **200** |
| Posts / WhatsApp sends | 10 | 60 | 200 | **600** |

Payment: Razorpay (test mode) monthly plan of ₹999 created and set as `RAZORPAY_PLAN_PREMIUM` in Vercel (production + preview) on 2026-11-22; the amount is always re-checked against the database at checkout. Verified end to end on production (test mode): Mastercard test card → Razorpay subscription → signed webhook → Premium ACTIVE with one captured payment. Production cleanup after testing: temporary e2e admin and mock webhook secret removed. Tests: unit (plan order, Razorpay mapping), config-sync (every plan seeded with every feature), pgTAP `premium_plan.test.sql`, pricing e2e.
