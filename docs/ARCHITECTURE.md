# Architecture

## Overview

```
Browser (phone first)
   │  HTTPS
   ▼
Next.js 16 on Vercel ──────────────► Supabase (ap-south-1)
 ├─ proxy.ts          session refresh + redirects    ├─ Auth (email + password)
 ├─ Server Components  read via DAL                   ├─ Postgres + RLS
 ├─ Server Actions     validate (Zod) → services      └─ (Storage: not used yet)
 └─ Client Components  forms, navigation, dialogs
```

Every database call runs **as the signed-in user** with the publishable key, so row level security decides what each request may see or change. There is no service-role key in the app.

## Routing

| Route | Access | Purpose |
|---|---|---|
| `/` | public | Landing page (static) |
| `/login`, `/signup` | public; signed-in users are redirected to `/dashboard` | Auth forms (`app/(auth)`) |
| `/auth/confirm` | public | Email-link landing: exchanges the code / verifies the token, then redirects |
| `/auth/error` | public | Invalid or expired link |
| `/onboarding` | signed in | 7-step business setup; redirects to `/dashboard` once finished |
| `/dashboard` | signed in + onboarded | Home |
| `/dashboard/business`, `/dashboard/business/edit` | signed in + onboarded | View / edit business |
| `/dashboard/business/marketing` | signed in + onboarded | Marketing preferences |
| `/dashboard/create?type=…` | signed in + onboarded | Content creation flow (type → details → review → save draft) |
| `/dashboard/content?q&type&status&view&page` | signed in + onboarded | Content list with search and filters |
| `/dashboard/content/[id]`, `/dashboard/content/[id]/edit` | signed in + onboarded (own content only) | Detail, status, schedule, delete / edit |
| `/dashboard/calendar?month&day` | signed in + onboarded | Month calendar of planned content |
| `/dashboard/settings` | signed in + onboarded | App language, notification preference |
| `/dashboard/analytics` | signed in + onboarded | Coming soon placeholder |

Access is enforced in three layers:
1. **`proxy.ts`** (Next.js 16's renamed middleware) refreshes the Supabase session cookie and redirects signed-out visitors to `/login?next=…`. A convenience, not a security boundary.
2. **Data Access Layer** (`lib/auth/dal.ts`): every page and Server Action calls `requireUser()` / `requireOnboardedBusiness()`, which verify the session with `supabase.auth.getClaims()`. Layouts are not trusted alone, because App Router layouts don't re-run on client-side navigation.
3. **Postgres RLS**: the final authority (see below).

## Frontend structure

```
app/                 routes (Server Components by default)
components/ui/       design system: Button, Input/Select/Textarea/Checkbox/Radio, Card,
                     Dialog (native <dialog>), Toast, FormField, Progress, Spinner,
                     LoadingState / Skeleton / EmptyState / ErrorState / ConfirmationState / FormError
components/layout/   Sidebar + MobileNav, Logo, PageHeader, ComingSoon, RouteError
components/business/ shared business field groups, business edit form, marketing preference form
components/content/  content cards, badges, form, filters, preview, status actions, calendar item, templates
components/forms/    auth form (login / sign-up)
lib/auth/            DAL, auth error mapping
lib/data/            content reads (call the DAL, filter by owner)
lib/content/         status lifecycle rules (mirror of the DB trigger)
lib/marketing/       pure builders for the AI-ready MarketingGenerationRequest
lib/supabase/        server client, proxy session helper, env
lib/services/        database writes (business, profile, content) + shared DB error mapping
lib/validation/      Zod schemas (shared by client and server), ActionResult type
lib/config/          categories, languages, navigation, site, content types/statuses/transitions, marketing options, category examples
lib/i18n/            dictionaries, translator, client provider
lib/utils/           small pure helpers (incl. IST date/calendar helpers)
services/ai/         AI interfaces only (Phase 3+)
types/database.ts    generated Supabase types
```

UI components use native elements (`<select>`, `<dialog>`, `<input type=radio>`) for phone usability and built-in accessibility, styled with Tailwind tokens from `app/globals.css` (light and dark). Touch targets are at least 44px.

### Forms and validation
Zod schemas in `lib/validation` are used twice: in the browser through React Hook Form (`zodResolver`) for instant feedback, and again inside every Server Action as the real check. Error messages are encoded translation keys (`msg('validation.tooShort', { min: 2 })`), so one schema produces translated errors. Server Actions return a typed `ActionResult` (`ok` / `error` / `fieldErrors`); raw database or auth errors are logged on the server and mapped to friendly messages.

### Rendering and caching
`cacheComponents` is **off** in `next.config.ts`. Almost every page depends on the signed-in user and must render per request; with Cache Components on, each cookie read would need extra Suspense / `use cache: private` handling for no Phase 1 benefit. Public pages (`/`, `/signup`, `/auth/error`) are still prerendered as static. Revisit when public, cacheable content exists.

## Supabase

- **Auth**: email + password. `@supabase/ssr` stores the session in cookies; `proxy.ts` refreshes it on every request and copies the library's no-cache headers onto responses, so a CDN never serves one user's cookie to another.
- **Sign-up**: `signUp()` stores the display name in user metadata; trigger `handle_new_user` creates the `profiles` row. If email confirmation is on, the user gets a link to `/auth/confirm?next=/onboarding`.
- **Migrations**: `supabase/migrations/*.sql`, applied in order (`supabase db push`, or through the Supabase MCP / dashboard SQL for this project).
- **Types**: `npm run db:types` regenerates `types/database.ts`.

### Database relationships

```
auth.users (Supabase)
  ├─1:1─ public.profiles   (user_id unique, on delete cascade)
  └─1:1─ public.businesses (owner_id, unique index businesses_one_per_owner, on delete cascade)
            └─1:N─ public.content_items  (business_id + owner_id → businesses(id, owner_id), on delete cascade)
                        └─N:1─ public.content_templates (template_id, optional, on delete set null)
```

The composite foreign key means a content item's `owner_id` always equals its business's `owner_id`; RLS additionally checks the business belongs to `auth.uid()` on insert and update.

`businesses` is designed for 1:N later: drop the `businesses_one_per_owner` index and add a business switcher. Nothing else assumes a single business except `getBusiness()`.

### RLS model

| Table | select | insert | update | delete |
|---|---|---|---|---|
| profiles | own (`auth.uid() = user_id`) | own | own (USING + WITH CHECK) | — (only via auth user deletion) |
| businesses | own (`auth.uid() = owner_id`) | own | own (USING + WITH CHECK) | own |
| content_items | own | own + business owned by user | own + business owned by user (USING + WITH CHECK) | own |
| content_templates | signed-in, active only | — (no privilege) | — | — |

- `anon` has no privileges on either table; `authenticated` has only the listed ones.
- `WITH CHECK` on update stops a user handing a business or profile to someone else.
- `owner_id` defaults to `auth.uid()`; the app also passes the verified user id and never takes it from input.
- Check constraints repeat the main validation rules (category list, language list, phone, pincode, email, URL scheme, lengths), so bad data is rejected even if the app has a bug.
- Trigger functions use `set search_path = ''` and have `execute` revoked from API roles.
- `content_items_guard` (trigger) enforces the content lifecycle: new rows are DRAFT; only DRAFT→READY, READY→SCHEDULED, SCHEDULED→DRAFT, DRAFT/READY→ARCHIVED; ARCHIVED is read-only; PUBLISHED cannot be set by users. Check constraints require a date for SCHEDULED and a product/offer/description for READY/SCHEDULED.

Tests: `supabase/tests/database/rls.test.sql` and `content.test.sql` (pgTAP), and the API-level isolation tests in `tests/e2e/foundation.spec.ts` and `content.spec.ts`.

### Dates and time zones
`timestamptz` in the database (UTC). The UI shows and accepts India time (IST, UTC+05:30, no daylight saving) through `lib/utils/datetime.ts`; the calendar computes month and day boundaries in IST.

## Service boundaries

- `lib/services/*`: all database writes. Each function resolves the user itself.
- `lib/data/*`: reads beyond the DAL's basics (content lists, counts, calendar ranges, templates). Same rule: resolve the user, filter by owner, rely on RLS as the final check.
- `services/ai/types.ts`: `AIProvider`, `TextGenerationRequest`, `BusinessContext`. No implementation and no API calls in Phase 1. Phase 3 adds providers under `services/ai/providers/` and a selector, so pages never import a vendor SDK. The same pattern applies to payments (Phase 5) and messaging / social (Phase 6).

## Localization strategy

- Languages are configured in `lib/config/languages.ts` (`en`, `mr`, `hi`) and mirrored by a DB check constraint.
- Dictionaries live in `lib/i18n/messages/<code>.ts`. `en` is the typed source of truth (`MessageKey`); others are `Partial` and fall back to English key by key.
- Server Components: `getTranslator(profile.preferred_language)`. Client Components: `useI18n().t` from `I18nProvider`, which each layout sets up with the user's language. The `lang` attribute follows the language.
- Signed-out pages use English for now.
- Adding a language: config entry + dictionary file + registration in `lib/i18n/index.ts` + a migration for the check constraint.

## Future AI integration strategy

Phase 2 prepared the input; Phase 3 adds the engine.
1. `lib/marketing/context.ts` builds a `MarketingGenerationRequest` (types in `services/ai/types.ts`): business facts + marketing preferences (`MarketingContext`) + the content request (type, product, offer, price, description, notes, CTA, language, template). Pure functions, unit-tested, no network.
2. Implement `AIProvider` for a vendor in `services/ai/providers/<vendor>.ts` (server-only), with keys in server-only env vars.
3. Call providers only from Server Actions / Route Handlers, after checking the user (and, from Phase 5, their credits).
4. Store generated outputs in new tables linked to `content_items`, with the same owner-based RLS.
