# Operations runbook

How to see what is failing in production and what to do about it. Setup and configuration: [DEPLOYMENT.md](DEPLOYMENT.md). Security model: [SECURITY.md](SECURITY.md).

## Where to look first
1. **`/api/health`** — `{"status":"ok"}` means the app runs and the database answers; `503` / `"degraded"` means the database did not answer within 5 s (check Supabase status, project paused?, plan limits).
2. **`/admin/system`** (admins) — recent publishing failures by reason, jobs stuck in SENDING, payment and Meta webhook results, failed AI/usage operations, failed pictures, the scheduler's last run, recent admin views.
3. **Vercel → Project → Logs** — one JSON line per event. Filter by `level:error`, or search the prefix:
   `[unhandled]` (any uncaught server error, with `digest`), `[publishing]`, `[billing]`, `[ai]`, `[storage]`, `[db]`, `[analytics]`, `[admin]`, `[rate-limit]`, `[health]`.
   When an owner reports "Something went wrong — Reference: 1234…", search the logs for that digest.
4. **Supabase → Logs / Advisors** — Postgres, Auth and API logs; security and performance advisors after every migration.

All logs are redacted (no tokens, secrets or message bodies), so they can be shared with support.

## Failed publishing jobs
- Owner view: Dashboard → Publishing → Failed (error in plain words, Retry button where it can help).
- Admin view: `/admin/publishing?status=FAILED` (last error per job) and `/admin/system` (failures by reason).
- SQL (Supabase SQL editor):
  ```sql
  select j.id, j.channel, j.status, j.error_code, j.attempt_count, j.scheduled_for, j.updated_at
  from public.publishing_jobs j where j.status in ('FAILED','SENDING') order by j.updated_at desc limit 50;
  select * from public.publishing_attempts where job_id = '<job id>' order by attempt_no;
  ```
- By error code: `AUTHORIZATION_EXPIRED` / `ACCOUNT_NOT_CONNECTED` → owner reconnects the account; `PERMISSION_DENIED` → owner reconnects and grants all permissions (or the Meta app lacks App Review); `INVALID_MEDIA` / `INVALID_CONTENT` → owner edits the post; `RATE_LIMITED` / `PROVIDER_ERROR` → retried automatically a limited number of times, then Retry; `ENTITLEMENT_LIMIT` → monthly plan limit reached.
- Stuck in SENDING: the scheduler marks jobs that stay in SENDING too long as FAILED and releases their usage on its next run; nothing is lost and the owner can retry. If posts are not going out at all: check the cron job (`select * from cron.job_run_details order by start_time desc limit 10;`), the Vault `publishing_runner_url`, and that `PUBLISHING_SERVER_SECRET` in Vercel equals Vault `publishing_server_secret`.

## Failed webhooks
- Payments: `select provider, provider_event_id, event_type, status, error, received_at from public.billing_webhook_events order by received_at desc limit 50;` — `FAILED` events are retried by Razorpay; `invalid_signature` responses (logged as `[billing] webhook`) mean the Razorpay webhook secret and Vault `razorpay_webhook_secret` differ.
- Meta/WhatsApp: `select * from public.publishing_webhook_events order by received_at desc limit 50;` — `[publishing] meta webhook rejected: invalid signature` means `META_APP_SECRET` is wrong or a forged call.
- Razorpay dashboard → Webhooks shows delivery attempts and lets you resend an event; resending is safe (idempotent).

## Billing failures
- `[billing] checkout failed` with `not_configured` → Razorpay keys or plan ids missing/wrong in Vercel.
- Owner paid but plan not active: find the webhook event (above); if it is missing, resend it from Razorpay. Never change `business_subscriptions` by hand — state changes only through `billing_process_webhook()`.
- Usage: `/admin/usage`; `select * from public.usage_ledger where business_id = '<id>' order by created_at desc;` (`RELEASED` = failed operation, not charged).

## AI and media failures
- `[ai] failed` with `unavailable` / `timeout` → Gemini overloaded; owners see "try again"; usage is released (not charged). If persistent, switch `AI_MODEL` to another available model and redeploy, or unset `AI_PROVIDER` to show "Not set up yet".
- `rate_limited` from Gemini → API quota reached (Google AI Studio → quota).
- Pictures: failed generations are marked FAILED (never READY) and released; `[storage]` errors point to bucket/policy problems.
- Owner hitting `errors.rateLimited` repeatedly → burst limits in `lib/config/rate-limits.ts`; counts per user in `rate_limit_counters`.

## Reconnecting provider accounts
- Owners: Dashboard → Connected accounts → Reconnect (needed after password change, revoked access, or token expiry; `AUTHORIZATION_EXPIRED`).
- If every Meta account fails at once: Meta app status (development mode / App Review), `META_APP_SECRET` changed, or Meta outage. Check `/admin/system` and the Meta developer dashboard.
- Rotating `SOCIAL_TOKEN_ENCRYPTION_KEY` makes every stored token unreadable: all owners must reconnect. Only rotate after a suspected leak.

## Common production errors
| Symptom | Likely cause | Action |
|---|---|---|
| `/api/health` 503 | Database down, paused (Free plan) or overloaded | Supabase dashboard → restore/resume; upgrade to Pro |
| Many `[unhandled]` errors after a deploy | Bad release | Vercel → Instant Rollback to the previous deployment, then investigate |
| Sign-up emails not arriving | Built-in Supabase email rate limit | Custom SMTP (launch step) |
| "Not set up yet" on a channel | Provider env vars missing | Set them in Vercel and redeploy |
| Scheduled posts late | Cron not running / runner URL wrong | `cron.job_run_details`, Vault `publishing_runner_url` |
| Owner sees "Too many attempts" | Burst limit hit | Wait the window; raise the limit in `lib/config/rate-limits.ts` if legitimate |
| Payments stuck "pending" | Webhook not delivered | Razorpay → resend webhook |

## Routine tasks
- **Weekly**: glance at `/admin/system`, Vercel errors, Supabase advisors; confirm a recent backup exists (Pro plan) or take a manual dump.
- **Grant/revoke admin**: SQL in [SECURITY.md](SECURITY.md#admin).
- **End-to-end test runs against production Supabase**: create Vault `mock_webhook_secret` and the temporary admin grant only for the run, and delete both afterwards ([tests/e2e/README.md](../tests/e2e/README.md)).
- **Housekeeping**: `rate_limit_counters` cleans itself per user; webhook event logs and audit logs grow slowly and can be archived later if needed.
