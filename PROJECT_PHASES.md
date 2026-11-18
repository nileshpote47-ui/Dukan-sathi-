# Dukaan Sathi — Project Phases

This file is the development ledger. Read it before starting any work.
Never mark a future phase complete. Never repeat a completed phase.

| Phase | Name | Status |
|---|---|---|
| 1 | Foundation | **COMPLETED** |
| 2 | Core Dashboard & Content Workflow | **READY** |
| 3 | AI Content Engine | NOT STARTED |
| 4 | Media / Reel / Video Engine | NOT STARTED |
| 5 | Subscriptions, Credits & Billing | NOT STARTED |
| 6 | Social / WhatsApp / Publishing | NOT STARTED |
| 7 | Analytics, Admin & Business Intelligence | NOT STARTED |
| 8 | Production Hardening & Launch | NOT STARTED |

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
Phase 2 — Core Dashboard & Content Workflow.
