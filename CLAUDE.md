@AGENTS.md

# Dukaan Sathi — development rules

AI-powered marketing assistant for small local businesses in rural and semi-urban India.
Users are shop owners on smartphones with little digital-marketing experience.

## Before any work
1. Read `PROJECT_PHASES.md`: find the last completed phase and the next one.
2. Inspect the repository before modifying anything. Reuse what exists; never rebuild a completed phase.
3. Build **only** the phase you were asked for. Never start the next phase on your own. Stop when it is done.
4. Update `PROJECT_PHASES.md` and `docs/PHASE_<n>.md` at the end of every phase.

## Stack
Next.js 16 App Router · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres, Auth via `@supabase/ssr`) · Zod 4 · React Hook Form · Lucide · Vitest · Playwright · Vercel.
Next.js 16 differs from older versions: read `node_modules/next/dist/docs/` before using an unfamiliar API. Middleware is `proxy.ts`.

## Architecture rules
- Server Components by default; `'use client'` only for interactivity.
- Get the user and their data only through `lib/auth/dal.ts` and `lib/data/*` (which call the DAL and filter by owner). Every page and Server Action re-checks the session; layouts and `proxy.ts` are not security boundaries.
- Writes go through `lib/services/*`, after validating with the Zod schemas in `lib/validation/*`. Validate on the server even if the client already did.
- One Supabase client per request (`lib/supabase/server.ts`). No global clients.
- Config lives in `lib/config/*` (categories, languages, navigation, site, content types/statuses/transitions, marketing options). Never hard-code these lists in components.
- Content status changes must follow `STATUS_TRANSITIONS` (`lib/config/content.ts`), which mirrors the `content_items_guard` database trigger — change both together.
- Dates are stored as UTC and shown/entered in IST via `lib/utils/datetime.ts`.
- User-facing text lives in `lib/i18n/messages/*`. English (`en.ts`) is complete; other languages may be partial and fall back to English.
- AI, payments, WhatsApp, social APIs: only behind interfaces in `services/<area>/`. Never import a vendor SDK into pages or components.
- AI: call only `generateMarketingContent()` (`services/ai/service.ts`) from server code, after resolving the owner's business server-side. Prompts live only in `services/ai/prompts.ts`; output fields per type only in `OUTPUT_SPEC` (`services/ai/output.ts`). Generate only on explicit user action; no automatic retries; tests use `AI_PROVIDER=mock` (never a paid API).
- Media: pictures only through `generateMarketingImage()` (`services/media/service.ts`), prompts only in `services/media/prompts.ts` (visuals only — no text, prices or logos in pictures). Files go to the private `business-media` bucket under `<owner_id>/`, are inspected by content (`lib/media/image-file.ts`) and shown only via server-created signed URLs. Visual templates are keyed by Phase 2 template slugs (`lib/config/poster-templates.ts`). Tests use `MEDIA_PROVIDER=mock`.
- No fake functionality, fake metrics or fake integrations. Unbuilt features show "Coming soon".

## Security rules
- RLS on every table in `public`, with explicit policies per operation (`USING` + `WITH CHECK`). No "allow all authenticated" policies.
- Ownership comes from `auth.uid()`, never from client input or user metadata. Never accept `owner_id`/`user_id` from forms.
- Never expose a secret or service-role key to the browser. Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL` may be public. `GEMINI_API_KEY` and other AI keys are server-only and must never be logged.
- Show friendly messages; never show raw SQL/auth errors. Log details server-side.
- Redirect targets from query strings must pass `safeNextPath()`.

## Database rules
- Every schema change is a migration in `supabase/migrations/` (never dashboard-only changes).
- After a migration: run `npm run db:types`, add/adjust pgTAP tests in `supabase/tests/database/`, and check Supabase security advisors.
- Lists mirrored in DB check constraints (categories, languages, content types/statuses, marketing options) must match `lib/config/*` — `tests/unit/config-sync.test.ts` enforces this.
- Use `uuid` keys, `timestamptz`, `snake_case`. Trigger functions: `security definer` only when needed, `set search_path = ''`, and revoke `execute` from `anon`/`authenticated`.

## Naming
Files `kebab-case.tsx`; components `PascalCase`; functions/variables `camelCase`; DB `snake_case`; translation keys `area.name`.

## Testing (all must pass before a phase is complete)
`npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `npm run test:db` (or the remote runner, see docs/PHASE_1.md) · `npm run test:e2e` (see tests/e2e/README.md).

## Environment variables
Documented in `.env.example`. Real values go in `.env.local` (git-ignored) and Vercel. Never commit secrets or test passwords.

## Git
Meaningful commits per milestone (`feat:`, `fix:`, `test:`, `docs:`). Never commit `.env.local`. Do not rewrite shared history.
