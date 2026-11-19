# Phase 7 — Analytics, Admin & Business Intelligence

## Objective
Show each owner what they created, published and used — and what performed — from real, persisted data; give the Dukaan Sathi team a secure, audited admin view of businesses, usage, subscriptions and publishing health.

## Analytics architecture
```
/dashboard/analytics ─► resolveRange (India days) ─► analytics_business_overview(from, to)   [SECURITY INVOKER → RLS]
                                                   └► billing_usage_summary()               [Phase 5, this month]
                       buildInsights() — deterministic rules on those numbers (no AI)
"Refresh numbers" ─► refreshEngagementAction ─► Connector.getContentMetrics (Meta / mock)
                     ─► publishing_save_metrics()  [server secret; own published jobs only] ─► publishing_metrics
/admin/* ─► requireAdmin() (server) ─► admin_* functions (SECURITY DEFINER: admin check + audit log)
```
- One aggregation function per page load; everything is computed in Postgres from the source tables (no copies, no warehouse, no materialized views). Indexes added only for the new query patterns: `content_items (owner_id, created_at)`, `publishing_jobs (owner_id, published_at) where PUBLISHED`, `publishing_attempts (finished_at) where FAILED`; existing indexes already cover media and usage.
- The owner function is `SECURITY INVOKER`: it runs as the signed-in owner, so RLS (Phases 1–6) decides every row; it also filters by `auth.uid()`.
- Analytics never write source data. The only new writes are engagement snapshots (server-only) and admin audit records.

## Metric definitions
| Metric | Definition (selected India-day range) |
|---|---|
| Content created | `content_items.created_at` in range (owner's); breakdown by type, language and **current** status |
| Content now | all-time totals by status (draft / ready / published) and upcoming scheduled (`SCHEDULED`, future date) |
| Published / failed / cancelled | publishing jobs whose *event time* is in range: `published_at`, last attempt, cancel time; queued jobs use their planned time |
| Publishing success | published ÷ (published + failed); **"—" when nothing finished** (never 0% or 100% from no data) |
| By channel | the same job counts per channel |
| Scheduler delay | average `published_at − scheduled_for` for scheduled posts |
| AI content / pictures / storyboards / posters / posts | `usage_ledger` USAGE rows in range: COMMITTED = used (charged), RELEASED = failed (not charged) — Phase 5 is the source of truth; counting starts when usage tracking started (Phase 5) |
| Media saved | READY `media_assets` in range, split by AI picture / upload / poster; failed generations separately |
| Connected channels | CONNECTED `social_accounts` now; accounts needing reconnection |
| WhatsApp | messages in range: sent, delivered, read, failed (from Meta status webhooks) |
| Engagement (external) | latest platform numbers per published post — Facebook: reactions, comments, shares; Instagram: likes, comments — only what the API returned |
| Activity charts | per India day (≤ 62 days) or per 7-day block (longer ranges): content created, posts published, AI content |
| Comparison | the previous period of the same length; no percentage when that period is empty ("None in the previous period") |

**No data vs zero:** a chart whose days are all zero shows an empty state, not a flat line; the success rate shows "—"; engagement not returned by a platform is omitted, never shown as 0.

## Date-range behaviour
- One timezone: India (Asia/Kolkata, UTC+05:30, no DST). Presets: Today, 7, 30, 90 days (each including today), This month, Last month, Custom (from/to India dates).
- Ranges are half-open `[India midnight of first day, India midnight after last day)`, capped at the end of today; the database groups days with the same timezone, so there are no off-by-one days around midnight UTC (unit-tested at 01:30 India time).
- Custom ranges: valid calendar dates, start ≤ end, not in the future, at most 366 days; otherwise a clear message and the default 30 days. The database refuses inverted or >367-day ranges too.

## Business insights
`lib/analytics/insights.ts` — plain rules on the numbers above, each stating the numbers it uses: no channel connected; accounts to reconnect; failures in the period; usage near a plan limit (Phase 5 limits); ready posts not scheduled; mostly drafts; upcoming scheduled posts; published more/less than the previous period (only when that period had posts); most active channel / most used format (only with a clear leader). No claims about sales, customers or sentiment; no AI.

## Provider analytics (external) and limitations
Checked against Meta's current reference (2026-11):
- **Instagram** (`IG Media`): `like_count`, `comments_count` readable with `instagram_basic` + `pages_read_engagement` (already granted).
- **Facebook Page posts**: `shares`, `comments.summary(total_count)`, `reactions.summary(total_count)` with `pages_read_engagement` (already granted).
- **Not shown**: reach, impressions, views, clicks — they need insights permissions (`instagram_manage_insights`, `read_insights`) that the app does not request.
- **WhatsApp**: delivery/read statuses only (already from webhooks). **Google Business Profile, YouTube**: no engagement numbers in this phase (would need the Business Profile Performance API / YouTube Analytics).
- Fetching is explicit ("Refresh numbers"), at most every 2 minutes per owner, skips posts refreshed in the last 15 minutes, covers the last 90 days (max 50 posts) and makes **one Graph call per account** (`?ids=…`). A failing or disconnected account never blocks analytics: the post keeps its older numbers or shows none, and the result reports how many could not be read.
- Adapter: `Connector.getContentMetrics` (`services/publishing/types.ts`), implemented in `providers/meta.ts` and `providers/mock.ts`; statuses OK / UNSUPPORTED / PERMISSION_DENIED / RATE_LIMITED / NOT_FOUND / ERROR. Adding a provider = implementing this method.

## Admin authorization
- Admins are rows in `public.admin_users` (RLS on, no API access), granted with SQL only:
  `insert into public.admin_users (user_id, note) select id, 'reason' from auth.users where email = '…';`
  Revoke: `delete from public.admin_users where user_id = '…';`
- `/admin/*` layout and every page call `requireAdmin()` on the server (non-admins get a 404; signed-out users go to login). Navigation is not a security boundary.
- Every `admin_*` database function checks `admin_users` itself (`admin:forbidden`, 42501) and is read-only; there are no destructive admin actions, and billing/payment state still changes only through signed webhooks (Phase 5).
- Pages: overview (range), businesses (search, category, plan, pagination, detail), users (search, pagination, detail), subscriptions (distribution, status filter), usage (range, by feature, top businesses), publishing (status/channel filters, last error), system (recent publishing failures by reason, stuck jobs, payment and Meta webhook results, failed operations, picture failures, scheduler last run, recent admin views).

## Audit logging
`admin_audit_logs`: actor, action (`ADMIN_VIEW_OVERVIEW / BUSINESSES / BUSINESS / USERS / USER / BILLING / USAGE / PUBLISHING / SYSTEM`), target type/id, small metadata (filters used: search text ≤ 60 chars, page, range), time. Written inside the same function call that reads the data, so a view cannot happen without its record. No tokens, passwords or payloads. Readable only through the admin system page.

## Privacy
- Owners see only their own rows (RLS + `auth.uid()` filters); cross-business access is tested at database and API level.
- Admin pages show what operations need: business names/locations, owner email (admin-only), counts, statuses, error codes. No tokens, no payment details, no customer phone numbers.
- CSV exports (content list, publishing history, usage) contain only the owner's own rows for the selected range; signed-out requests are redirected to login; formulas are neutralised; no secrets or contact lists. No admin export in this phase.

## Performance
Server-side aggregation in one function call per page; date filters in every query; indexed by owner + time; admin lists paginated (20, max 100); no provider calls on page load; engagement refresh batched per account; nothing cached that cannot be invalidated (pages render per request).

## Database (migrations)
| Migration | Change |
|---|---|
| `20261119144232_analytics_owner.sql` | `admin_users`, `admin_audit_logs`, `publishing_metrics` (+ RLS), indexes, `analytics_business_overview()`, `publishing_save_metrics()` |
| `20261119144416_admin_foundation.sql` | `admin_is_admin()`, `admin_authorize()` (internal), `admin_overview / list_businesses / business_detail / list_users / user_detail / subscriptions / usage / publishing / system` |

## Testing results
- Unit (Vitest): 191/191 — includes 22 analytics tests (India-day ranges incl. midnight edges, presets, custom-range errors, comparisons with empty previous periods, success rate with no data, insights, weekly bucketing, CSV escaping) and the `METRIC_STATUSES` config-sync check
- Database (pgTAP, `analytics.test.sql`): 31 assertions — RLS and grants on the new tables, owner isolation of `analytics_business_overview`, India-day grouping, range validation, secret-gated `publishing_save_metrics` (own published jobs only), admin functions refuse non-admins, audit records written
- E2E (Playwright, mock providers): 43/43 — 4 analytics/admin tests (empty states, real activity + date filters + engagement refresh + CSV, cross-owner isolation and admin 404s, admin pages + audit trail with `E2E_ADMIN=1`) and 39 regression tests; two Phase 2 assertions that expected Analytics to be "Coming soon" were updated
- lint · typecheck · build pass; Supabase security advisors: only the expected, documented findings (secret- or admin-gated SECURITY DEFINER functions; tables with RLS on and no API policies by design)
- Production data checked through the RPCs (admin overview, owner overview) against the live database

## Known limitations
- No reach/impressions/views (permissions not requested); no Google Business Profile / YouTube metrics; WhatsApp shows delivery/read only.
- AI/usage history starts with Phase 5 metering; content and publishing history is complete.
- Admin access is granted with SQL (no admin-management UI by design); admin pages are English-first (Marathi/Hindi fall back to English).
- Large ranges are computed on demand (fine at current scale; revisit with real volume in Phase 8).
