# Dukaan Sathi — Project Phases

This file is the development ledger. Read it before starting any work.
Never mark a future phase complete. Never repeat a completed phase.

| Phase | Name | Status |
|---|---|---|
| 1 | Foundation | **COMPLETED** |
| 2 | Core Dashboard & Content Workflow | **COMPLETED** |
| 3 | AI Content Engine | **COMPLETED** |
| 4 | Media / Reel / Video Engine | **READY** |
| 5 | Subscriptions, Credits & Billing | NOT STARTED |
| 6 | Social / WhatsApp / Publishing | NOT STARTED |
| 7 | Analytics, Admin & Business Intelligence | NOT STARTED |
| 8 | Production Hardening & Launch | NOT STARTED |

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
- Server-only: `AI_PROVIDER` (`gemini`), `AI_MODEL` (`gemini-3.5-flash`), `GEMINI_API_KEY` (Sensitive, set in Vercel by the owner). Tests: `AI_PROVIDER=mock`, `AI_MOCK_DELAY_MS`, `AI_MOCK_SCENARIO`.

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
