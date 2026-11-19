# Phase 6 — Social / WhatsApp / Publishing

## Objective
Publish the content and media made in Phases 2–4 to connected channels — now or at a scheduled time — through provider adapters, with server-controlled status, Phase 5 credits, and an auditable history.

> “तयार केलेलं marketing content आता योग्य channel वरून publish आणि schedule करा.”

## Implemented channels

| Channel | Connect | Publishes | Status |
|---|---|---|---|
| Facebook Page | Facebook Login for Business (one login, Page access tokens) | Photo post (`/{page}/photos`) or text post (`/{page}/feed`) | Implemented |
| Instagram professional account | Same Meta login (account linked to the Page) | Single image (container → `media_publish`), JPEG made by the server | Implemented |
| WhatsApp Business | Embedded Signup v4 (Tech Provider flow) | **Approved MARKETING templates** to **opted-in** customers via the Marketing Messages API, one message per recipient (max 50 per send) | Implemented (needs Meta Tech Provider setup + approved templates) |
| Google Business Profile | Google OAuth (PKCE, offline) | STANDARD local post: summary + optional photo + call-to-action | Implemented (needs Google's Business Profile API access approval) |
| YouTube | Google OAuth | — needs a video file; Phase 4 has no video export, so publishing shows “needs a video (coming soon)” | Foundation: connect + adapter; no publishing |

Not implemented on purpose: Instagram Reels, carousels and stories, Facebook video, YouTube uploads (all need video export or are out of scope); analytics (Phase 7).

## Provider architecture
```
Publish page ─► publishContentAction (Zod) ─► createPublication (lib/services/publishing.ts)
   ownership from the session · channel rules (lib/publishing/compose.ts) · credits check
   picture → JPEG in <owner>/publishing/ + signed URL (lib/publishing/prepare-media.ts)
   ─► publishing_create_job()  [DB, server secret]
   ─► now: runPublishingJob()  |  scheduled: pg_cron ─► /api/publishing/run ─► runDueJobs()
runPublishingJob (services/publishing/runner.ts)
   publishing_begin_attempt()  QUEUED→SENDING once + 1 credit reserved + attempt row
   decrypt token (memory only) · refresh if needed (Google)
   Connector.publish()  ── services/publishing/providers/{meta,whatsapp,google,mock}.ts
   publishing_complete_attempt()  PUBLISHED + credit used + content PUBLISHED | FAILED/auto-retry + credit released
```
- `Connector` interface (`services/publishing/types.ts`): `isConfigured`, `getAuthorizationUrl`, `handleOAuthCallback`, `completeEmbeddedSignup`, `refreshCredentials`, `revoke`, `publish`, `listWhatsAppTemplates`. Validation is shared and pure (`validateDraft`), status comes from the database.
- `services/publishing/registry.ts` picks the adapter; account rows remember their provider.
- Channel limits live in one place: `CHANNEL_RULES` (`lib/config/publishing.ts`), with the doc source of each limit.

## OAuth flow
1. `GET /api/social/<connector>/connect` (signed-in, onboarded owner): state + PKCE verifier + user id + expiry in an **httpOnly cookie signed with the server secret** (10 minutes) → platform consent screen.
2. `GET /api/social/<connector>/callback`: state must match the cookie, same user, not expired; the code is exchanged **server-to-server** (Meta: short → long-lived user token → Page tokens; Google: PKCE + `access_type=offline`, all scopes must be granted).
3. Accounts are stored with `publishing_connect_account()` (tokens encrypted first); the owner returns to `/dashboard/accounts?connected=n` or `?error=<code>`; provider details never reach the browser.
4. WhatsApp: Facebook JS SDK Embedded Signup → code + WABA id + phone number id → `connectWhatsAppAction` → token exchange, the phone id is verified with that token, app subscribed to the WABA webhooks, number registered (PIN kept encrypted).

Redirect URIs to register: `https://dukan-sathi-nine.vercel.app/api/social/meta/callback`, `…/youtube/callback`, `…/google_business_profile/callback`.

## Token security
- AES-256-GCM in the server (`services/publishing/crypto.ts`), key `SOCIAL_TOKEN_ENCRYPTION_KEY` only in Vercel (Sensitive). Ciphertext in `social_account_credentials`: RLS on, **no privileges for any API role**.
- Read/write only through secret-gated functions; with a session they only return the caller's own accounts.
- Tokens are never logged, never in URLs (Meta calls use the `Authorization` header + `appsecret_proof`), never sent to the browser (verified by an e2e test).
- Expired/revoked tokens: provider errors map to `AUTHORIZATION_EXPIRED` and mark the account EXPIRED/REVOKED; publishing stops with “Reconnect”; Google tokens refresh automatically. Meta’s deauthorize/data-deletion callback (`/api/webhooks/meta/deauthorize`, signed_request) revokes accounts, deletes tokens and cancels queued posts. Disconnect deletes stored tokens (Google tokens are also revoked at Google).

## Publishing flow (owner)
Content (Ready / Scheduled / Published) → **Publish** → choose account → caption pre-filled from the saved AI copy (hashtags only for Instagram/Facebook), picture from the content’s posters/pictures → live channel preview and checks → **Publish now** or **Schedule** (India time, 5 min – 30 days ahead) → confirm checkbox → job → status card (`/dashboard/publishing?job=…`) with result, “View post”, retry/cancel/reconnect/upgrade as applicable.

### States
`QUEUED` (shown as *Scheduled* while its time is ahead) → `SENDING` → `PUBLISHED` | `FAILED`; `QUEUED` → `CANCELLED` by the owner. Only the database moves a job; owners cannot write jobs at all (no table privileges). A successful job sets the content to `PUBLISHED` (allowed only inside the definer functions — `content_items_guard`).

### Retries and duplicates
- Two active jobs for the same content and account are impossible (partial unique index); `QUEUED → SENDING` happens exactly once (double click, two runners).
- Publishing the same content again on the same account needs an explicit “Publish it again”.
- Automatic retry only for `RATE_LIMITED`/temporary errors where nothing was published, at most 3 attempts, delay from the provider (≥ 1 min).
- Timeouts are `UNKNOWN_ERROR`: never retried automatically (the post may exist). Instagram retries first check the earlier container (`status_code`) so a post is not published twice.
- Manual retry (owner) for retryable errors, at most 5 attempts; content/media errors need a new post.
- A job stuck in `SENDING` for 10 minutes is failed as unknown and its credit released.

### Billing (Phase 5 reused)
New metered feature `social_publishing` (Free 10 / Starter 60 / Growth 200 a month — data in `plan_entitlements`). Creation checks a credit is left; sending reserves one through the same ledger (`billing_reserve_for`), commits on success, releases on failure. Failed publishing never uses a credit.

## Scheduling architecture
- Vercel’s Hobby plan only allows daily cron jobs, so **Supabase `pg_cron`** runs `publishing_cron_tick()` every minute. It calls the app (via `pg_net`) **only when a job is due**: `POST /api/publishing/run` with `Authorization: Bearer <server secret>` (URL and secret in Vault: `publishing_runner_url`, `publishing_server_secret`).
- The endpoint checks the secret, then the database checks it again on every function. It runs up to 5 due jobs per call; jobs are idempotent (`begin_attempt` claims each job once).
- Times are stored as UTC and entered/shown in India time. The content’s Phase 2 planned date pre-fills the schedule; the calendar stays the single planning calendar.

## WhatsApp compliance
- Only customers with a recorded opt-in (who, how — in person / paper / website / SMS / call / WhatsApp message — and when) can be selected; the owner must confirm consent when adding them.
- STOP / “Stop promotions” replies (Meta webhook) opt the customer out for that business; the owner cannot undo a customer’s opt-out without recording new consent (database trigger). Opt-in is re-checked when a scheduled send actually runs.
- Only approved MARKETING templates, filled with the owner’s values; no free-form marketing messages, no imported lists, max 50 recipients per send, explicit confirmation.
- Message statuses (sent/delivered/read/failed) come from the signed `messages` webhook and only move forward.
- Marketing messages use the Marketing Messages API (Meta ends marketing messages on Cloud API on 2027-10-13).

## Webhook behavior
| Endpoint | Trust | Purpose |
|---|---|---|
| `GET /api/webhooks/meta` | `hub.verify_token` = `META_WEBHOOK_VERIFY_TOKEN` | Subscription handshake |
| `POST /api/webhooks/meta` | `X-Hub-Signature-256` (HMAC-SHA256 of the raw body, `META_APP_SECRET`) | WhatsApp statuses + STOP replies; idempotent by body hash (`publishing_webhook_events`); non-2xx → Meta retries for 7 days |
| `POST /api/webhooks/meta/deauthorize` (`?type=deletion`) | Meta `signed_request` | App removed / data deletion → accounts REVOKED, tokens deleted |
| `POST /api/publishing/run` | Server secret | Scheduler |
Instagram/Facebook/Google results are synchronous; no webhook is needed for them.

## Database
| Migration | Change |
|---|---|
| `20261119095729_publishing.sql` | `social_accounts`, `social_account_credentials`, `publishing_jobs`, `publishing_job_payloads`, `publishing_attempts`, `whatsapp_contacts`, `whatsapp_messages`, `publishing_webhook_events`; RLS; secret-gated functions; `social_publishing` entitlement; content guard; pg_cron + pg_net scheduler |
| `20261119100517_publishing_narrow_grants.sql` | Each entry point callable only by the role that needs it |
| `20261119101107_publishing_whatsapp_recipients.sql` | Opt-in re-checked at send time |

RLS: owners **read** their own accounts, jobs, attempts and messages; full CRUD only on their own WhatsApp contacts (business must be theirs); credentials, payloads and webhook events are not accessible at all. Indexes on owner/business, status + `scheduled_for`, provider ids. The Supabase advisor lists the secret-gated definer entry points (WARN, intentional, same model as Phase 5).

## Environment variables
`PUBLISHING_SERVER_SECRET` (= Vault `publishing_server_secret`), `SOCIAL_TOKEN_ENCRYPTION_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`, `META_WHATSAPP_CONFIG_ID`, `META_WEBHOOK_VERIFY_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; tests: `PUBLISHING_PROVIDER=mock`. Vault: `publishing_server_secret`, `publishing_runner_url`. See `.env.example`. A connector without its variables shows “Not set up yet — coming soon.”

## How to connect each channel (setup for the app owner)
**Facebook + Instagram**
1. developers.facebook.com → Create app → type *Business* → add **Facebook Login for Business**.
2. Facebook Login for Business › Settings: Valid OAuth Redirect URI `https://dukan-sathi-nine.vercel.app/api/social/meta/callback`; Deauthorize callback `…/api/webhooks/meta/deauthorize`; Data deletion request URL `…/api/webhooks/meta/deauthorize?type=deletion`.
3. Configurations › Create: *User access token*, permissions `pages_show_list, pages_read_engagement, pages_manage_posts, business_management, instagram_basic, instagram_content_publish` → copy the configuration id.
4. Vercel env: `META_APP_ID`, `META_APP_SECRET` (Sensitive), `META_LOGIN_CONFIG_ID` → redeploy.
5. In development mode, app admins/testers can connect their own Page and its linked Instagram professional account. Other businesses need App Review (Advanced Access) and Business Verification.

**WhatsApp** — add the WhatsApp product, become a Tech Provider, create an Embedded Signup v4 configuration (Cloud API + Marketing Messages API products) → `META_WHATSAPP_CONFIG_ID`; accept the Marketing Messages API terms; Webhooks: callback `…/api/webhooks/meta`, verify token = `META_WEBHOOK_VERIFY_TOKEN`, subscribe `messages`; create MARKETING templates in WhatsApp Manager and wait for approval.

**Google (YouTube, Business Profile)** — Google Cloud project → OAuth consent screen + Web client with the two redirect URIs → enable YouTube Data API v3 and the Business Profile APIs (request Business Profile API access; approval needs a profile verified 60+ days) → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## How to add another provider later
1. Channel value in `lib/config/publishing.ts` (`CHANNELS`, labels, icon, `CHANNEL_RULES`, connector, scopes) **and** in the migration check lists (config-sync test enforces both).
2. An adapter implementing `Connector` in `services/publishing/providers/<name>.ts` (map provider errors to the 10 error codes; never auto-retry a non-idempotent create).
3. Register it in `registry.ts`; add a mock behaviour in `providers/mock.ts`; unit tests against a stubbed `fetch`; translations.

## Testing strategy
- Unit (`tests/unit/publishing.test.ts`): encryption, OAuth state, Meta/Google error mapping, webhook signature + signed_request, WhatsApp webhook parsing, template filtering, channel validation, captions, input schemas, Meta and WhatsApp adapters against a stubbed `fetch` (success, expired token, rate limit, timeout, malformed response, safe retry, partial WhatsApp delivery).
- Database (`supabase/tests/database/publishing.test.sql`, pgTAP): RLS and privileges, secret gating, creation rules, exactly-once sending, credits, retry/cancel rules, scheduler claim + stuck jobs, cross-business isolation, disconnect, WhatsApp webhook idempotency/order/opt-out.
- End-to-end (`tests/e2e/publishing.spec.ts`, mock providers): connect all channels, CSRF/refused OAuth, publish now (Instagram JPEG), duplicates, schedule + cancel, failures/reconnect/retry/auto-retry, WhatsApp opt-in + templates + signed webhooks + STOP, security, disconnect, phone layout.
- No real platform is called in CI; the mock provider is refused in production and the scheduler does nothing in test mode.

TESTING_RESULTS

## Known provider limitations
- Meta: other businesses can connect only after App Review + Business Verification; a Page may require Page Publishing Authorization before Instagram publishing; 100 API posts per Instagram account per 24 h; Instagram images must be JPEG 4:5–1.91:1 (converted/validated here).
- WhatsApp: needs Tech Provider status, approved templates and per-user marketing limits set by Meta (messages may be undelivered — shown as failed); marketing messages are not delivered to US numbers.
- Google Business Profile: API access must be approved by Google; posts may stay in review (`PROCESSING`).
- YouTube: no publishing until video export exists; uploads from unverified Google projects may be private.
- Prepared pictures stay in the owner’s private folder (`<owner>/publishing/`); signed links expire 2 days after the scheduled time (a manual retry signs a new link).
- Disconnecting a Meta account does not remove the app in Facebook settings (one login covers several Pages); the page explains how.
