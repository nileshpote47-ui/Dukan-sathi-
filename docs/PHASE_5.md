# Phase 5 — Subscriptions, Credits & Billing

## Objective
A monetization foundation: data-driven plans with monthly entitlements, a free plan that keeps the app usable, an auditable credit ledger enforced server-side on the real Phase 3/4 operations, Razorpay subscriptions behind a provider abstraction, signed and idempotent webhooks as the only source of payment state, and billing pages for owners.

## Billing architecture
```
Business ─► current subscription (or Free) ─► plan ─► entitlements (monthly limits)
                                                         │
AI / media action ─► reserve usage (ledger) ─► operation ─► commit │ release
Pricing / Billing ─► startCheckout(plan slug) ─► Razorpay subscription (server) ─► Checkout (browser)
                 ─► confirmCheckout: signature verified server-side (progress only)
Razorpay ─► /api/billing/webhooks/razorpay ─► billing_process_webhook() ─► subscription + payment state
```
Responsibilities are separated:

| Concern | Where |
|---|---|
| Plans & entitlements (data) | `billing_plans`, `plan_entitlements`; read by `getPlans()` (`lib/data/billing.ts`) |
| Billing state (read) | `getBillingOverview()` — plan, current subscription, usage, payments |
| Entitlement + credit service | database functions `billing_reserve_usage` / `commit` / `release` / `usage_summary`; `withUsage()` (`lib/billing/usage.ts`) |
| Payment service | `services/billing/*` — `BillingProvider` interface, `RazorpayProvider`, `MockBillingProvider` |
| Webhook processing | `processBillingWebhook()` (`services/billing/webhook.ts`) → `billing_process_webhook()` (database) |
| Billing actions | `app/dashboard/billing/actions.ts` — `startCheckout`, `confirmCheckout`, `cancelSubscription`, `completeMockCheckout` (tests) |
| Display rules (mirror of the database) | `lib/billing/state.ts` |
| Config | `lib/config/billing.ts` (feature keys, statuses, plan order — no prices) |

## Plans (data-driven)
Seeded by migration; prices in paise; **placeholder prices** (`is_price_final = false`, shown as "Introductory price — not final yet") until approved:

| Plan | Price / month | AI content | AI pictures | Reel storyboards | Saved posters |
|---|---|---|---|---|---|
| Free | ₹0 | 30 | 3 | 5 | 10 |
| Starter | ₹199 (placeholder) | 200 | 20 | 30 | 100 |
| Growth | ₹499 (placeholder) | 600 | 60 | 100 | 300 |

Changing a price or a limit is a data change (migration) — no code. The server always reads price/currency from `billing_plans`; the client sends only a plan slug. No trial (not part of the approved commercial model).

## Entitlements → real operations
| Feature key | Operation (Phase) | Charged when |
|---|---|---|
| `ai_text_generation` | Generate / regenerate AI copy (3) | the AI returned valid copy |
| `image_generation` | Create picture with AI (4) | the picture was generated and stored |
| `reel_generation` | Create / rebuild reel storyboard (4) | the storyboard was built |
| `media_export` | Save poster (4) | the poster file and row were saved |
Uploads, viewing, editing and account/business management are never metered. Limits reset on the 1st of each month (India time).

## Credit ledger
`usage_ledger` rows (auditable, never a single mutable counter): `ALLOCATION` (+plan limit, once per business/feature/month — unique index), `ADJUSTMENT` (`plan_change`: top-up after an upgrade; never reduced on downgrade), `USAGE` (−1, `PENDING` → `COMMITTED` or `RELEASED`), plus `BONUS`/`REFUND`/`EXPIRY` for future admin use. Balance = sum for the month, counting committed rows and fresh (< 15 min) reservations.

### Usage enforcement
`billing_reserve_usage(feature)` resolves the signed-in owner's business, takes a per-business+feature advisory lock (two simultaneous requests cannot both take the last credit), allocates if needed, refuses with `billing:limit_reached` when the balance is below 1, and inserts a PENDING reservation. The server then runs the operation and **commits** on success or **releases** on failure; if a commit fails (released/stale) the result is not handed out. Negative balances are impossible. The owner sees a localised message ("You have reached your monthly AI content limit. Upgrade your plan…") with a **View plans** link.

## Razorpay integration
Verified against the current official docs (razorpay.com/docs, India): Subscriptions integration guide, states, subscription webhooks + sample payloads, webhook validation/idempotency/order, cancel and update APIs.
- **Monthly auto-renew** with Razorpay Subscriptions (cards / UPI AutoPay). REST API with Basic auth; no SDK dependency.
- `startCheckout`: plan from the database → `GET /v1/plans/:id` must match our amount, currency and monthly period (otherwise refused: a mis-mapped plan can never charge the wrong price) → `POST /v1/subscriptions` (`total_count` 120, `expire_by` +1 h, `notes` = business_id, owner_id, plan_slug) → Razorpay Checkout opens with the public key id and subscription id.
- `confirmCheckout`: `HMAC_SHA256(razorpay_payment_id + "|" + subscription_id, key_secret)` with the subscription id from our server (not from the checkout response), constant-time comparison. Verification shows "Payment successful. Activating…" — it does **not** activate the plan.
- **Upgrade**: Razorpay cannot change plans of UPI/eMandate subscriptions, so an upgrade is a new subscription; when it becomes active, the webhook result lists the older live subscription and the server cancels it at Razorpay immediately. **Downgrade**: cancel at period end, then choose the smaller plan.
- **Cancellation**: `POST /v1/subscriptions/:id/cancel` with `cancel_at_cycle_end: true`; the owner keeps paid access until the period end; the database records the request (`billing_mark_cancel_requested`, owner-only, flag only); the final `cancelled` state comes from Razorpay's webhook.

## Webhook handling
Endpoint: `POST /api/billing/webhooks/razorpay` (public route; no session).
1. Optional Node pre-check with `RAZORPAY_WEBHOOK_SECRET` (if set).
2. `billing_process_webhook(provider, event_id, raw_body, signature)` — **authoritative**: HMAC-SHA256 of the raw body with the secret stored in **Supabase Vault** (`razorpay_webhook_secret`); invalid → 401, missing secret → 503, unparsable → 400.
3. Idempotency: `billing_webhook_events` unique `(provider, x-razorpay-event-id)`; duplicates return 200 without changes; a FAILED event may be retried by Razorpay (non-2xx → retries for 24 h).
4. Subscription events (`subscription.authenticated/activated/charged/pending/halted/cancelled/completed/paused/resumed/updated`) upsert `business_subscriptions` (business and plan from the signed notes), normalised statuses, period dates; an older event never overwrites newer state (`last_event_at`). Payment entities upsert `billing_payments` by Razorpay payment id (a captured payment is never downgraded). Other events are logged as IGNORED (200).
5. The log stores ids, type, status and error only — no payloads or payment details.

### Status normalisation
| Razorpay | App | Paid access |
|---|---|---|
| active, resumed | ACTIVE | yes, until period end + 1 day (renewal webhook latency) |
| authenticated | AUTHENTICATED | no (shown as "Activating…") |
| pending, halted | PAST_DUE | **no** — a failed renewal pauses paid features immediately (Razorpay's period may already describe the unpaid month) |
| cancelled | CANCELLED | no (cancel-at-period-end keeps ACTIVE until then) |
| completed, expired | EXPIRED | no |
| paused | PAUSED | no |
Payments: created, authorized, captured, failed, refunded → CREATED, AUTHORIZED, CAPTURED, FAILED, REFUNDED.

## Subscription lifecycle (owner's view)
Free → Choose plan → Razorpay Checkout → "Payment successful. Activating…" → webhook → "Subscription active · renews automatically" → (renewal: `charged` extends the period; failure: "Payment failed", Free limits until paid) → Cancel at period end → "Subscription cancelled · active until …" → `cancelled` → Free.

## Database (migrations)
| Migration | Change |
|---|---|
| `20261119015138_billing.sql` | Tables, RLS, seeds, usage + webhook functions, grants |
| `20261119024319_billing_past_due_no_access.sql` | Paid access only while ACTIVE |

## Security
- Client can name a plan only; price, currency, limits, business and owner are resolved on the server. No client-provided price, discount, credit amount or status is ever accepted.
- Payment success is never taken from the browser; checkout signatures are verified server-side; plans activate only through signed webhooks.
- Secrets (`RAZORPAY_KEY_SECRET`, webhook secret) are server-only (Vercel Sensitive / Supabase Vault), never `NEXT_PUBLIC_`, never logged. `RAZORPAY_KEY_ID` is public by design (Checkout needs it).
- No Supabase service-role key exists in the app: all billing writes happen inside `security definer` functions with narrow entry points.
- The mock provider is refused in production (code and endpoint 404); the database accepts mock events only while a test secret exists in Vault.

## RLS
- `billing_plans`, `plan_entitlements`: read-only for everyone (active plans); no writes.
- `business_subscriptions`, `billing_payments`, `usage_ledger`: owners can **read** their own rows only; no insert/update/delete for anyone through the API.
- `billing_webhook_events`: RLS on, no policies (not readable).
- Callable functions: `billing_reserve_usage`, `billing_commit_usage`, `billing_release_usage`, `billing_usage_summary`, `billing_mark_cancel_requested` (signed-in, own business only); `billing_process_webhook` (signature-gated). All helpers revoked.
- Supabase advisors list these intentional definer entry points (WARN); there are no unprotected tables.

## Idempotency
Webhooks (event id), payments (provider payment id), subscriptions (provider subscription id), allocations (unique per business/feature/month), usage (reserve → single commit/release), checkout (UI lock; unpaid subscriptions expire after 1 h), upgrade cancellation (cancel of an already-cancelled subscription is ignored).

## Environment variables
`BILLING_PROVIDER`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_STARTER`, `RAZORPAY_PLAN_GROWTH`, optional `RAZORPAY_WEBHOOK_SECRET`; Vault secret `razorpay_webhook_secret`; tests: `BILLING_MOCK_WEBHOOK_SECRET` + Vault `mock_webhook_secret` (temporary). See `.env.example`.

## Testing
| Check | Result |
|---|---|
| Unit (`npm test`) | 126/126 (18 billing: signatures, mock provider, state, display rules, config) |
| pgTAP `billing.test.sql` (remote runner) | 36/36 — RLS, no direct writes, reserve/commit/release, limit enforcement, no negative balance, cross-owner isolation, webhook signature, idempotency, out-of-order events, upgrade, renewal, cancellation |
| E2E (`npm run test:e2e`, mock providers) | 32/32 — 6 billing (pricing, free limit + message, failed payment, paid checkout → webhook → Starter, forged/duplicate/renewal/cancel/expiry webhooks, security) + 26 regression |
| Lint · typecheck · build | clean |
| Live, production, Razorpay test mode | Starter checkout (test card) → `subscription.authenticated` / `charged` / `activated` processed (out of order) → ACTIVE until period end, payment ₹199 CAPTURED; cancel at period end keeps access; forged webhook → 401; `/api/billing/webhooks/mock` → 404; pricing page shows ₹0 / ₹199 / ₹499 |

The mock Vault secret is created only for an E2E run and rotated to an unknown random value afterwards.

## Known limitations
- Prices are placeholders (approval pending); Razorpay is in **test mode** — going live needs live keys, live plans, a live webhook and its secret in Vault.
- Upgrades start a new monthly cycle at the full price (no proration); downgrades need cancel-then-subscribe.
- Monthly limits reset by calendar month (India time), not by the subscription's billing date.
- No invoices/GST documents (Razorpay sends payment receipts); no refunds UI; no admin plan editor (plans change via migration).
- The Supabase `rls_enabled_no_policy` / definer-function advisor notes are intentional (see RLS).

## Future improvements
Live mode and final pricing; proration via Razorpay add-ons/offers; GST invoices; admin tools for credits (BONUS/REFUND rows already supported); usage analytics (Phase 7); annual plans; trial if approved.
