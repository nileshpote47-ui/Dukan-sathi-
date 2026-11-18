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
| `/dashboard/{create,content,calendar,analytics,settings}` | signed in + onboarded | Coming soon placeholders |

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
components/business/ shared business field groups + edit form
components/forms/    auth form (login / sign-up)
lib/auth/            DAL, auth error mapping
lib/supabase/        server client, proxy session helper, env
lib/services/        database writes (business, profile)
lib/validation/      Zod schemas (shared by client and server), ActionResult type
lib/config/          categories, languages, navigation, site constants
lib/i18n/            dictionaries, translator, client provider
lib/utils/           small pure helpers
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
```

`businesses` is designed for 1:N later: drop the `businesses_one_per_owner` index and add a business switcher. Nothing else assumes a single business except `getBusiness()`.

### RLS model

| Table | select | insert | update | delete |
|---|---|---|---|---|
| profiles | own (`auth.uid() = user_id`) | own | own (USING + WITH CHECK) | — (only via auth user deletion) |
| businesses | own (`auth.uid() = owner_id`) | own | own (USING + WITH CHECK) | own |

- `anon` has no privileges on either table; `authenticated` has only the listed ones.
- `WITH CHECK` on update stops a user handing a business or profile to someone else.
- `owner_id` defaults to `auth.uid()`; the app also passes the verified user id and never takes it from input.
- Check constraints repeat the main validation rules (category list, language list, phone, pincode, email, URL scheme, lengths), so bad data is rejected even if the app has a bug.
- Trigger functions use `set search_path = ''` and have `execute` revoked from API roles.

Tests: `supabase/tests/database/rls.test.sql` (pgTAP) and the API-level isolation test in `tests/e2e/foundation.spec.ts`.

## Service boundaries

- `lib/services/*`: all database writes. Each function resolves the user itself.
- `services/ai/types.ts`: `AIProvider`, `TextGenerationRequest`, `BusinessContext`. No implementation and no API calls in Phase 1. Phase 3 adds providers under `services/ai/providers/` and a selector, so pages never import a vendor SDK. The same pattern applies to payments (Phase 5) and messaging / social (Phase 6).

## Localization strategy

- Languages are configured in `lib/config/languages.ts` (`en`, `mr`, `hi`) and mirrored by a DB check constraint.
- Dictionaries live in `lib/i18n/messages/<code>.ts`. `en` is the typed source of truth (`MessageKey`); others are `Partial` and fall back to English key by key.
- Server Components: `getTranslator(profile.preferred_language)`. Client Components: `useI18n().t` from `I18nProvider`, which each layout sets up with the user's language. The `lang` attribute follows the language.
- Signed-out pages use English for now.
- Adding a language: config entry + dictionary file + registration in `lib/i18n/index.ts` + a migration for the check constraint.

## Future AI integration strategy

1. Implement `AIProvider` for a vendor in `services/ai/providers/<vendor>.ts` (server-only), with keys in server-only env vars.
2. Build `BusinessContext` from `businesses` + `profiles` (language, category, location, tagline).
3. Call providers only from Server Actions / Route Handlers, after checking the user (and, from Phase 5, their credits).
4. Store generated content in new tables with the same owner-based RLS.
