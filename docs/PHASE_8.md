# Phase 8 — Production Hardening & Launch

## Objective
Make the product built in Phases 1–7 safe, reliable, observable and deployable for real customers, without adding product features. Fixes and hardening only.

## Preflight
All seven earlier phases were verified as implemented and working in the repository and on production (ledger, docs, migrations, routes, tests, live data). No phase was materially incomplete, so nothing was rebuilt.

## What changed
| Area | Change |
|---|---|
| Observability | `lib/observability/log.ts`: one JSON line per server event, credential fields and bearer/token values redacted, long text cut, release id attached. All 25 server modules switched from `console.*` to it |
| Error monitoring | `instrumentation.ts` `onRequestError`: every uncaught server error (render, route, action, proxy) → `[unhandled]` log line with digest, path, route type. No third-party service; the user-facing error page shows the digest as "Reference" |
| Health | `GET /api/health`: app + database check (one public price row, 5 s timeout), `no-store`, 200/503, release id; no secrets or user data |
| Abuse protection | Burst limits per user: `rate_limit_counters` + `rate_limit_hit()` (migration `20261119164803_rate_limits.sql`), limits in `lib/config/rate-limits.ts`, enforced in `reserveUsage()` (AI text, AI pictures, reels, poster exports), publishing (new + retry) and social connections (OAuth start, WhatsApp signup). Fails open; monthly plan limits still apply |
| Reliability | Error boundaries now call `retry()` (Next.js 16: fetches the page again; `reset()` only re-rendered, so "Try again" could never recover from a temporary server error). Added `app/error.tsx` (public pages) and `app/global-error.tsx` (root layout failures) |
| Performance | Vercel functions pinned to Mumbai (`vercel.json` `regions: ["bom1"]`), next to the database in `ap-south-1`; they ran in Washington (`iad1`), adding an intercontinental round trip to every database call |
| Security | Test-only `mock_webhook_secret` removed from production Vault (mock payment events now refused outright); `Strict-Transport-Security` header; unrecorded index migration recorded in production history |
| Launch UX | Landing page said "Content creation tools are coming soon" (false since Phase 2) → now lists real features; favicon (`app/icon.svg`), Open Graph/Twitter metadata, canonical URLs for `/` and `/pricing`, `robots.txt` (private areas disallowed), `sitemap.xml`; dashboard content marked with the owner's language (`lang`) for screen readers; Marathi/Hindi for rate-limit and error-reference messages |
| Docs | New `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/OPERATIONS.md`; README, ARCHITECTURE, e2e README updated |

## Security findings
Full model and results: [SECURITY.md](SECURITY.md).
- **No P0/P1 vulnerabilities found.** RLS is on for every `public` table; only public pricing is readable signed-out; no permissive "all authenticated" policies; storage is private with per-owner folders; all webhooks and the scheduler are signature/secret-verified and idempotent; mock providers are refused in production; no secrets in git; `npm audit` reports 0 vulnerabilities.
- Fixed: the production Vault still held a (rotated, unknown) `mock_webhook_secret` from test runs; it is now deleted so the mock payment path is closed by configuration, not only by secrecy.
- Fixed: a migration (`20261119003500_media_assets_business_owner_index`) had been run in the SQL editor and was missing from the migration history (schema was correct); recorded so `supabase db push` and fresh environments stay in order.
- Advisors (security): only intended findings — tables with RLS and no API policies (internal), secret/admin-gated `SECURITY DEFINER` functions, and leaked-password protection (needs the Pro plan; launch step).

## Performance findings
- Database: performance advisor reports no missing foreign-key indexes or slow RLS patterns; only "unused index" notices, expected at today's tiny volume (they serve analytics, publishing and admin queries). Lists are paginated (content, media, admin 20/page), analytics aggregate in one database call per page, no provider calls on page load.
- Biggest real bottleneck: function region (see above). Fixed.
- After the move, the health endpoint's database round trip is 32–62 ms warm (see Deployment status).
- Frontend: Server Components by default; client components only for forms/interactive parts; no heavy client libraries (charts are HTML/CSS); images served via signed URLs at their stored size. No changes needed.
- Not added on purpose: Redis, queues, caching layers — current load does not justify them.

## Reliability review
| Failure | Handling (existing + verified) |
|---|---|
| AI / picture provider down, timeout, rate limit | Friendly message, usage released (not charged), no automatic retries, logged |
| Payment failure / webhook failure | Plan unchanged; failed webhook events retried by Razorpay; idempotent |
| Social / OAuth failure | Short result code to the owner; account marked for reconnection when tokens expire |
| Publishing failure | Job FAILED with reason; limited automatic retry for temporary errors; manual retry capped at 5; stuck SENDING jobs failed and released by the scheduler; nothing silently lost |
| Analytics provider failure | Older numbers kept; page never blocked |
| Database / storage errors | Friendly messages; `[db]`/`[storage]` logs; error boundaries with retry and reference |

## Database
- 16 migrations; production history matches the repository file for file. All tables, RLS policies, indexes, functions, the storage bucket, plan seed data and the cron job are in migrations; only Vault secrets are (intentionally) outside git.
- A fresh-environment replay was **not** run here (no Docker/Supabase local stack in this environment); ordering and contents were verified against production instead. `npx supabase db reset` locally is the recommended check before the next schema change.
- New: `rate_limit_counters` (RLS on, no API access) and `rate_limit_hit()` (definer, `auth.uid()` only, anon revoked), with pgTAP tests.

## Backup and recovery
Documented in [DEPLOYMENT.md](DEPLOYMENT.md#backups-and-recovery). The project is on Supabase **Free**, which has no restorable dashboard backups and can pause; **upgrading to Pro before onboarding real customers is a launch requirement** (owner action). A backup restore was not verified, because the current plan offers none — not claimed.

## Deployment status
- Deployed to production (`main` → Vercel, release `db9997e`), status READY. `x-vercel-id: …::bom1::…` confirms functions now run in Mumbai.
- Production smoke checks (2026-11-19): `/api/health` 200 `{"status":"ok"}` with database round trips of **32–62 ms warm** (≈0.5–0.7 s on a cold start); landing, pricing, login, signup 200; `robots.txt`, `sitemap.xml`, `icon.svg` 200; HSTS present; `/dashboard`, `/admin` and the CSV export redirect signed-out visitors to login (307); scheduler call with a wrong secret 401; forged Razorpay webhook 401; mock payment provider 404 in production; landing page shows the real features; no runtime errors after the deploy.
- Signed-in journeys (sign up → onboarding → content → AI → poster → billing → connect → publish/schedule → analytics → admin) were verified end to end by the 49-test suite against the production database with mock providers, and live on production in earlier phases (Meta connect + Facebook/Instagram publishing in Phase 6, analytics/admin in Phase 7). No real payments or uncontrolled real-world posts were made for Phase 8.
- Preview builds use the same build; CI (GitHub Actions) runs lint, typecheck, unit tests and build on every push.

## Testing results
| Check | Result |
|---|---|
| TypeScript (`npm run typecheck`) | Pass |
| Lint (`npm run lint`) | Pass |
| Unit (Vitest) | **199 / 199** (was 191): +8 for log redaction, rate-limit config, robots/sitemap, burst limit before usage reservation |
| Database (pgTAP) | New `rate_limits.test.sql` **13 / 13** on the production database (transaction rolled back); earlier suites unchanged (no schema changes to their tables) |
| End-to-end (Playwright, mock providers, production Supabase) | **49 / 49**: 6 new hardening tests + 43 regression tests across all phases (signup/login/logout, onboarding, content, AI, media, billing, publishing, analytics, admin) |
| Production build (`npm run build`) | Pass |
| `npm audit` | 0 vulnerabilities |
| Supabase advisors | Security: intended findings only; Performance: unused-index notices only |

Critical journeys covered end to end: sign up → onboarding → dashboard → create content → AI generation → poster/media → plan limits and subscription (mock payments, signed webhooks) → connect channel (mock Meta) → publish now and schedule → analytics → admin → logout/login.

## Defect review
| Severity | Open items |
|---|---|
| P0 | None |
| P1 | None in the code. Launch gates that need the owner's accounts are listed below |
| P2 | Supabase Free plan (no backups, can pause) → upgrade to Pro; email confirmation off until custom SMTP; Razorpay in test mode; Meta app in development mode (only app testers can connect) |
| P3 | No Content-Security-Policy yet (needs nonces); AI pictures off (`MEDIA_PROVIDER` unset); WhatsApp/Google not configured; preview deployments have no `NEXT_PUBLIC_SITE_URL` (fall back to production URL); patch-level dependency updates available (React 19.3.1, supabase-js 2.119.2, …) — left for after launch to avoid churn; admin pages English-first |

## Launch decision
The application is **production-ready**: no known P0/P1 defects, every validation step passes, and security, operations and rollback are documented. Taking **paying real customers** additionally needs the owner-side settings in the [launch checklist](DEPLOYMENT.md#launch-checklist): Supabase Pro, custom SMTP + email confirmation, Razorpay live keys, and Meta App Review. These are account and business decisions, not code changes.

## Remaining manual production steps
1. Supabase: upgrade the organization to Pro; enable leaked-password protection.
2. Supabase Auth: add custom SMTP, then turn "Confirm email" on.
3. Razorpay: live plans + keys + webhook (see DEPLOYMENT.md → Razorpay), one real low-value test.
4. Meta: Business Verification and App Review, then switch the app to Live.
5. Optional: custom domain (update all URLs together), `MEDIA_PROVIDER=gemini`, WhatsApp, Google, an uptime monitor on `/api/health`.
