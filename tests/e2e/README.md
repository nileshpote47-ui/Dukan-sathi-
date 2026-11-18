# End-to-end tests

Playwright tests in `foundation.spec.ts` (Phase 1), `content.spec.ts` (Phase 2) and `ai.spec.ts` (Phase 3) drive the real app in a phone-sized browser and talk to the real Supabase project, so RLS is tested for real.

## Run

```bash
npm run build && AI_PROVIDER=mock npm start   # in one terminal; the AI tests need the mock provider
E2E_USER_A_EMAIL=... E2E_USER_A_PASSWORD=... \
E2E_USER_B_EMAIL=... E2E_USER_B_PASSWORD=... \
npm run test:e2e -- --trace off
```

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
