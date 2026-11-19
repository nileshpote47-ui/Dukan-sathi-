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

The billing tests also need `BILLING_MOCK_WEBHOOK_SECRET` in the test environment and the SAME value stored in Supabase Vault as `mock_webhook_secret` while they run (`select vault.create_secret('<random>', 'mock_webhook_secret')`). Afterwards replace it with an unknown random value (`vault.update_secret(id, encode(extensions.gen_random_bytes(32), 'hex'))`) so mock events can never be accepted.

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
