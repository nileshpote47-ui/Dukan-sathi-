# Phase 1 — Foundation

## Objective
A real user can open the app, create an account, log in, stay logged in, complete business onboarding, reach a protected dashboard, view and edit their business, and log out — on a secure, mobile-first foundation ready for later AI features.

## Scope
**In:** email + password auth, sessions, protected routes, profiles and businesses with RLS, 7-step onboarding, dashboard shell and home, My Business view/edit, centralized categories and languages, localization foundation, design system, loading/empty/error states, validation, AI interface boundary, docs, tests.

**Out (later phases):** content creation, AI generation of any kind, media, payments and credits, WhatsApp / social publishing, analytics, CRM, admin.

## Implementation

| Area | Where | Notes |
|---|---|---|
| Sign up / login / logout | `app/(auth)/actions.ts`, `components/forms/auth-form.tsx` | Server Actions with `useActionState`; friendly error mapping in `lib/auth/errors.ts`; typed email kept after a failed attempt |
| Email confirmation | `app/auth/confirm/route.ts` | Handles `?code=` (PKCE) and `?token_hash=&type=` |
| Session | `proxy.ts`, `lib/supabase/proxy.ts` | Refreshes cookies each request; redirects signed-out users to `/login?next=…`; `next` is checked by `safeNextPath()` |
| Authorization | `lib/auth/dal.ts` | `requireUser()`, `getProfile()`, `getBusiness()`, `requireOnboardedBusiness()` |
| Onboarding | `app/onboarding/*` | Steps: name → category → contact → location → language → brand (optional, skippable) → review. Business row is created at step 2 (name + category are required by the DB) and each later step saves immediately. Returning users resume at the first incomplete step, with a "Welcome back" notice. Review lets you edit any section. |
| Dashboard | `app/dashboard/layout.tsx`, `page.tsx` | Greeting by time in India; business summary; profile completion (11 checks); disabled "Coming soon" quick actions; "No data yet" instead of metrics |
| My Business | `app/dashboard/business/*` | Read-only view, full edit form (all fields, owner name, language) with sticky Save on phones |
| Categories / languages | `lib/config/*` | Mirrored by DB check constraints; a unit test fails if they drift |
| Localization | `lib/i18n/*` | English complete; Marathi and Hindi partial with English fallback |

## Database schema

`profiles`: `id uuid pk`, `user_id uuid unique → auth.users`, `full_name`, `phone`, `preferred_language ('en'|'mr'|'hi')`, `created_at`, `updated_at`.

`businesses`: `id uuid pk`, `owner_id uuid → auth.users (default auth.uid())`, `business_name` (2–100), `business_category` (21 values), `description`, `phone`, `whatsapp_number`, `email`, `address_line`, `village`, `taluka`, `district`, `state`, `pincode` (`^[1-9][0-9]{5}$`), `country` (default India), `logo_url` (https only), `website_url`, `instagram_url`, `facebook_url`, `google_business_url` (http/https only), `brand_tagline`, `opening_hours`, `onboarding_completed_at`, `created_at`, `updated_at`. Unique index on `owner_id` (one business per owner for now).

Triggers: `set_updated_at` on both tables; `handle_new_user` on `auth.users` insert creates the profile.

## Security
- RLS on both tables with per-operation policies (`USING` + `WITH CHECK`); see docs/ARCHITECTURE.md.
- `anon` has no table access; trigger functions can't be called through the API.
- No service-role key anywhere; only public Supabase values in env.
- Ownership never comes from client input; `owner_id` is stripped from updates in `lib/services/business.ts`.
- Server-side validation of every action; DB check constraints as a second line.
- Safe redirects (`safeNextPath`), security headers (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`), `poweredByHeader` off.
- Supabase security advisors: no findings after the migrations.

## Testing

| Suite | Command | Result |
|---|---|---|
| Lint | `npm run lint` | pass |
| TypeScript | `npm run typecheck` | pass |
| Unit (Vitest) | `npm test` | 18 / 18 |
| Production build | `npm run build` | pass |
| Database RLS (pgTAP) | `npm run test:db` (needs Docker), or remotely: `node scripts/remote-db-test.mjs supabase/tests/database/rls.test.sql` and run the output through the Supabase SQL tool | 24 / 24 |
| End-to-end (Playwright, Pixel 5 viewport, real Supabase) | `npm run test:e2e` (see tests/e2e/README.md) | 8 / 8 |

The database tests cover the 8 required cases: anonymous users can't read profiles or create businesses; a user can read and update their own business; a user can't read, update or delete another user's business, or move ownership to another user. They also cover profile isolation, planting a business in someone else's name, one-business-per-owner, DB validation, and deleting your own business.

Manual-equivalent journey (automated): sign up form validation → login → session (reload + new tab) → onboarding (all 7 steps, validation errors, edit from review) → business creation → dashboard → business edit (invalid then valid values) → logout → protected page redirects. User A can't access user B's business, checked through the real Supabase API. Visual checks at 360px and 1280px: no horizontal scrolling, no console errors.

## Known limitations
- **Email sending:** the project uses Supabase's built-in email service, which is rate-limited (a few emails per hour) and for testing only. See "Action required".
- Logo upload deferred: needs a Storage bucket with owner-scoped policies. `logo_url` is ready.
- No password reset / change-email screens yet.
- Marathi and Hindi translations are partial; signed-out pages are English only.
- One business per account (by design for Phase 1).

## Action required (human)
1. **Email for sign-ups** (Supabase → Authentication): either set up custom SMTP (Auth → Emails → SMTP settings; e.g. Resend, Brevo, Amazon SES) for production, or, for a private beta, turn off "Confirm email" (Auth → Sign In / Providers → Email).
2. **URL configuration** (Supabase → Authentication → URL Configuration): set Site URL to the Vercel URL and add `https://<your-app>.vercel.app/auth/confirm` to Redirect URLs (keep `http://localhost:3000/auth/confirm` for development).
3. **Vercel**: import the GitHub repo and set the three environment variables from `.env.example`.

## Future dependencies
- Phase 2 builds content workflow tables on top of `businesses` (same owner-based RLS) and the dashboard shell / navigation.
- Phase 3 implements `services/ai` providers using `BusinessContext` built from `businesses` + `profiles.preferred_language`.
- Phase 5 adds credits/subscriptions keyed by owner; Phase 6 needs the WhatsApp number and social URLs collected here.
