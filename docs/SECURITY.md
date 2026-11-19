# Security

The security model of Dukaan Sathi as built in Phases 1–8, and the results of the Phase 8 review. Deployment details: [DEPLOYMENT.md](DEPLOYMENT.md).

## Principles
- The database is the security boundary: every table in `public` has RLS; ownership always comes from `auth.uid()`, never from a form, URL or user metadata.
- No Supabase service-role key exists in the app. Trusted server operations run in `SECURITY DEFINER` functions that check a server secret kept in Supabase Vault (`set search_path = ''`, `execute` granted per role).
- Secrets live only in Vercel (Sensitive) and Vault. Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL` reach the browser.
- Users see friendly messages; raw SQL, auth and provider errors are logged on the server only (redacted).

## Authentication
- Supabase Auth (email + password) through `@supabase/ssr` with httpOnly cookies. `proxy.ts` refreshes the session on every page request and sends signed-out visitors on private routes to `/login?next=…` (`safeNextPath()` allows only same-site paths).
- `proxy.ts` and layouts are conveniences, not boundaries: every page, Server Action and route handler re-checks the user through `lib/auth/dal.ts` (`getClaims()`, verified JWT).
- Logout signs out on the server and clears cookies. Client components receive only display data (name, business, language) — never tokens or other users' data.
- Supabase Auth rate-limits sign-in and sign-up attempts. Email confirmation is currently **off** (no custom SMTP yet); turning it on is a launch step.

## Authorization
- Owner data: `lib/data/*` read through RLS and filter by owner; writes go through `lib/services/*` after Zod validation (`lib/validation/*`) on the server.
- IDs from URLs and forms are validated as UUIDs; a foreign or malformed ID returns "not found", never another owner's row (tested end to end: pages, API reads, updates and deletes).
- Content status changes follow `STATUS_TRANSITIONS`, mirrored by the `content_items_guard` trigger; `PUBLISHED` can only be set by the system.
- Plan limits are enforced in the database (`billing_reserve_usage`, serialised per business and feature); the browser cannot change plans or usage.
- Publishing/connection state changes only through secret-gated definer functions; the browser cannot mark a post as published.

### Admin
- Admins are rows in `public.admin_users`, granted only with SQL by the project owner:
  `insert into public.admin_users (user_id, note) select id, '<why>' from auth.users where email = '<email>';`
- `/admin/*` calls `requireAdmin()` on the server (non-admins get 404). Every `admin_*` function re-checks `admin_users` itself and writes `admin_audit_logs` in the same call. Admin pages are read-only.
- Production today has exactly one admin (the owner). Temporary test grants are removed after each test run.

## Row Level Security
- Checked in Phase 8 on production: every `public` table has RLS enabled; the only rows readable without signing in are active plans and their entitlements (public pricing). No policy uses `true` for signed-in users.
- Internal tables (`social_account_credentials`, `publishing_job_payloads`, webhook event logs, `admin_users`, `admin_audit_logs`, `rate_limit_counters`) have RLS on and **no** API policies; only definer functions touch them. Supabase reports these as "RLS enabled, no policy" (INFO) — intended.
- Supabase's "SECURITY DEFINER function executable" warnings are intended: each such function either checks the Vault server secret, checks `admin_users`, or acts only on `auth.uid()`'s own rows. They are covered by pgTAP tests in `supabase/tests/database/`.

## Secrets
- Phase 8 scan: no API keys, payment or OAuth secrets, tokens, private keys or JWTs in tracked files; `.env.example` contains placeholders only; `.env*.local` is git-ignored.
- Social access tokens are encrypted with AES-256-GCM (`SOCIAL_TOKEN_ENCRYPTION_KEY`) before storage and decrypted only on the server when posting.
- Logs: `lib/observability/log.ts` redacts fields named like tokens, secrets, passwords, authorization, cookies, signatures, keys, ciphertext and verifiers, masks `Bearer …` and token query values, and cuts long text. Error stacks are not logged; Next.js shows users a digest instead of error messages in production.
- Browser source maps are not published (Next.js default).

## Webhooks and external calls
| Endpoint | Verification | Idempotency |
|---|---|---|
| `POST /api/billing/webhooks/razorpay` | HMAC-SHA256 of the raw body with Vault `razorpay_webhook_secret`, checked inside `billing_process_webhook()`; 256 KB body cap; `mock` provider refused in production and has no secret in production Vault | `billing_webhook_events` unique per provider event id; failed events may be retried by the provider |
| `POST /api/webhooks/meta` | `X-Hub-Signature-256` HMAC with the Meta app secret (timing-safe) | Event hash recorded once |
| `POST /api/webhooks/meta/deauthorize` | Meta `signed_request` HMAC | Revocation is naturally idempotent |
| `POST /api/publishing/run` | `Bearer` server secret (timing-safe), re-checked by every database function | Jobs claimed with row locks; one attempt per job at a time; retries capped |
| OAuth callbacks | Signed (HMAC) httpOnly state cookie bound to the user, 10-minute expiry, PKCE for Google | Accounts upserted per external id |

Client-reported payment or publishing success is never trusted: checkout returns only update state through signed webhooks, and posts become `PUBLISHED` only from the provider's response on the server.

## Uploads and media
- Uploads go through Server Actions (4 MB request cap; files ≤ 3.5 MB). The file type is detected from its bytes (PNG/JPEG/WebP magic numbers in `lib/media/image-file.ts`), not from its name or MIME header; dimensions are checked.
- Storage paths are generated on the server as `<owner_id>/<uuid>.<ext>`; client filenames and paths are never used. The `business-media` bucket is private, limited to 3.5 MB and the three image types, and its policies allow each user only their own folder.
- Pictures are shown only via server-created signed URLs (1 hour; publishing URLs last until the scheduled time plus a grace period).

## Abuse protection
- Monthly plan limits (Phase 5) on AI text, AI pictures, reels, poster exports and publishing.
- Phase 8 burst limits per user (`lib/config/rate-limits.ts`, `rate_limit_hit()`): e.g. 20 AI texts / 5 min, 10 AI pictures / 5 min, 30 posts / 10 min, 20 connection attempts / 10 min. Fails open if the limiter is unreachable (the monthly limits still apply).
- Duplicate protection: one picture generation at a time per owner (unique index), duplicate-post guard on publishing jobs, idempotent webhooks, buttons disabled while pending.
- Analytics engagement refresh: 2-minute cooldown.

## HTTP hardening
`next.config.ts`: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (no camera/mic/location), no `X-Powered-By`. Private areas are `Disallow`ed in `robots.txt` and admin pages are `noindex`.

## Privacy
- Stored: account email, business profile, content, media, plan/usage, encrypted social tokens, WhatsApp opt-in contacts (phone + consent source). Payment card data never touches the app (Razorpay checkout).
- Admin pages show business names/locations, owner email, counts and statuses — no tokens, payment details or customer phone numbers. Every admin view is audited.
- CSV exports contain only the owner's own rows; formula injection is neutralised.
- Logs carry ids, codes and counts — not message text, phone numbers or tokens.

## Phase 8 review results
| Check | Result |
|---|---|
| Auth bypass (signed-out access to pages, APIs, admin) | Blocked (e2e) |
| Cross-business ID manipulation (read/update/delete) | Blocked (e2e + pgTAP) |
| Admin bypass by a normal owner | Blocked (404 + `admin:forbidden`) |
| Malformed input / IDs | Rejected (Zod, UUID checks; not-found pages) |
| Forged / unsigned webhooks and scheduler calls | 401 / 503 (e2e) |
| Duplicate webhook / payment / publishing | Idempotent (Phase 5/6 tests) |
| Unauthorized media access | Private bucket + per-folder policies + signed URLs |
| Dependencies | `npm audit`: 0 vulnerabilities |
| Fixed in Phase 8 | Removed the test-only `mock_webhook_secret` from production Vault; recorded an unrecorded migration; added burst limits, HSTS, log redaction |

Open items (not code defects; see [DEPLOYMENT.md](DEPLOYMENT.md#launch-checklist)): leaked-password protection (Pro plan), email confirmation (needs SMTP). A Content-Security-Policy is not set yet (P3: needs nonce support for Next.js inline scripts).
