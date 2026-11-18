# Phase 2 — Core Dashboard & Content Workflow

## Objective
Turn the Phase 1 dashboard into the place where a shop owner plans marketing: decide what to create, describe it, keep drafts, move them through a simple lifecycle, plan dates on a calendar, and record marketing preferences. This is the structured data the Phase 3 AI engine will use.

**One business input → one content workflow → many future marketing outputs.** No AI generation, publishing, payments or analytics in this phase.

## Scope delivered
| Area | What exists |
|---|---|
| Dashboard home | Time-of-day greeting (IST); "Complete your business profile" prompt below 100%; 5 quick actions; real counts (total, drafts, ready, scheduled); 5 most recent items; business summary |
| Quick actions | Create Post / Offer / Poster / Reel / WhatsApp Content → `/dashboard/create?type=…` (one shared flow) |
| Create flow | Step 1 type → Step 2 details → Step 3 review → Save as draft. AI notice shown; nothing generated |
| Content list | Search (title, product/service, offer), filter by type and status, list/grid view, most recently updated first, pagination (20), open, edit, delete drafts, create new |
| Content detail | All fields, business, language, template, dates; edit; allowed status changes; scheduling; delete with confirmation |
| Status lifecycle | Enforced in the UI, the server action and the database (see below) |
| Calendar | Month view (Monday first, IST), day selection, counts per day, upcoming list; built from links (no library, no client JS) |
| Marketing preferences | Content language, tone, target customers, usual CTA, promotional style, contact method, business description |
| Templates | 7 seeded, read-only templates; optional on content items; template CTA pre-fills an empty CTA |
| Settings | Account info, app language, product-update email preference (stored only) |
| AI readiness | `MarketingGenerationRequest` types + pure builder (`lib/marketing/context.ts`) |
| Navigation | Dashboard, Create, Content, Calendar, My Business, Settings; Analytics = Coming soon. Phone: bottom bar (Dashboard, Create, Content, Calendar, More) |

## New routes
| Route | Purpose |
|---|---|
| `/dashboard` | Upgraded home |
| `/dashboard/create` (`?type=POST…`) | Content creation flow |
| `/dashboard/content` (`?q&type&status&view&page`) | Content list |
| `/dashboard/content/[id]` | Detail, status, schedule, delete |
| `/dashboard/content/[id]/edit` | Edit (redirects to detail when archived) |
| `/dashboard/calendar` (`?month=YYYY-MM&day=YYYY-MM-DD`) | Calendar |
| `/dashboard/business/marketing` | Marketing preferences |
| `/dashboard/settings` | Settings |

Each has a loading skeleton; errors use the dashboard error boundary; unknown or foreign content ids show "Content not found" (same page for both, so nothing leaks).

## New components
`components/content/`: `ContentTypeCard`, `ContentStatusBadge` + `ContentTypeBadge` (`content-badges.tsx`), `ContentCard`, `ContentFilters`, `ContentForm`, `ContentPreview`, `ContentEmptyState`, `QuickActionCard`, `CalendarItem`, `TemplateCard`, `StatusActions`, `DeleteContentButton`.
`components/business/marketing-preference-form.tsx` (`MarketingPreferenceForm`).

Presentational components are hook-free and take the translator as a prop, so the same component renders in Server Components (`getTranslator`) and Client Components (`useI18n().t`). Only forms, filters, dialogs and status buttons are client components.

## Database changes
Migrations:
- `20261118181657_content_workflow.sql`
- `20261118182058_content_items_business_owner_index.sql`

**`content_items`**: `id`, `business_id`, `owner_id` (default `auth.uid()`), `template_id` (nullable → `content_templates`, on delete set null), `title` (2–120), `content_type`, `status` (default `DRAFT`), `language`, `product_name`, `price` (free text, e.g. "₹40/kg"), `description`, `offer_text`, `call_to_action`, `notes`, `scheduled_for` (timestamptz, planning only), `search_text` (generated, lower-case title + product + offer), `created_at`, `updated_at`.
- Composite foreign key `(business_id, owner_id) → businesses(id, owner_id)` (new unique constraint on businesses), so an item can only belong to a business of the same owner.
- Checks: scheduled needs a date; READY/SCHEDULED need a product, offer or description.
- Indexes: owner + updated_at, owner + status, owner + scheduled_for (partial), business + owner, template.

**`content_templates`**: `id`, `slug` (unique), `name`, `content_type`, `description`, `business_categories text[]` (empty = all), `languages text[]`, `default_cta`, `sort_order`, `is_active`, timestamps. Seeded: Product Showcase, Special Offer, New Arrival, Festival Offer, Customer Attraction, Educational Tip, Limited Time Offer.

**`businesses`** (new columns): `content_language`, `tone`, `target_customers`, `preferred_cta`, `promotional_style`, `preferred_contact_method`.
**`profiles`** (new column): `product_update_emails boolean default true`.

Controlled values (types, statuses, tones, styles, contact methods, languages) are check constraints mirrored in `lib/config/content.ts` and `lib/config/marketing.ts`; `tests/unit/config-sync.test.ts` fails if they drift.

## RLS policies
| Table | select | insert | update | delete |
|---|---|---|---|---|
| content_items | own (`auth.uid() = owner_id`) | own **and** business owned by them | own; new row must stay own and in their business | own |
| content_templates | signed-in, active only | — | — | — |

`anon` has no privileges on either table; `authenticated` cannot write templates at all (permission denied). The lifecycle trigger function is not executable through the API.

## Content lifecycle
```
            ┌──────────► ARCHIVED (read-only, can be deleted)
            │                ▲
 DRAFT ──► READY ──► SCHEDULED
   ▲                     │
   └─────────────────────┘ (back to draft clears the date)
```
Allowed: DRAFT→READY, READY→SCHEDULED, SCHEDULED→DRAFT, DRAFT→ARCHIVED, READY→ARCHIVED. New items always start as DRAFT. PUBLISHED exists for future publishing integrations but no user action can set it. READY and SCHEDULED require a product, offer or description; SCHEDULED requires a future date (checked by the app) and a date (checked by the DB).

Enforced in three places: `lib/content/status.ts` (which buttons appear, early errors), the server action/service (re-checks, `eq('status', current)` guard), and the `content_items_guard` trigger plus check constraints in the database.

**Scheduling** stores `scheduled_for` only. Dates are entered and shown in India time (IST, UTC+05:30) and stored as UTC. Nothing is published; the UI says so wherever scheduling appears.

## Template architecture
Templates are reference data managed only by migrations. A content item may reference one (optional). The create/edit form shows templates whose `content_type` matches (all templates for OTHER) and whose `business_categories` is empty or includes the business category. Choosing one pre-fills an empty call to action with the template's `default_cta`. There is no visual template or poster editor.

## Marketing preferences and AI readiness
`lib/marketing/context.ts`:
- `buildMarketingContext(business, profile)` → `MarketingContext` (business facts + preferences; content language falls back to the owner's app language).
- `buildGenerationRequest(context, item, template?)` → `MarketingGenerationRequest` (`services/ai/types.ts`). CTA precedence: item → template → business preference. Blank values are omitted.

Phase 3 can call these from a Server Action and pass the result to an `AIProvider`. No provider exists yet and no AI API is called.

Category-specific placeholder examples (e.g. "Basmati rice 5 kg" for grocery, "Hybrid cotton seeds" for agro input) come from `lib/config/category-examples.ts` + translations. They are UI hints only and never saved.

## Media assets
Not modelled in Phase 2. Phase 4 will add a `content_assets` table referencing `content_items` (owner-scoped RLS + Supabase Storage). Nothing in Phase 2 depends on it.

## Testing
| Suite | Result |
|---|---|
| Lint, TypeScript, production build | pass |
| Unit (Vitest) | 38 / 38 — lifecycle rules, IST conversion and month grid, list params and LIKE escaping, content and preference validation, marketing context, label coverage, config/DB sync |
| Database (pgTAP) | Phase 1 `rls.test.sql` 24 / 24 (re-run after the migration); Phase 2 `content.test.sql` 31 / 31 — own CRUD, no access to another user's content, no ownership transfer, no content in another user's business, template access, lifecycle rules |
| End-to-end (Playwright, phone viewport, real Supabase) | 15 / 15 — Phase 2 journey (login → dashboard → Create Post → product → offer → language → review → save draft → list → search/filters → open → edit → ready → schedule → calendar → dashboard), lifecycle rules, archive, delete confirmation, templates, marketing preferences, settings language switch, user A vs user B by URL and API, phone layout without horizontal scroll; plus all 8 Phase 1 regression tests |
| Supabase advisors | security: none; performance: covering index added (remaining notices are "unused index" on a new table) |

## Limitations
- No AI text, image, poster, reel or video generation (Phase 3–4).
- No publishing; PUBLISHED is never set; scheduling is planning only (Phase 6).
- Search is a simple case-insensitive match (no full-text ranking).
- Templates are English-only text; Marathi/Hindi translations of new screens are partial (English fallback).
- Calendar has no drag-and-drop or week view.
- The old single-column index `content_items_business_idx` is redundant (kept because the drop needed an approval that could not be shown); safe to drop later.

## Phase 3 dependencies
- `content_items` + `content_templates` + business marketing preferences (this phase).
- `MarketingGenerationRequest` / `buildGenerationRequest` (input shape for providers).
- `services/ai/types.ts` `AIProvider` interface (implement providers here).
- Where generated text will live (e.g. a `generations` or `content_outputs` table) is a Phase 3 decision.
