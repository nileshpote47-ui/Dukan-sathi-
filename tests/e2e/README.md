# End-to-end tests

Playwright tests in `foundation.spec.ts` (Phase 1), `content.spec.ts` (Phase 2), `ai.spec.ts` (Phase 3), `media.spec.ts` (Phase 4) and `billing.spec.ts` (Phase 5) drive the real app in a phone-sized browser and talk to the real Supabase project, so RLS is tested for real.

## Run

```bash
npm run build && AI_PROVIDER=mock MEDIA_PROVIDER=mock BILLING_PROVIDER=mock BILLING_MOCK_WEBHOOK_SECRET=<random> npm start   # mock providers
E2E_USER_A_EMAIL=... E2E_USER_A_PASSWORD=... \
E2E_USER_B_EMAIL=... E2E_USER_B_PASSWORD=... \
npm run test:e2e -- --trace off
```

If the browser can reach Supabase only through an outbound proxy, also set `E2E_BROWSER_PROXY` (e.g. to `$HTTPS_PROXY`); the media tests load signed image URLs from Supabase Storage.

The billing tests also need `BILLING_MOCK_WEBHOOK_SECRET` in the test environment and the SAME value stored in Supabase Vault as `mock_webhook_secret` while they run (`select vault.create_secret('<random>', 'mock_webhook_secret')`). Afterwards **delete** it (`delete from vault.secrets where name = 'mock_webhook_secret';`): without the secret, mock payment events are refused (`not_configured`), so production never accepts them.

Without the `E2E_USER_*` variables, only the signed-out tests run. Set `E2E_BASE_URL` to test a deployed site.

## Test users

Two **confirmed** users who have **no business yet**. Never use real customer accounts, and never commit the passwords.

Easiest: create them in Supabase → Authentication → Users → "Add user" with "Auto confirm user" ticked, with a display name in user metadata (`{"full_name": "E2E Owner A"}`), or via SQL with a confirmed `email_confirmed_at`.

`content.spec.ts` creates and deletes its own businesses and content. Reset the users before each full run anyway (the Phase 1 journey creates businesses). Run this in the Supabase SQL editor:

```sql
delete from public.businesses
where owner_id in (select id from auth.users where email in ('<user-a-email>', '<user-b-email>'));
update public.profiles set preferred_language = 'en'
where user_id in (select id from auth.users where email in ('<user-a-email>', '<user-b-email>'));
```

Delete the test users afterwards (Authentication → Users) if they were created in production.

## Publishing (Phase 6)

Start the app with mock social providers as well:
`PUBLISHING_PROVIDER=mock PUBLISHING_SERVER_SECRET=<the Vault value of publishing_server_secret> SOCIAL_TOKEN_ENCRYPTION_KEY=<32 random bytes, base64> META_APP_SECRET=<any test value>`,
and give the test runner the same `PUBLISHING_SERVER_SECRET` and `META_APP_SECRET`. No real platform is called:
the mock OAuth dialog redirects straight back, and captions containing `[mock:rate_limit]`, `[mock:expired]`,
`[mock:permission]`, `[mock:reject]`, `[mock:timeout]` or `[mock:malformed]` choose the provider outcome.
In mock mode the scheduler endpoint never runs jobs, so a local test server cannot touch real owners' scheduled posts.

## Analytics & admin (Phase 7)

`tests/e2e/analytics.spec.ts` runs with the publishing mock setup above. The admin test also needs `E2E_ADMIN=1` and test user A temporarily listed as an admin:
`insert into public.admin_users (user_id, note) select id, 'TEMPORARY e2e admin' from auth.users where email = '<E2E_USER_A_EMAIL>';`
Remove it afterwards: `delete from public.admin_users where note like 'TEMPORARY e2e admin%';`

## Hardening (Phase 8)

`tests/e2e/hardening.spec.ts`: health check, security headers, robots/sitemap/icon and landing copy, forged webhook and scheduler calls, signed-out access to private pages and APIs, and malformed or foreign IDs (another owner's content cannot be read, changed or deleted). The first five tests need no test users. Burst limits (`lib/config/rate-limits.ts`) are generous enough for the full suite; a whole run stays well below them.

## Publishing suite on Premium

Channels and accounts per post are plan data (Free: one Facebook Page or Instagram account; Starter: Facebook,
Instagram, Google Business Profile; Growth/Premium: every channel). `plan-channels.spec.ts` checks the Free rules
on every run. `publishing.spec.ts` connects every channel and posts to several accounts, so it needs a Premium
subscription for user A, which the browser cannot create. Run it with `E2E_PLAN=premium`; its setup prints the
new business id and waits (up to 6 minutes) while the operator adds a temporary subscription in the SQL editor:

```sql
insert into public.business_subscriptions (business_id, owner_id, plan_id, status, provider, provider_subscription_id, current_period_start, current_period_end)
select b.id, b.owner_id, (select id from public.billing_plans where slug = 'premium'), 'ACTIVE', 'mock', 'TEMP-e2e-premium-' || b.id, now(), now() + interval '1 day'
from public.businesses b join auth.users u on u.id = b.owner_id where u.email = '<E2E_USER_A_EMAIL>';
```

The suite deletes the shop at the end, which also removes this subscription. Without `E2E_PLAN=premium` the
suite is skipped.
