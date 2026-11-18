# Dukaan Sathi

AI-powered marketing assistant for small and local businesses in rural and semi-urban India — *"Your daily marketing assistant for your business."*

**Current state: Phase 2 (Core Dashboard & Content Workflow) complete.** Accounts, business onboarding and profile, a marketing dashboard, content drafts with a status lifecycle, scheduling, a calendar, templates and marketing preferences. AI generation arrives in Phase 3 — see [PROJECT_PHASES.md](PROJECT_PHASES.md).

## Technology
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth via `@supabase/ssr`) · Zod · React Hook Form · Lucide · Vitest · Playwright · Vercel.

## Prerequisites
- Node.js 22+
- A Supabase project (this repo's is `dukaan-sathi`, region ap-south-1)
- Optional: Docker + Supabase CLI (included as a dev dependency) for running Supabase locally and `npm run test:db`

## Local setup
```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

## Environment variables
| Name | Where to find it | Public? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API | yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys (`sb_publishable_…`) | yes (RLS protects data) |
| `NEXT_PUBLIC_SITE_URL` | Your app's URL, used in email links | yes |

No server secrets are needed in Phase 1. Never put a secret or service-role key in a `NEXT_PUBLIC_` variable.

## Supabase setup
1. Create a project and copy its URL and publishable key into `.env.local`.
2. Apply the migrations in `supabase/migrations/`, in order:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. Authentication → URL Configuration: Site URL = your app URL; add `<app-url>/auth/confirm` to Redirect URLs.
4. Authentication → Emails: configure custom SMTP for real users (the built-in sender is rate-limited), or turn off "Confirm email" for a private beta.

### Database migration process
1. Add `supabase/migrations/<timestamp>_<name>.sql` (`npx supabase migration new <name>`).
2. Apply it (`npx supabase db push`, or locally `npx supabase db reset`).
3. Regenerate types: `npm run db:types`.
4. Add pgTAP tests in `supabase/tests/database/` and run them.
5. Check Supabase → Advisors → Security.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types + TypeScript check |
| `npm test` | Unit tests (Vitest) |
| `npm run test:db` | Database RLS and lifecycle tests (pgTAP, `supabase/tests/database/`; needs local Supabase via Docker) |
| `npm run test:e2e` | Browser tests (Playwright) — see [tests/e2e/README.md](tests/e2e/README.md) |
| `npm run check` | lint + typecheck + unit tests + build (same as CI) |

## Deployment (Vercel)
1. Import the GitHub repository in Vercel (framework: Next.js, defaults are fine).
2. Add the three environment variables (Production and Preview), with `NEXT_PUBLIC_SITE_URL` set to the Vercel URL.
3. Deploy, then add the Vercel URL to Supabase's Site URL and Redirect URLs (see above).

Every push to `main` deploys automatically once connected. GitHub Actions CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests and build on every push.

## Documentation
- [CLAUDE.md](CLAUDE.md) — development rules
- [PROJECT_PHASES.md](PROJECT_PHASES.md) — phase ledger
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture, RLS, localization, AI boundary
- [docs/PHASE_1.md](docs/PHASE_1.md) — Phase 1 details, tests, limitations
- [docs/PHASE_2.md](docs/PHASE_2.md) — Phase 2 details: content workflow, lifecycle, templates, AI-ready data
