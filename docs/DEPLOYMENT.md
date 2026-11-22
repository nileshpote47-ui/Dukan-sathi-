# Deployment

How Dukaan Sathi is built, configured and deployed. Security model: [SECURITY.md](SECURITY.md). Day-to-day operations: [OPERATIONS.md](OPERATIONS.md).

## Production at a glance
| Part | Where | Notes |
|---|---|---|
| App | Vercel project `dukan-sathi` → **https://dukan-sathi-nine.vercel.app** | Next.js 16, Node 22, functions pinned to **Mumbai (`bom1`)** by `vercel.json`, next to the database |
| Database, auth, storage | Supabase project `dukaan-sathi` (`vqlojnnhefjrozwttkgz`), region `ap-south-1` (Mumbai), Postgres 17 | Free plan today — see [Launch checklist](#launch-checklist) |
| Scheduler | Supabase `pg_cron` job `publishing-runner` (every minute) → `pg_net` → `POST /api/publishing/run` only when a post is due | No Vercel cron needed |
| AI text | Google Gemini (`AI_MODEL=gemini-3.5-flash-lite`) | |
| AI pictures | Off (`MEDIA_PROVIDER` unset); posters from templates + uploaded photos work | Set `MEDIA_PROVIDER=gemini` to enable (may need a paid Gemini tier) |
| Direct posters | OpenAI `gpt-image-2.6-sunburst` (~$0.04 each), limits Free 3 / Starter 30 / Growth 70 per month | Owner must confirm text before publishing |
| Payments | Razorpay **test mode** | Live keys are a launch step |
| Social | Meta app in **development mode** (Facebook Pages + Instagram) | App Review is a launch step; WhatsApp / Google not configured |

## Local development
```bash
npm install
cp .env.example .env.local      # fill in the values (placeholders only in the example)
npm run dev                      # http://localhost:3000
npm run check                    # lint + typecheck + unit tests + build
```
Tests never call paid APIs: run the app with `AI_PROVIDER=mock MEDIA_PROVIDER=mock BILLING_PROVIDER=mock PUBLISHING_PROVIDER=mock` for end-to-end tests ([tests/e2e/README.md](../tests/e2e/README.md)). Every mock provider refuses to run when `VERCEL_ENV=production`.

## Environment variables
All are documented in `.env.example` (placeholders only). Real values live in `.env.local` (git-ignored) and in Vercel → Project → Settings → Environment Variables. Mark every secret **Sensitive**.

| Variable | Scope | Production | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | set | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | set | Publishable key (RLS protects data) |
| `NEXT_PUBLIC_SITE_URL` | public | set (production only) | App origin for email links, OAuth redirects, sitemap; falls back to the Vercel production URL |
| `AI_PROVIDER`, `AI_MODEL` | server | set | `gemini` + model |
| `GEMINI_API_KEY` | server secret | set | Gemini (text, and pictures if enabled) |
| `MEDIA_PROVIDER`, `MEDIA_MODEL` | server | unset | AI pictures off |
| `OPENAI_API_KEY` | server secret | set (Production + Preview) | Direct posters (GPT Image); set a monthly budget in the OpenAI dashboard |
| `DIRECT_POSTER_PROVIDER`, `DIRECT_POSTER_MODEL` | server | unset | Defaults: `openai` when the key is set, `gpt-image-2.6-sunburst` |
| `SARVAM_API_KEY` | server secret | set (Production + Preview) | Reel voiceovers (Sarvam Bulbul v3, ~₹3 per 1,000 characters); top up credits at sarvam.ai — when credits run out voiceovers fail safely and are not charged |
| `VOICE_PROVIDER`, `VOICE_MODEL` | server | unset | Defaults: `sarvam` when the key is set, `bulbul:v3`; `mock` only for tests |
| `PIXABAY_API_KEY` | server secret | set (Production + Preview) | Free stock photos (Pixabay, 100 requests/minute for the whole app; searches cached 24 h) |
| `STOCK_PROVIDER` | server | unset | Default `pixabay` when the key is set; `mock` only for tests |
| `BILLING_PROVIDER` | server | `razorpay` | |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | server secret | test keys | |
| `RAZORPAY_PLAN_STARTER`, `RAZORPAY_PLAN_GROWTH`, `RAZORPAY_PLAN_PREMIUM` | server | set (test mode) | Razorpay monthly plans (₹199 / ₹499 / ₹999); amounts are re-checked against `billing_plans` |
| `RAZORPAY_WEBHOOK_SECRET` | server secret | optional | Authoritative copy is Vault `razorpay_webhook_secret` |
| `PUBLISHING_SERVER_SECRET` | server secret | set | Same value as Vault `publishing_server_secret` |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | server secret | set | AES-256-GCM key for stored social tokens; changing it disconnects every account |
| `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID` | server secret | set | Facebook Login for Business |
| `META_WHATSAPP_CONFIG_ID`, `META_WEBHOOK_VERIFY_TOKEN` | server | unset | WhatsApp ("Not set up yet") |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | server secret | unset | Google Business Profile / YouTube ("Not set up yet") |

Only the three `NEXT_PUBLIC_` variables reach the browser. There is no Supabase service-role key anywhere in the app. Preview deployments are protected by Vercel Authentication and have no `NEXT_PUBLIC_SITE_URL` (they fall back to the production URL for links).

### Supabase Vault secrets (not in git)
| Name | Used by |
|---|---|
| `publishing_server_secret` | All secret-gated publishing/analytics functions; same as `PUBLISHING_SERVER_SECRET` |
| `publishing_runner_url` | `pg_cron` scheduler target (`https://<app>/api/publishing/run`) |
| `razorpay_webhook_secret` | `billing_process_webhook()` signature check |
| `mock_webhook_secret` | **Must not exist in production.** Created only for a test run and deleted afterwards (without it, mock payment events are refused as `not_configured`) |

## Supabase setup (new environment)
1. Create the project (region `ap-south-1`).
2. Apply migrations in order: `npx supabase link --project-ref <ref>` then `npx supabase db push`. All schema — tables, RLS policies, indexes, functions, the storage bucket, plans/entitlements seed data and the `pg_cron` job — is in `supabase/migrations/`.
3. Create the Vault secrets above (`select vault.create_secret('<value>', '<name>')`).
4. Authentication → URL Configuration: Site URL = app URL; Redirect URLs: `<app>/auth/confirm`.
5. Authentication → Emails: custom SMTP for real users (the built-in sender is rate-limited), then turn **Confirm email** on. Production currently has confirmation **off** (no SMTP yet), so anyone can sign up with an address they don't own.
6. Authentication → Passwords: enable leaked-password protection (Pro plan).
7. Grant the first admin with SQL (see [SECURITY.md](SECURITY.md#admin)).
8. Regenerate types after schema changes: `npm run db:types`; check Advisors → Security and Performance.

The production migration history matches `supabase/migrations/` file for file (checked in Phase 8; one index migration that had been run in the SQL editor was recorded in the history).

## Vercel deployment
- Git integration: every push to `main` deploys production; other branches get protected preview deployments. Build command `next build` (default), output default, Node 22.x.
- `vercel.json` pins functions to `bom1` (Mumbai). Long-running functions set `maxDuration` in code (scheduler 120 s). Server Action bodies are limited to 4 MB (`next.config.ts`; Vercel's hard limit is 4.5 MB).
- Security headers (HSTS, nosniff, frame deny, referrer, permissions) come from `next.config.ts`.
- After each deploy: open `/api/health` (expect `{"status":"ok"}` and the new `release`), then the landing page and the dashboard.

## OAuth and webhook URLs
Replace `<app>` with the production origin (today `https://dukan-sathi-nine.vercel.app`; update all of these together if a custom domain is added).

| Provider | Setting | Value |
|---|---|---|
| Supabase Auth | Site URL / Redirect URL | `<app>` / `<app>/auth/confirm` |
| Meta (Facebook Login for Business) | Valid OAuth Redirect URI | `<app>/api/social/meta/callback` |
| Meta | Deauthorize + Data deletion callback | `<app>/api/webhooks/meta/deauthorize` |
| Meta (WhatsApp) | Webhook callback URL | `<app>/api/webhooks/meta` (verify token = `META_WEBHOOK_VERIFY_TOKEN`) |
| Google OAuth | Authorized redirect URIs | `<app>/api/social/google_business_profile/callback`, `<app>/api/social/youtube/callback` |
| Razorpay | Webhook URL | `<app>/api/billing/webhooks/razorpay` (secret = Vault `razorpay_webhook_secret`) |
| Scheduler | Vault `publishing_runner_url` | `<app>/api/publishing/run` |

## Razorpay
Test mode today. To go live: create live plans with the same amounts as `billing_plans`, set live `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_PLAN_*` in Vercel (Production), add the live webhook with a new secret and store it in Vault (`vault.update_secret`), redeploy, then make one real low-value subscription and cancel it. Payment state changes only through signed webhooks (`billing_process_webhook`).

## Social providers
- **Meta**: the app is in development mode — only people with a role on the app can connect. For real customers: Business Verification + App Review for `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `business_management`, then switch the app to Live.
- **WhatsApp**: needs Tech Provider onboarding, an Embedded Signup configuration (`META_WHATSAPP_CONFIG_ID`), webhook verify token and approved marketing templates.
- **Google Business Profile / YouTube**: needs a Google Cloud OAuth client, Business Profile API access approval and OAuth verification.
Until configured, each channel shows "Not set up yet" and cannot be selected.

## Monitoring
- Server logs are one JSON line per event (`lib/observability/log.ts`; credentials redacted). Vercel → Logs: filter `level:error` or a prefix such as `[publishing]`, `[billing]`, `[ai]`, `[unhandled]`.
- Unhandled server errors (pages, actions, routes) are logged by `instrumentation.ts` with the digest the user sees as "Reference: …" on the error page.
- Health: `GET /api/health` → 200 `{"status":"ok"}` / 503 when the database does not answer within 5 s. Point an uptime monitor (e.g. any free HTTP monitor) at it.
- Business-level health: `/admin/system` (failed publishing, stuck jobs, webhook failures, scheduler last run, failed AI/picture operations).

## Backups and recovery
- **Today (Free plan)**: Supabase Free projects have no dashboard backups or point-in-time recovery, and pause after a week of inactivity. Upgrade the organization to **Pro** before onboarding real customers (daily backups kept 7 days, no pausing; PITR is an add-on).
- Until then, or in addition, take a logical backup: `npx supabase db dump --linked -f backup.sql` (schema) and `npx supabase db dump --linked --data-only -f data.sql` (data); store outside the repo.
- Critical data: `auth.users`, `profiles`, `businesses`, `content_items`, `media_assets` + storage bucket `business-media`, `business_subscriptions`, `billing_payments`, `usage_ledger`, `social_accounts` + `social_account_credentials` (encrypted with `SOCIAL_TOKEN_ENCRYPTION_KEY` — keep the key with the backup or owners must reconnect), `publishing_jobs`, `whatsapp_contacts`, Vault secrets.
- Storage files are not in database dumps: download the `business-media` bucket separately (Supabase CLI/S3 API) if pictures must survive a project loss.
- Restore: create/restore the project, apply migrations, import data, recreate Vault secrets, update Vercel variables if the project URL changed, redeploy, check `/api/health`.
- Nothing in production depends on local developer files.

## Rollback
- **App**: Vercel → Deployments → previous production deployment → "Instant Rollback" (or promote it). Rollbacks do not touch the database.
- **Database**: migrations are forward-only. Write a new migration that reverses the change; never edit applied migrations or reset production. Phase 8's migration (`rate_limits`) is additive: rolling the app back leaves an unused table/function, which is harmless.
- **Provider configuration**: keep the previous values (Razorpay keys/plans, Meta settings) until the new ones are verified; to revert, restore the Vercel variables and redeploy.
- **Disable a failing integration quickly** (no feature-flag platform; these switches already exist):
  - AI text: unset `AI_PROVIDER` → "Not set up yet"; AI pictures: unset `MEDIA_PROVIDER`.
  - Payments: unset `BILLING_PROVIDER` → upgrade buttons disabled; existing plans keep working.
  - Publishing: unset `PUBLISHING_SERVER_SECRET` in Vercel → no new posts and the scheduler stops sending (queued posts wait); or `select cron.unschedule('publishing-runner')` in SQL to pause the scheduler only.
  - A single social channel: remove its provider credentials (e.g. `META_APP_SECRET`) → that channel shows "Not set up yet".
  Redeploy after changing variables.

## Launch checklist
| Area | Item | State |
|---|---|---|
| App | Production build passes; critical journeys pass (e2e) | ✅ |
| App | No known P0/P1 defects | ✅ |
| Security | Secrets, RLS, authorization, webhook verification, uploads reviewed | ✅ ([SECURITY.md](SECURITY.md)) |
| Database | Migrations match production; indexes reviewed; backup/recovery documented | ✅ |
| Operations | Structured logs, error monitoring, health check, deployment and rollback documented | ✅ |
| UX | Mobile and desktop, accessibility, en/mr/hi checked | ✅ |
| **Manual** | Supabase **Pro** plan (backups, no pausing) + leaked-password protection | ⏳ owner |
| **Manual** | Custom SMTP, then turn "Confirm email" back on (off today) | ⏳ owner |
| **Manual** | Razorpay **live** keys, plans and webhook | ⏳ owner |
| **Manual** | Meta Business Verification + App Review → Live mode | ⏳ owner |
| Optional | Custom domain (then update every URL in the table above) | ⏳ owner |
| Optional | AI pictures (`MEDIA_PROVIDER=gemini`), WhatsApp, Google | ⏳ owner |
| Optional | External uptime monitor on `/api/health` | ⏳ owner |
