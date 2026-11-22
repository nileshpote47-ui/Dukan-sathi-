# Dukaan Sathi — Project Phases

This file is the development ledger. Read it before starting any work.
Never mark a future phase complete. Never repeat a completed phase.

| Phase | Name | Status |
|---|---|---|
| 1 | Foundation | **COMPLETED** |
| 2 | Core Dashboard & Content Workflow | **COMPLETED** |
| 3 | AI Content Engine | **COMPLETED** |
| 4 | Media / Reel / Video Engine | **COMPLETED** |
| 5 | Subscriptions, Credits & Billing | **COMPLETED** |
| 6 | Social / WhatsApp / Publishing | **COMPLETED** |
| 7 | Analytics, Admin & Business Intelligence | **COMPLETED** |
| 8 | Production Hardening & Launch | **COMPLETED** |
| 9 | UX Refresh & AI Studio (requested after launch) | **IN PROGRESS** — Stages 1, 2, 3a and 3b completed |

**Product status: PRODUCTION_READY** (code, infrastructure, security, operations). **Roadmap: ALL_PLANNED_PHASES_COMPLETED.** Taking paying customers needs the owner-side launch steps in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#launch-checklist) (Supabase Pro, SMTP + email confirmation, Razorpay live, Meta App Review).

---

## PHASE 9 — UX REFRESH & AI STUDIO
**Status: IN PROGRESS.** Stage 1 **COMPLETED** (2026-11-21), Stage 2 and Stage 3b **COMPLETED** (2026-11-22). Details: [docs/PHASE_9.md](docs/PHASE_9.md).

### Stage 1 — completed features
- Dashboard composer "What shall we make today: a reel, a poster or a WhatsApp status?": one sentence (or example) → reel script, poster text, WhatsApp message, post, offer or festival copy in one tap, type and language cards, remaining AI posts shown; draft kept if AI fails
- "Write with AI" directly on the content page
- Grouped navigation (Create content / Reach customers / My shop), business card, attention bell (failed posts, accounts to reconnect)
- Devanagari fonts (Mukta, Baloo 2, self-hosted), illustrated tool cards, compact profile strip and plan card

### Files created
- `components/dashboard/composer.tsx`, `components/ai/write-with-ai-button.tsx`, `lib/services/ai-content.ts`, `lib/content/quick-title.ts`, `tests/e2e/experience.spec.ts`, `docs/PHASE_9.md`

### Files modified
- `app/dashboard/page.tsx`, `app/dashboard/layout.tsx`, `app/dashboard/content/ai-actions.ts`, `app/dashboard/content/[id]/page.tsx`, `components/layout/dashboard-nav.tsx`, `components/content/quick-action-card.tsx`, `lib/config/{content,languages,navigation}.ts`, `lib/data/publishing.ts`, `lib/validation/content.ts`, `app/globals.css`, `app/layout.tsx`, i18n (en/mr/hi), `tests/unit/hardening.test.ts`, `package.json` (@fontsource/mukta, @fontsource/baloo-2)

### Database / environment
- No migrations, no new environment variables, no new paid services

### Tests performed
- Unit 205/205 · lint · typecheck · build · E2E 52/52 with mock providers (3 new UX tests + 49 regression; 3 older dashboard assertions updated for the new heading and the business card in the menu)

### Stage 3a — direct posters (completed 2026-11-21)
- AI designs the whole poster with the owner's own lines (OpenAI GPT Image 2.6 Sunburst); owner must confirm text, price and offer before it can be published (server-enforced)
- New metered feature `direct_poster`: Free 3 / Starter 30 / Growth 70 per month; burst limit 6 per 10 minutes
- Tests: unit 214/214 · pgTAP direct_poster 9/9 · E2E 54/54 across the final runs (incl. 2 new direct-poster tests) · one real OpenAI poster through the app (exact Marathi text)
- Files: `services/media/providers/openai.ts`, `lib/media/fit-aspect.ts`, `components/media/{direct-poster-panel,confirm-direct-poster}.tsx`, prompt + service + actions + provider selection, migration `20261121145815_direct_poster.sql`, tests (unit 8, pgTAP 9, e2e 2), CLAUDE.md media rule (documented exception)
- Env: `OPENAI_API_KEY` (set in Vercel, Sensitive); optional `DIRECT_POSTER_PROVIDER`, `DIRECT_POSTER_MODEL`

### Premium plan (2026-11-21)
- ₹999/month: AI texts 1500, AI posters 120, AI pictures 80, saved posters 1000, reels 200, posts 600 (migration `20261121160050_premium_plan.sql`); `RAZORPAY_PLAN_PREMIUM` set (test mode), checkout verified on production

### Stage 2 — ideas, weekly progress, template previews (completed 2026-11-22)
- Dashboard "Ideas for today": upcoming festivals (curated calendar to Oct 2027, `lib/config/festivals.ts`) and everyday ideas per shop group, rotated daily; one tap fills the composer (AI still runs only on "Make it")
- "This week" strip: days with content made (IST, Monday–Sunday) and real counts of content made and posts published
- Poster editor: each template shows a small real rendering with the owner's own text and picture
- Tests: unit 226/226 (+12 ideas/calendar/week) · lint · typecheck · build · E2E 48/48 run (experience, media, foundation, content, AI, direct poster, hardening, publishing, analytics; billing not re-run — unchanged); 1 old composer locator scoped to the "Make it as" group
- No migration, no new env vars, no new paid API

### Stage 3b — reel voiceover (completed 2026-11-22)
- Reel storyboard page: "Make voiceover" reads the owner's own saved voiceover lines aloud (Sarvam Bulbul v3, female/male voice, mr/hi/en); MP3 plays with the preview and downloads
- Metered `voiceover`: Free 3 / Starter 20 / Growth 50 / Premium 100; burst 10 per 10 min (migration `20261122055753_voiceover.sql`)
- Tests: unit +12 · pgTAP voiceover 10/10 · E2E media 6/6 (mock voice, and once with real Sarvam)
- Env: `SARVAM_API_KEY` (set in Vercel, Sensitive); optional `VOICE_PROVIDER`, `VOICE_MODEL`

### Stage 3b — free stock photos (completed 2026-11-22)
- "Free photos" in every picture picker: search Pixabay (category suggestions in mr/hi/en), tap to save as the owner's own picture (browser downloads from Pixabay, server checks the file and confirms the photo id with Pixabay); photographer shown on the media page
- Pexels replaced by Pixabay (Pexels stopped issuing API keys); searches cached 24 h; burst limits; not metered
- Migration `20261122061947_stock_photos.sql` (source type `STOCK`); unit +9; E2E media 7/7; verified live on production (search + save)
- Env: `PIXABAY_API_KEY` (set in Vercel, Sensitive); optional `STOCK_PROVIDER`

### Accounts per post (completed 2026-11-22)
- One post to several accounts at once; limit per plan from the database: Free 1 / Starter 1 / Growth 2 / Premium 4 (migration `20261122075556_accounts_per_post.sql`)
- All accounts validated before any job is created; per-account results; pricing page shows the limit

### Channels per plan (completed 2026-11-22)
- Free: ONE account, Facebook Page or Instagram (owner's choice); Starter: Facebook, Instagram, Google Business Profile; Growth/Premium: all channels
- Plan data (`allowed_channels`, `max_connected_accounts`, migration `20261122083040_plan_channels.sql`), checked when connecting and publishing
- Tests: unit +6, pgTAP 4/4, E2E plan-channels + full publishing suite on Premium 8/8

### Premium Autopilot (completed 2026-11-22)
- Every Monday 5 posts prepared (festivals, shop ideas, owner's own offers) as drafts; owner approves each (or all) with one tap; approved posts scheduled on Facebook + Instagram at the chosen time; WhatsApp coming soon
- Owner-approved exception to "AI only on a tap" (Premium + turned on, once a week, never published without approval) — CLAUDE.md
- Migration `20261122085946_autopilot.sql` (settings, posts, secret-gated generator functions, hourly cron); `/api/autopilot/run`
- Tests: unit +7 (+1 route check), pgTAP 12/12, E2E 3/3 on Premium; fixed: generator route was behind the login redirect

### Next
- Google Business Profile and YouTube setup (owner accounts + app review)

---

## PHASE 8 — PRODUCTION HARDENING & LAUNCH
**Status: COMPLETED** (2026-11-19). Details: [docs/PHASE_8.md](docs/PHASE_8.md). Guides: [DEPLOYMENT](docs/DEPLOYMENT.md), [SECURITY](docs/SECURITY.md), [OPERATIONS](docs/OPERATIONS.md).

### Completed work
- Security review of auth, authorization, RLS, storage, secrets, webhooks, uploads, admin; no P0/P1 found. Removed test `mock_webhook_secret` from production Vault; recorded an unrecorded migration; HSTS
- Structured, redacted server logs (`lib/observability/log.ts`) across all server modules; error monitoring via `instrumentation.ts` (`[unhandled]` + digest shown to users as "Reference")
- `GET /api/health` (app + database)
- Per-user burst limits for AI text/pictures, reels, poster exports, publishing and social connections (`rate_limit_hit()`), in front of the Phase 5 monthly limits
- Error boundaries use `retry()`; root `error.tsx` and `global-error.tsx`
- Vercel functions moved to Mumbai (`bom1`) next to the database
- Launch UX: landing copy no longer says "coming soon"; favicon, Open Graph, canonical URLs, robots.txt, sitemap.xml; `lang` on dashboard content
- Docs: DEPLOYMENT, SECURITY, OPERATIONS, PHASE_8; README, ARCHITECTURE, e2e README

### Files created
- `lib/observability/log.ts`, `instrumentation.ts`, `app/api/health/route.ts`, `lib/security/rate-limit.ts`, `lib/config/rate-limits.ts`, `app/error.tsx`, `app/global-error.tsx`, `app/robots.ts`, `app/sitemap.ts`, `app/icon.svg`, `vercel.json`
- `supabase/migrations/20261119164803_rate_limits.sql`, `supabase/tests/database/rate_limits.test.sql`, `tests/unit/hardening.test.ts`, `tests/e2e/hardening.spec.ts`
- `docs/PHASE_8.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/OPERATIONS.md`

### Files modified
- 25 server modules (logger), `lib/billing/usage.ts`, `lib/services/publishing.ts`, social connect route (burst limits), `components/layout/route-error.tsx`, error boundaries, `components/ui/states.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/pricing/page.tsx`, `app/dashboard/layout.tsx`, accounts page, `lib/config/site.ts`, `next.config.ts`, i18n (en/mr/hi), `types/database.ts`, `tests/unit/billing.test.ts`, docs

### Database migrations
- `20261119164803_rate_limits.sql` — `rate_limit_counters` (RLS on, no API access), `rate_limit_hit()` (definer, `auth.uid()` only, anon revoked)
- History fix: `20261119003500_media_assets_business_owner_index` recorded (had been applied via SQL editor)

### Environment variables
- None new. `vercel.json` sets the function region. Production Vault no longer contains `mock_webhook_secret`

### Tests performed
- Unit 199/199 · pgTAP rate limits 13/13 · E2E 49/49 (6 hardening + 43 regression, mock providers) · lint · typecheck · build · `npm audit` 0 · advisors · production smoke checks (see docs/PHASE_8.md)

### Known limitations
- Supabase Free plan (no restorable backups, can pause) — upgrade to Pro before real customers; email confirmation off until custom SMTP; Razorpay test mode; Meta app in development mode; AI pictures, WhatsApp and Google not configured; no CSP yet; fresh-environment migration replay not run here (no Docker)

### Technical debt
- Patch-level dependency updates deferred until after launch; analytics computed on demand (no rollups); admin pages English-first

### Recommended next step
- No further phases are planned. Complete the owner-side launch checklist in docs/DEPLOYMENT.md, then monitor `/api/health`, `/admin/system` and Vercel logs.

---

## PHASE 7 — ANALYTICS, ADMIN & BUSINESS INTELLIGENCE
**Status: COMPLETED** (2026-11-19). Details: [docs/PHASE_7.md](docs/PHASE_7.md).

### Completed features
- Owner analytics at `/dashboard/analytics`: overview tiles (content created, published, upcoming, publishing success, AI content, connected channels) with previous-period comparison (no % when the previous period is empty), daily/weekly activity charts with table view, breakdowns by type, status, language and channel, publishing stats, scheduler delay, recent failures, WhatsApp delivery/read, AI and media usage, plan usage this month
- Date presets Today / 7 / 30 / 90 days / This month / Last month / Custom, all in India time; invalid custom ranges explained
- Deterministic insights (no AI), stating the numbers they use
- Platform engagement (Facebook reactions/comments/shares, Instagram likes/comments) through `Connector.getContentMetrics`, refreshed only on request (cooldown, batched per account); "no data" kept distinct from zero
- CSV exports (content, publishing, usage) of the owner's own data, formula-safe
- Admin area `/admin` (overview, businesses + detail, users + detail, subscriptions, usage, publishing, system health): explicit SQL grant, server-side checks in pages and database, read-only, every view audited
- en complete; mr/hi analytics texts; admin English-first

### Files created
- `lib/analytics/{range,types,insights,series,csv}.ts`, `lib/data/{analytics,admin}.ts`, `lib/auth/admin.ts`, `lib/services/analytics.ts`
- `components/analytics/{charts,range-picker,refresh-engagement-button}.tsx`, `components/admin/ui.tsx`
- `app/dashboard/analytics/{page,actions}.ts(x)`, `app/dashboard/analytics/export/route.ts`, `app/admin/layout.tsx` and pages (`page`, `businesses`, `businesses/[id]`, `users`, `users/[id]`, `subscriptions`, `usage`, `publishing`, `system`)
- 2 migrations, `supabase/tests/database/analytics.test.sql`, `tests/unit/analytics.test.ts`, `tests/e2e/analytics.spec.ts`, `docs/PHASE_7.md`

### Files modified
- `services/publishing/{types,providers/meta,providers/mock}.ts` (metrics adapter), `lib/services/publishing.ts` (shared credential helper), `lib/config/navigation.ts` (Analytics live), settings page (admin link for admins), `app/globals.css` (chart tokens), i18n, `types/database.ts`, `tests/unit/config-sync.test.ts`, docs

### Database migrations
- `20261119144232_analytics_owner.sql` — `admin_users`, `admin_audit_logs`, `publishing_metrics`, indexes, `analytics_business_overview()` (invoker), `publishing_save_metrics()` (server secret)
- `20261119144416_admin_foundation.sql` — `admin_is_admin()`, internal `admin_authorize()`, nine read-only audited `admin_*` functions

### Database tables
- New: `admin_users`, `admin_audit_logs`, `publishing_metrics`

### RLS policies
- Owners read their own `publishing_metrics`; `admin_users` and `admin_audit_logs` have no API access (admin functions only); owner analytics runs as the owner under existing RLS

### Environment variables
- None new

### External integrations
- Meta Graph API (existing permissions) for engagement counts

### Tests performed
- Unit 191/191 · pgTAP analytics 31/31 · E2E 43/43 with mock providers (4 analytics/admin + 39 regression) · lint · typecheck · build · advisors
- Live production data verified through the analytics and admin functions

### Known limitations
- No reach/impressions/views (insights permissions not requested); no Google Business Profile / YouTube metrics; usage history starts with Phase 5 metering; admin access granted via SQL; admin pages English-first

### Technical debt
- Analytics computed on demand (no rollups); revisit with real volume

### Recommended next phase
- Phase 8 — Production Hardening & Launch

---

## PHASE 6 — SOCIAL / WHATSAPP / PUBLISHING
**Status: COMPLETED** (2026-11-19). Details: [docs/PHASE_6.md](docs/PHASE_6.md).

### Completed features
- Connected accounts: Facebook Pages + linked Instagram professional accounts (Facebook Login for Business), WhatsApp Business (Embedded Signup v4), Google Business Profile and YouTube (Google OAuth, PKCE); status, reconnect, disconnect (tokens deleted; Google revoked); Meta deauthorize/data-deletion callback
- Provider abstraction (`Connector`): Meta (Facebook photo/text posts, Instagram image posts with server JPEG conversion), WhatsApp (approved MARKETING templates via Marketing Messages API to opted-in customers, max 50 per send), Google Business Profile (STANDARD posts with photo + CTA), YouTube (connect only: needs video export), mock provider for tests
- Publish flow from any Ready content: channel choice, caption from saved AI copy, picture from posters/pictures, live preview, channel validation (`CHANNEL_RULES`), publish now or schedule (India time, 5 min–30 days), explicit confirmation
- Publishing jobs QUEUED → SENDING → PUBLISHED/FAILED, CANCELLED; exactly-once sending, duplicate protection, limited automatic retry (rate limits), explicit retry, stuck-job handling, attempt history, external post id/link; content becomes PUBLISHED
- Scheduler: Supabase pg_cron + pg_net → `/api/publishing/run` only when jobs are due (server secret)
- WhatsApp compliance: opted-in customer list with consent source, STOP replies opt out (signed Meta webhook), opt-in re-checked at send time, per-recipient delivery status
- Billing: new `social_publishing` entitlement (Free 10 / Starter 60 / Growth 200) on the Phase 5 ledger; failed publishing is never charged
- Publishing dashboard (Scheduled / Sending / Published / Failed / Cancelled), accounts page, WhatsApp customers page, publish history on content pages; en complete, mr/hi main texts

### Files created
- `services/publishing/{types,env,crypto,http,connect,registry,runner}.ts`, `services/publishing/providers/{meta,meta-shared,whatsapp,google,mock}.ts`
- `lib/config/publishing.ts`, `lib/publishing/{compose,prepare-media}.ts`, `lib/data/publishing.ts`, `lib/services/publishing.ts`, `lib/validation/publishing.ts`
- `app/api/social/[connector]/{connect,callback}/route.ts`, `app/api/publishing/run/route.ts`, `app/api/webhooks/meta/route.ts`, `app/api/webhooks/meta/deauthorize/route.ts`
- `app/dashboard/publishing/{page,actions}.ts(x)`, `app/dashboard/accounts/{page,actions}.ts(x)`, `app/dashboard/accounts/whatsapp/page.tsx`, `app/dashboard/content/[id]/publish/{page,actions}.ts(x)`
- `components/publishing/{badges,job-card,job-actions,publish-form,disconnect-account-button,whatsapp-signup-button,contact-form,contact-actions}.tsx`
- 3 migrations, `supabase/tests/database/publishing.test.sql`, `tests/unit/publishing.test.ts`, `tests/e2e/publishing.spec.ts`, `docs/PHASE_6.md`

### Files modified
- `lib/config/{billing,content,navigation,site}.ts` (social_publishing feature, PUBLISHED filter/publishable statuses, nav, public webhook/scheduler routes), content detail page (Publish button + history), i18n, `types/database.ts`, `tests/unit/config-sync.test.ts`, `package.json` (sharp), docs (README, ARCHITECTURE, `.env.example`, e2e README), two older tests updated for the new behaviour

### Database migrations
- `20261119095729_publishing.sql` — 8 tables, RLS, secret-gated functions, social_publishing entitlement + `billing_reserve_for`, content guard (PUBLISHED by the system only), pg_cron/pg_net scheduler
- `20261119100517_publishing_narrow_grants.sql` — per-role function grants
- `20261119101107_publishing_whatsapp_recipients.sql` — opt-in re-checked at send time

### Database tables
- New: `social_accounts`, `social_account_credentials`, `publishing_jobs`, `publishing_job_payloads`, `publishing_attempts`, `whatsapp_contacts`, `whatsapp_messages`, `publishing_webhook_events`

### RLS policies
- Owners read their own accounts, jobs, attempts, WhatsApp messages; CRUD their own WhatsApp contacts (own business only); credentials, payloads and webhook events have no API access. All job/account state changes only through definer functions requiring the server secret (no service-role key)

### Environment variables
- `PUBLISHING_SERVER_SECRET` (= Vault `publishing_server_secret`), `SOCIAL_TOKEN_ENCRYPTION_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID` (set in production); `META_WHATSAPP_CONFIG_ID`, `META_WEBHOOK_VERIFY_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (not set yet → "Not set up yet"); Vault `publishing_runner_url`; tests `PUBLISHING_PROVIDER=mock`

### External integrations
- Meta Graph API v27.0 (Facebook Pages, Instagram, WhatsApp), Google OAuth / YouTube Data API / Business Profile APIs, Supabase pg_cron + pg_net

### Tests performed
- Unit 168/168 · pgTAP publishing 52/52 · E2E 39/39 with mock providers (7 publishing + 32 regression) · lint · typecheck · build · advisors
- Live on production: Meta connect (5 Pages + 4 Instagram), Facebook publish now, scheduled Instagram post published by pg_cron with real permalink

### Known limitations
- Meta app in development mode (other businesses need App Review + Business Verification); WhatsApp needs Tech Provider status + approved templates; Google Business Profile needs API access approval; YouTube/Reels/Facebook video wait for video export; no carousels/stories; prepared pictures kept in the owner's private folder

### Technical debt
- Vercel functions still run in `iad1`; WhatsApp and Google paths verified only with mocks/unit tests so far

### Recommended next phase
- Phase 7 — Analytics, Admin & Business Intelligence (publishing history, external post ids and WhatsApp statuses are ready to be analysed)

---

## PHASE 5 — SUBSCRIPTIONS, CREDITS & BILLING
**Status: COMPLETED** (2026-11-19). Details: [docs/PHASE_5.md](docs/PHASE_5.md).

### Completed features
- Data-driven plans (Free ₹0, Starter ₹199, Growth ₹499 — placeholder prices) and monthly entitlements per feature (`billing_plans`, `plan_entitlements`)
- Auditable usage ledger (`usage_ledger`: allocation, usage reserve → commit/release, plan-change top-up) enforced server-side on the real operations: AI copy, AI pictures, reel storyboards, saved posters; limit messages with "View plans"
- Razorpay Subscriptions (monthly auto-renew) behind `BillingProvider` (Razorpay REST + mock); plan amount verified against Razorpay before checkout; checkout signature verified server-side
- Signed, idempotent webhooks as the only source of subscription/payment state (`billing_process_webhook()`, secret in Supabase Vault); out-of-order events handled; upgrade cancels the superseded subscription; cancel at period end
- Public pricing page, billing dashboard (plan, status, usage, payment history), "Your plan" card on the dashboard; en complete, mr/hi partial

### Files created
- `lib/config/billing.ts`, `lib/billing/{state,usage,format}.ts`, `lib/data/billing.ts`
- `services/billing/{types,signature,provider,webhook}.ts`, `services/billing/providers/{razorpay,mock}.ts`
- `app/api/billing/webhooks/[provider]/route.ts`, `app/dashboard/billing/{page,actions}.ts(x)`, `app/pricing/page.tsx`
- `components/billing/{plan-card,checkout-button,cancel-subscription-button,activation-watcher,usage-list,action-error}.tsx`
- 2 migrations, `supabase/tests/database/billing.test.sql`, `tests/unit/billing.test.ts`, `tests/e2e/billing.spec.ts`, `docs/PHASE_5.md`

### Files modified
- Metered actions: `app/dashboard/content/ai-actions.ts`, `app/dashboard/media/actions.ts`, `app/dashboard/content/[id]/storyboard/actions.ts`; media components (limit errors); dashboard home (plan card)
- `lib/config/{site,navigation}.ts`, i18n, `types/database.ts`, `tests/unit/config-sync.test.ts`, `.env.example`, docs (README, ARCHITECTURE, CLAUDE.md, e2e README)

### Database migrations
- `20261119015138_billing.sql` — billing tables, RLS, seeds, usage + webhook functions, grants
- `20261119024319_billing_past_due_no_access.sql` — paid access only while ACTIVE

### Database tables
- New: `billing_plans`, `plan_entitlements`, `business_subscriptions`, `billing_payments`, `usage_ledger`, `billing_webhook_events`

### RLS policies
- Plans/entitlements: read-only for everyone; subscriptions, payments, ledger: owner read-only; webhook log: no access. All writes only inside narrow `security definer` functions (no service-role key in the app)

### Environment variables
- `BILLING_PROVIDER`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (Sensitive), `RAZORPAY_PLAN_STARTER`, `RAZORPAY_PLAN_GROWTH`, optional `RAZORPAY_WEBHOOK_SECRET`; Vault `razorpay_webhook_secret`. Tests: `BILLING_PROVIDER=mock`, `BILLING_MOCK_WEBHOOK_SECRET` + temporary Vault `mock_webhook_secret`

### External integrations
- Razorpay (test mode) on production: subscription checkout, webhooks, cancellation verified live

### Tests performed
- Unit 126/126 · pgTAP billing 36/36 · E2E 32/32 with mock providers (6 billing + 26 regression) · lint · typecheck · build
- Live (production, Razorpay test mode): Starter checkout paid → webhooks authenticated/charged/activated processed → ACTIVE, payment CAPTURED; cancel at period end ✔; forged webhook 401; mock endpoint 404 in production

### Known limitations
- Placeholder prices; Razorpay test mode only; no proration (upgrade = new cycle); limits reset by calendar month (IST); no GST invoices, refunds UI or admin plan editor

### Technical debt
- Vercel functions still run in `iad1`; supabase advisors list intentional definer entry points

### Recommended next phase
- Phase 6 — Social / WhatsApp / Publishing (publishing can be metered through `withUsage()`)

---

## PHASE 4 — MEDIA / REEL / VIDEO ENGINE
**Status: COMPLETED** (2026-11-19). Details: [docs/PHASE_4.md](docs/PHASE_4.md).

### Completed features
- Media asset foundation (`media_assets`) and private storage (`business-media` bucket, owner folders, signed URLs, server-side file inspection)
- Poster / social creative workflow from any content item: visual template (the 7 Phase 2 templates + Simple), sizes 1:1 / 4:5 (default) / 9:16 / 16:9, editable texts from saved AI copy and the business profile (badge only from the owner's price/offer), optional picture, live canvas preview (Devanagari-correct), save, download, make another version
- Image generation provider abstraction (`MediaProvider`: Gemini image + mock), explicit-only, one generation at a time per owner (database lock), no retries; visual-only prompts (no text/prices/logos in pictures)
- Reel storyboard from saved Phase 3 reel copy (no extra AI call): 3–8 timed scenes (TEXT/PRODUCT/IMAGE/BRAND/CTA…), edit text/voice-over/visual/type/transition, ±1 s durations (total 8–60 s), reorder/add/remove, assign pictures, 9:16 in-browser preview, save
- Video renderer interface (`VideoRenderer`); video export shows "Coming soon" — no paid video API
- Media library (filter, open, download, delete), media detail, "Posters & media" on content pages, Media in navigation
- Generation status GENERATING / READY / FAILED (never READY on failure; stale generations marked FAILED)

### Files created
- `lib/config/{media,poster-templates}.ts`, `lib/media/{poster-layout,poster-defaults,storyboard,image-file,browser-image}.ts`, `lib/data/media.ts`, `lib/services/media.ts`, `lib/validation/media.ts`, `lib/ai/error-messages.ts`
- `services/media/{types,prompts,provider,service}.ts`, `services/media/providers/{gemini,mock}.ts`
- `app/dashboard/media/{page,actions}.ts(x)`, `app/dashboard/media/[id]/{page,not-found}.tsx`, `app/dashboard/content/[id]/poster/page.tsx`, `app/dashboard/content/[id]/storyboard/{page,actions}.ts(x)`
- `components/media/{poster-canvas,poster-editor,picture-picker,storyboard-editor,reel-preview,delete-media-button,upload-picture-button,media-badges}.tsx`
- 3 migrations, `supabase/tests/database/media.test.sql`, `tests/unit/media.test.ts`, `tests/e2e/media.spec.ts`, `docs/PHASE_4.md`

### Files modified
- Content detail page (media card), navigation (Media), i18n (en complete; mr/hi key labels), `next.config.ts` (Server Action body 4 MB), `app/globals.css`, `types/database.ts`, `.env.example`, `.gitignore`, `playwright.config.ts` (optional browser proxy), docs (README, ARCHITECTURE, CLAUDE.md, e2e README)
- Phase 3 compatibility (minimal): `services/ai/output.ts` (maxLength in schema, one-paragraph reel script), `services/ai/prompts.ts` (one-line values), `services/ai/providers/gemini.ts` (thinking MINIMAL, 1024 output tokens, token-count logs, shared blocked reasons), `app/dashboard/content/ai-actions.ts` (shared error messages), default model `gemini-3.5-flash-lite`

### Database migrations
- `20261118202852_media_engine.sql` — `media_assets` + RLS + guard trigger; `content_items.storyboard` (REEL only, object ≤ 32 KB); bucket + storage policies
- `20261118203349_media_generation_lock.sql` — one GENERATING asset per owner
- `20261119003500_media_assets_business_owner_index.sql` — FK index (applied via SQL Editor; idempotent)

### Database tables
- New: `media_assets`. Extended: `content_items.storyboard`. Storage: `business-media` bucket.

### RLS policies
- `media_assets`: owner-only select/update/delete; insert only for own business and own content (WITH CHECK on insert/update); no anon access
- `storage.objects` (`business-media`): owner-folder select/insert/delete; no update; bucket private

### Environment variables
- Server-only: `MEDIA_PROVIDER` (unset in production = AI pictures off), `MEDIA_MODEL` (default `gemini-3.1-flash-image`); reuses `GEMINI_API_KEY`. Tests: `MEDIA_PROVIDER=mock`, `MEDIA_MOCK_SCENARIO`. Production `AI_MODEL` = `gemini-3.5-flash-lite`.

### External integrations
- Supabase Storage (private). Gemini image model wired but not enabled in production (not tested live; may need a paid tier).

### Tests performed
- Unit 107/107 · pgTAP media 22/22 (+ content 31/31, ai 8/8) · E2E 26/26 with mock providers (5 Phase 4 + 21 regression) · lint · typecheck · build · Supabase security advisors clean
- Real-world on production with real Gemini text: grocery OFFER Marathi → 4:5 poster ✔; mobile shop REEL Hindi → 6-scene storyboard, edited, previewed, saved ✔; salon POST English → 1:1 creative ✔

### Known limitations
- No video file export yet ("Coming soon"); no logo on posters (profile logo is an external URL); AI pictures off in production
- Signed URLs expire after 1 hour; files ≤ 3.5 MB; poster fonts depend on the device

### Technical debt
- Vercel functions still run in `iad1` although `bom1` is configured
- Gemini model availability varies; models are set by `AI_MODEL` / `MEDIA_MODEL`

### Recommended next phase
- Phase 5 — Subscriptions, Credits & Billing (credit accounting can wrap `generateMarketingContent` / `generateMarketingImage`)

---

## PHASE 3 — AI CONTENT ENGINE
**Status: COMPLETED** (2026-11-18). Details: [docs/PHASE_3.md](docs/PHASE_3.md).

### Completed features
- Provider abstraction (`services/ai/`): `AIProvider` interface, Google Gemini provider (`@google/genai`, structured JSON output, thinking level LOW, 45 s timeout, no automatic retries), deterministic mock provider with failure simulation (refused in production)
- Single server-side entry point `generateMarketingContent()`; prompts only in `services/ai/prompts.ts` with factuality rules (no invented prices, discounts, specifications, contacts, guarantees); owner text quoted as data
- Per-type structured output (POST, OFFER, POSTER, WHATSAPP, REEL, FESTIVAL, OTHER) validated and normalized (`services/ai/output.ts`)
- Generation in English, Marathi and Hindi with 6 tones, templates and business context/preferences
- Create flow "Generate and review": generate, edit every field, regenerate with suggestions or own instructions, restore previous version, save as draft
- Edit page: generate from saved details without overwriting saved copy until Save; detail page: read-only AI copy with Copy text
- Duplicate-click protection; generation only on explicit user action; friendly errors with Try Again

### Files created
- `services/ai/{types,output,prompts,provider,service}.ts`, `services/ai/providers/{gemini,mock}.ts`
- `lib/config/ai.ts`, `app/dashboard/content/ai-actions.ts`, `app/dashboard/content/[id]/edit/edit-ai-copy.tsx`
- `components/ai/{ai-content-panel,ai-copy-view,copy-text-button}.tsx`, `components/ai/ai-field-label.ts`
- `supabase/migrations/20261118185844_ai_generated_copy.sql`, `supabase/tests/database/ai.test.sql`
- `tests/unit/ai.test.ts`, `tests/e2e/ai.spec.ts`, `docs/PHASE_3.md`

### Files modified
- `lib/marketing/context.ts` (`buildAIContentRequest`), `lib/validation/content.ts` (tone, generated copy, `aiGenerateSchema`), `lib/services/content.ts` (copy + server-set AI metadata), `types/database.ts`
- Create flow/page, edit and detail pages, `components/content/{content-form,content-type-card}.tsx` (tone select; re-selecting a preselected type fixed), dashboard hint
- `lib/i18n/messages/*`, `vitest.config.mts`, `tests/e2e/{helpers,content.spec}.ts`, `.env.example`, `README.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `tests/e2e/README.md`

### Database migrations
- `20261118185844_ai_generated_copy.sql`: `content_items` gains `tone`, `generated_copy jsonb` (object, ≤ 12 KB), `ai_provider`, `ai_model`, `ai_generated_at`

### Database tables
- No new tables; `content_items` extended. Prompts, instructions and raw responses are not stored.

### RLS policies
- Unchanged: existing owner-only `content_items` policies cover the new columns (verified by `ai.test.sql`).

### Environment variables
- Server-only: `AI_PROVIDER` (`gemini`), `AI_MODEL` (`gemini-3.5-flash-lite` since Phase 4; was `gemini-3.5-flash`), `GEMINI_API_KEY` (Sensitive, set in Vercel by the owner). Tests: `AI_PROVIDER=mock`, `AI_MOCK_DELAY_MS`, `AI_MOCK_SCENARIO`.

### External integrations
- Google Gemini API (server-side only).

### Tests performed
- Unit 77/77 · pgTAP ai 8/8 (+ Phase 1 24/24, Phase 2 31/31) · E2E 21/21 with the mock provider · lint · typecheck · build
- Real Gemini on production: grocery (Marathi, Local), mobile shop (Hindi, Energetic), salon (English, Premium) — 3/3 pass, correct language, no invented prices or specifications

### Known limitations
- No server-side rate limits or credits yet (Phase 5); duplicate clicks prevented in the UI only
- One previous version kept for undo; generated copy not searchable
- Model availability depends on Google (`gemini-3.8-flash` was overloaded during testing)
- Marathi/Hindi UI translations partial

### Technical debt
- Vercel functions run in `iad1` although `bom1` is configured
- Default model id must be revisited when Google retires `gemini-3.5-flash`

### Recommended next phase
- Phase 4 — Media / Reel / Video Engine (reuse `generated_copy` for posters and reel scripts)

---

## PHASE 2 — CORE DASHBOARD & CONTENT WORKFLOW
**Status: COMPLETED** (2026-11-19). Details: [docs/PHASE_2.md](docs/PHASE_2.md).

### Completed features
- Dashboard home: IST greeting, profile-completion prompt, 5 quick actions, real content counts, recent content
- One reusable create flow (type → details → review → save draft) with `?type=` preselection, category-specific examples, optional templates
- Content list (search, type/status filters, list/grid, pagination), detail, edit, delete with confirmation
- Status lifecycle DRAFT→READY→SCHEDULED→DRAFT, DRAFT/READY→ARCHIVED, enforced in UI, server and database; PUBLISHED reserved
- Scheduling metadata in IST (planning only, no publishing)
- Month calendar with day selection and upcoming list
- Marketing preferences, Settings (app language, notification preference)
- Template foundation (7 seeded templates)
- AI-ready `MarketingGenerationRequest` structure (types + pure builder, no AI calls)
- Navigation: Dashboard, Create, Content, Calendar, My Business, Settings; Analytics coming soon

### Files created
- Routes: `app/dashboard/create/{page,create-flow}.tsx`, `app/dashboard/content/{page,loading,actions}.ts(x)`, `app/dashboard/content/[id]/{page,not-found,loading}.tsx`, `app/dashboard/content/[id]/edit/{page,edit-content-form}.tsx`, `app/dashboard/calendar/{page,loading}.tsx`, `app/dashboard/business/marketing/page.tsx`, `app/dashboard/settings/{page,settings-form,actions}.ts(x)`
- Components: `components/content/*` (12 components), `components/business/marketing-preference-form.tsx`
- Lib: `lib/config/{content,marketing,category-examples}.ts`, `lib/content/status.ts`, `lib/data/content.ts`, `lib/services/{content,errors}.ts`, `lib/validation/content.ts`, `lib/marketing/context.ts`, `lib/utils/datetime.ts`
- Database: 2 migrations, `supabase/tests/database/content.test.sql`
- Tests: `tests/unit/content.test.ts`, `tests/e2e/content.spec.ts`
- Docs: `docs/PHASE_2.md`

### Files modified
`app/dashboard/page.tsx` (rebuilt home), `app/dashboard/business/{page,actions}.ts(x)`, `lib/config/navigation.ts`, `lib/services/business.ts` (shared error mapping, profile notification field), `lib/i18n/messages/{en,mr,hi}.ts`, `services/ai/types.ts`, `types/database.ts`, `tests/unit/config-sync.test.ts`, `tests/e2e/{foundation.spec,helpers}.ts` (dashboard/Create are no longer placeholders; login helper waits for sign-in), `docs/ARCHITECTURE.md`, `CLAUDE.md`, `README.md`. Removed the Coming-soon placeholders for Create, Content, Calendar and Settings.

### Database migrations
- `20261118181657_content_workflow.sql`
- `20261118182058_content_items_business_owner_index.sql`

### Database tables
- `public.content_items` (new), `public.content_templates` (new)
- `public.businesses` + 6 marketing preference columns, unique `(id, owner_id)`
- `public.profiles` + `product_update_emails`

### RLS policies
- content_items: select/insert/update/delete own; insert/update also require the business to be owned by the user
- content_templates: select active for signed-in users; no write policies or privileges
- Lifecycle trigger `content_items_guard` (not executable via API)

### Environment variables
No changes.

### External integrations
None added. No AI, publishing, payment or messaging APIs.

### Tests performed
Lint, TypeScript, build: pass · Unit 38/38 · pgTAP 24/24 (Phase 1) + 31/31 (Phase 2) · Playwright 15/15 (7 Phase 2 + 8 Phase 1 regression) · advisors: no security findings.

### Known limitations
See docs/PHASE_2.md: no AI generation or publishing; simple search; partial Marathi/Hindi; no drag-and-drop calendar; English template text.

### Technical debt
- Redundant index `content_items_business_idx` (drop needed an approval prompt that could not be shown).
- Database tests still run remotely in development (no local Docker).

### Recommended next phase
Phase 3 — AI Content Engine (only when explicitly requested).

---

## PHASE 1 — FOUNDATION
**Status: COMPLETED** (2026-11-18). Details: [docs/PHASE_1.md](docs/PHASE_1.md).

### Completed features
- Email + password sign up, login, logout, session persistence (Supabase Auth + `@supabase/ssr`)
- Email-confirmation landing route (`/auth/confirm`, PKCE code and token-hash links)
- Protected routes (`proxy.ts` redirect + per-page checks in the data access layer)
- Profiles (auto-created on sign-up) and businesses (one per owner) with RLS
- 7-step onboarding with progress, validation, save-per-step and resume
- Dashboard shell: sidebar (desktop), bottom bar + "More" menu (phone), Coming soon sections
- Dashboard home: time-of-day greeting (IST), business summary, profile completion, quick-action placeholders, no fake metrics
- My Business: view and edit all business details and preferred language
- Localization foundation: English (complete), Marathi and Hindi (partial, English fallback)
- Design system components, loading / empty / error / confirmation states
- AI service boundary (types only, no provider, no API calls)

### Files created
- App: `app/layout.tsx`, `app/page.tsx`, `app/not-found.tsx`, `app/globals.css`, `app/(auth)/{layout,actions}.ts(x)`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/auth/confirm/route.ts`, `app/auth/error/page.tsx`, `app/onboarding/{page,onboarding-wizard,actions,loading,error}.tsx`, `app/dashboard/{layout,page,loading,error}.tsx`, `app/dashboard/business/{page,actions}.ts(x)`, `app/dashboard/business/edit/page.tsx`, `app/dashboard/{create,content,calendar,analytics,settings}/page.tsx`
- `proxy.ts`
- Components: `components/ui/*` (button, input/select/textarea/checkbox/radio, card, dialog, toast, form-field, progress, spinner, states), `components/layout/*` (dashboard-nav, logo, page-header, coming-soon, route-error), `components/business/*` (business-fields, business-form), `components/forms/auth-form.tsx`, `components/providers.tsx`
- Lib: `lib/auth/{dal,errors}.ts`, `lib/supabase/{server,proxy,env}.ts`, `lib/services/business.ts`, `lib/validation/{fields,auth,business,business-values,result}.ts`, `lib/config/{categories,languages,navigation,site}.ts`, `lib/i18n/{index.ts,provider.tsx,messages/en.ts,messages/mr.ts,messages/hi.ts}`, `lib/utils/{cn,greeting,business}.ts`
- `services/ai/types.ts`, `types/database.ts`
- Supabase: `supabase/config.toml`, `supabase/migrations/*`, `supabase/tests/database/rls.test.sql`
- Tests: `tests/unit/*`, `tests/e2e/*`, `vitest.config.mts`, `playwright.config.ts`, `scripts/remote-db-test.mjs`
- Docs: `CLAUDE.md`, `PROJECT_PHASES.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/PHASE_1.md`, `.env.example`
- CI: `.github/workflows/ci.yml` (lint, typecheck, unit tests, build)

### Files modified / removed
- Replaced the earlier offline Vite shop-management prototype (stock/billing/udhaar). It remains in git history (commit `464b74c`).
- Removed the GitHub Pages deploy workflow (Next.js server rendering needs Vercel).

### Database migrations
- `20261118153724_profiles_and_businesses.sql`
- `20261118153745_lock_down_trigger_functions.sql`

### Database tables
- `public.profiles` — one per auth user (`user_id` unique → `auth.users`)
- `public.businesses` — `owner_id` → `auth.users`; unique per owner in Phase 1

### RLS policies
- profiles: select / insert / update own (`auth.uid() = user_id`); no delete (removed with the auth user)
- businesses: select / insert / update / delete own (`auth.uid() = owner_id`, `USING` + `WITH CHECK`)
- `anon` has no table privileges; trigger functions are not executable via the API

### Environment variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`. No server secrets.

### External integrations
- Supabase project `dukaan-sathi` (`vqlojnnhefjrozwttkgz`, ap-south-1 Mumbai). No AI, payment, messaging or social APIs.

### Tests performed
- ESLint, TypeScript, production build: pass
- Unit (Vitest): 18 pass — validation, config/DB sync, i18n, greeting, completion
- Database (pgTAP): 24 pass — the 8 required ownership cases plus profile, validation and trigger-function checks
- End-to-end (Playwright, phone viewport, real Supabase): 8 pass — redirects, login errors, sign-up validation, full onboarding, session persistence, edit, logout, resume onboarding, user A vs B isolation via the real API, anonymous refusal
- Security advisors: no findings

### Known limitations
- Email confirmation is turned off (2026-11-18) because the project has no custom SMTP yet; anyone can sign up with an address they don't own. Before public launch: add custom SMTP and turn "Confirm email" back on — see docs/PHASE_1.md.
- Logo upload deferred (`logo_url` column exists; storage not set up).
- Marathi and Hindi are partial translations.
- No password reset yet.
- Interface language for signed-out pages is English.

### Technical debt
- Database tests run remotely through the SQL API in development (no local Docker); `supabase test db` works where Docker is available.
- `types/database.ts` must be regenerated by hand after migrations (`npm run db:types`).

### Recommended next phase
Phase 2 — Core Dashboard & Content Workflow (completed 2026-11-19).
