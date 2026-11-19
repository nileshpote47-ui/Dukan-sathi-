# Dukaan Sathi

AI-powered marketing assistant for small and local businesses in rural and semi-urban India — *"Your daily marketing assistant for your business."*

**Current state: Phase 4 (Media / Reel / Video Engine) complete.** Accounts, business onboarding and profile, a marketing dashboard, content drafts with a status lifecycle, scheduling, a calendar, templates, marketing preferences, AI-written marketing copy (Google Gemini) in English, Marathi and Hindi, template posters and social creatives, reel storyboards with preview, and a private media library. See [PROJECT_PHASES.md](PROJECT_PHASES.md).

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

Server-only (AI, Phase 3):

| Name | Purpose |
|---|---|
| `AI_PROVIDER` | `gemini` (production) or `mock` (tests). Unset = AI disabled |
| `AI_MODEL` | Optional, default `gemini-3.5-flash-lite` |
| `GEMINI_API_KEY` | Secret from [Google AI Studio](https://aistudio.google.com/apikey). In Vercel, mark it **Sensitive** |

Server-only (media, Phase 4):

| Name | Purpose |
|---|---|
| `MEDIA_PROVIDER` | `gemini` (AI pictures, reuses `GEMINI_API_KEY`) or `mock` (tests). Unset = AI pictures off; posters and storyboards still work |
| `MEDIA_MODEL` | Optional, default `gemini-3.1-flash-image` |

Never put a secret or service-role key in a `NEXT_PUBLIC_` variable. Automated tests use `AI_PROVIDER=mock` and never call a paid API (e2e: start the app with `AI_PROVIDER=mock MEDIA_PROVIDER=mock npm start`).

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
2. Add the environment variables (Production and Preview): the three `NEXT_PUBLIC_*` values, with `NEXT_PUBLIC_SITE_URL` set to the Vercel URL, plus `AI_PROVIDER=gemini` and `GEMINI_API_KEY` (Sensitive).
3. Deploy, then add the Vercel URL to Supabase's Site URL and Redirect URLs (see above).

Every push to `main` deploys automatically once connected. GitHub Actions CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests and build on every push.

## Documentation
- [CLAUDE.md](CLAUDE.md) — development rules
- [PROJECT_PHASES.md](PROJECT_PHASES.md) — phase ledger
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture, RLS, localization, AI boundary
- [docs/PHASE_1.md](docs/PHASE_1.md) — Phase 1 details, tests, limitations
- [docs/PHASE_2.md](docs/PHASE_2.md) — Phase 2 details: content workflow, lifecycle, templates, AI-ready data
- [docs/PHASE_3.md](docs/PHASE_3.md) — Phase 3 details: AI engine, provider, prompts, security, testing
- [docs/PHASE_4.md](docs/PHASE_4.md) — Phase 4 details: media storage, posters, templates, reel storyboards, providers, security, testing
