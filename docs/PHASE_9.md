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
- Picking a photo: the owner's browser downloads the 1280 px version (fallback: the preview size) from Pixabay — Pixabay answers 429 to downloads from Vercel's shared server addresses but allows browser downloads (CORS `*`) — resizes it like any upload and sends it to `saveStockPhotoAction` → `stockSaveSchema` (numeric photo id + optional own content item) → burst limit (20 per 10 min) → `validateImage()` (checked by content) → `lookupStockPhoto()` confirms the id with Pixabay and supplies the photographer and page (never taken from the browser) → `storeMedia({ sourceType: 'STOCK', metadata.stock: {provider, photo_id, photographer, page_url} })`.
- Found in the live test: the first version downloaded on the server and got HTTP 429 from Pixabay on Vercel; fixed as above and verified on production.
- Not metered (the photos are free); search grid previews are the provider's URLs, shown only while searching, as Pixabay allows.
- Migration `20261122061947_stock_photos.sql`: `media_assets.source_type` allows `STOCK`.

**Tests.** Unit `tests/unit/stock.test.ts` (9): request parameters (English, photos only, safe search), off-host results dropped, browser download link only on Pixabay hosts (unsafe links skipped), credits looked up by id, error mapping without the key, provider selection (mock refused in production), input accepts only a numeric id, mock images pass the file check, suggestions + texts in en/mr/hi. E2E (`media.spec.ts`, mock provider): open → suggestion → more → tap → saved as STOCK with the photographer, linked to the content, shown on the media page. Full media suite 7/7.

## Accounts per post (owner's request, 2026-11-22)

One post can now go to several connected accounts at once; how many is plan data (`billing_plans.max_accounts_per_post`, migration `20261122075556_accounts_per_post.sql`): **Free 1 · Starter 1 · Growth 2 · Premium 4** (channels per plan: see below). Shown on the pricing page ("Accounts in one post: n").

- Publish page: accounts are checkboxes. On one-account plans the first account is ticked and picking another switches to it; on multi-account plans nothing is pre-ticked and further accounts are disabled at the limit, with a link to plans. One caption box and one preview per chosen channel; one WhatsApp number per post.
- Server (`createPublication`): plan limit and remaining posts checked first, then EVERY chosen account is checked (connected, channel rules, picture, WhatsApp template and customers); only if all pass is one job created per account, so a mistake never sends to some accounts and not others. Results are reported per account. Each job uses one post credit as before.
- Channels: Facebook, Instagram, WhatsApp (customers), YouTube, Google Business Profile — all manual. Autopilot (next) will post only to Facebook, Instagram and WhatsApp.
- Tests: unit (input: 1–10 unique accounts, known channels only), pgTAP `accounts_per_post.test.sql` 3/3 on the live database, E2E: Free switches between accounts; Growth (run with `E2E_PLAN_ACCOUNTS=growth` and a temporary subscription, README) scheduled one post to Facebook + Instagram, third account blocked, nothing pre-ticked — passed; publishing/analytics regression passed.

## Channels per plan (owner's decision, 2026-11-22)

| Plan | Channels | Connected accounts | Accounts in one post |
|---|---|---|---|
| Free | Facebook **or** Instagram | **1** (owner chooses which) | 1 |
| Starter | Facebook, Instagram, Google Business Profile | no limit | 1 (the same post can be published again to another account separately) |
| Growth | All: Facebook, Instagram, WhatsApp, YouTube, Google Business Profile | no limit | 2 |
| Premium | All | no limit | 4 |

Plan data: `billing_plans.allowed_channels`, `billing_plans.max_connected_accounts` (migration `20261122083040_plan_channels.sql`). Checked on the server:
- **Connect** (`/api/social/[connector]/connect` and callback, WhatsApp signup): channels outside the plan are refused; on Free the owner picks "Facebook Page" or "Instagram" first (the choice travels in the signed OAuth state) and only that account is saved, even though the Meta login returns both; no new account once the slot is used (reconnecting the same account is always allowed). Helpers: `lib/billing/channels.ts` (`acceptNewAccounts`, `freeSlots`).
- **Publish** (`createPublication`): channel must be in the plan; on plans with an account limit only the earliest connected accounts are usable (e.g. after moving down to Free) (`usableAccountIds`).
- **Pages**: accounts page shows the Free choice, the limit, and "Available on: <plans>" (from plan data) for other channels; the publish page shows out-of-plan accounts disabled; pricing lists channels and connected accounts.

Tests: unit `plan-channels.test.ts` (6); pgTAP `plan_channels.test.sql` 4/4 on the live database; E2E `plan-channels.spec.ts` (Free: choose Instagram → only Instagram saved, limit shown, typed connect links refused, pricing lines); analytics updated (Free connects the Facebook Page only); the full `publishing.spec.ts` now runs on a temporary Premium subscription (`E2E_PLAN=premium`, README) — 8/8, including one post to Facebook + Instagram at once.

## Premium Autopilot (owner's decision, 2026-11-22)

**What the owner sees.** Menu → **Autopilot** (Premium; other plans see what it is and which plan has it). Settings: turn on, accounts (Facebook / Instagram, up to the plan's accounts per post), post time (India time), and the owner's own offers and prices (used word for word). Every Monday the week's **5 posts** are prepared; the dashboard and the bell say "N posts are ready for your approval". Each post shows its date, idea (festival or shop idea), poster and caption, with **Approve / Change / Skip**, and **Approve all**. Approved posts are scheduled on the chosen accounts at their planned time. WhatsApp: "Coming soon" until WhatsApp Business is set up.

**Rule change (owner-approved).** AI normally runs only on a tap. Autopilot is the one exception: only for plans with `autopilot_posts_per_week > 0` and only when the owner turned it on. **Nothing is ever published without the owner's approval of that post.** Recorded in CLAUDE.md.

**How it works**
- Plan data: `billing_plans.autopilot_posts_per_week` (Premium 5, others 0). Migration `20261122085946_autopilot.sql`: `autopilot_settings` (owner RLS; the weekly marker can only be set by the generator), `autopilot_posts` (owner can only read and record one decision PENDING → SCHEDULED/SKIPPED; created only by the generator), secret-gated `autopilot_due` / `autopilot_begin` / `autopilot_save`, and an hourly pg_cron tick that calls the app only when a shop is due this week.
- Generator `POST /api/autopilot/run` (server secret, public route for the scheduler): for each due shop, slots on Mon/Tue/Thu/Fri/Sat at the chosen time still ahead (`plannedSlots`), ideas = the week's festivals then shop-category ideas (`weekIdeas`), one AI call per post with the owner's offers as the offer (owner facts kept), credits reserved → committed for posts made / released for failures, posts saved as DRAFT content + `autopilot_posts`. Runs once per week per shop; no retries.
- Approve: the browser draws the poster (same template code) from the post's own text; the server checks it (1080×1350), stores it, marks the content Ready and calls the normal `createPublication` (scheduled, every chosen account, per-plan rules), then records the decision with the job ids. Missed times are scheduled 30 minutes ahead.
- **Bug found by the tests and fixed:** the generator route was behind the login redirect (`proxy.ts`), so the scheduler (no session) would have been sent to the login page and nothing would have been prepared in production; it is now a public route that checks the server secret itself (unit test added).

**Tests.** Unit `autopilot.test.ts` (7): Monday weeks, slot times in India time, past/too-close slots skipped, festivals first, idea text in the shop's language and only Post/Offer/Festival, settings validation, texts in mr/hi. E2E `autopilot.spec.ts` (3, mock AI + mock Meta, temporary Premium subscription, generator called with no session and a fixed clock): turn on → 5 drafts with the owner's offer and 5 AI credits used → once per week → dashboard link → approve (poster + Facebook + Instagram scheduled at the planned time) → skip → approve all (8 jobs); security (other owner sees nothing, cannot decide, decisions cannot be undone, owners cannot create posts or reset the marker, secret needed); non-Premium sees the plan. pgTAP `autopilot.test.sql` 12/12 on the live database (rolled back): Premium-only plan data, owner settings, marker not settable by owners, other businesses refused, secret required, due list, once-per-week reservation, save as draft, credits committed/released, isolation, decisions final.

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
