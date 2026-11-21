# Phase 9 — UX Refresh & AI Studio

Requested after launch readiness (Phase 8). Based on a study of a comparable creator tool's interaction patterns (not its brand or visuals) and of Dukaan Sathi's own screens. The study and an interactive mockup were shared as a separate page.

| Stage | Scope | Status |
|---|---|---|
| 1 | Dashboard composer, one-tap AI from the content page, grouped navigation, attention bell, Devanagari fonts, illustrated tool cards | **COMPLETED** (2026-11-21) |
| 2 | "Ideas for today" (festival calendar + ideas per business category), weekly progress from real data, real poster-template previews | Planned |
| 3 | Direct poster from a sentence (GPT Image 2.6 Sunburst; test: 8/8 Marathi/Hindi posters exact, ~$0.04 each), free stock photos (Pexels), voiceover for reels | Planned (needs `OPENAI_API_KEY` and plan limits) |

## Stage 1 — what changed

### Dashboard: "What do you want to sell today?"
- The page opens with one question and a composer (`components/dashboard/composer.tsx`): the owner writes one sentence in their own words or taps an example (Diwali offer, new stock, festival wishes, home delivery; text in en/mr/hi), chooses what it becomes (Post / Offer / Festival / WhatsApp) and the language on cards that show a sample line in that language.
- **Make it** runs `quickCreateWithAI` (`app/dashboard/content/ai-actions.ts`): validates (`quickCreateSchema`), creates a draft (title = first clause of the sentence, `lib/content/quick-title.ts`; the full sentence is kept as the description, word for word), then one AI generation through the shared `generateCopy` (`lib/services/ai-content.ts`: own business resolved on the server, plan limit + burst limit via `withUsage`). The owner lands on the content page with a "Your post is ready" confirmation. If the AI step fails (limit reached, provider down) the draft is kept and the message links to it.
- Remaining AI posts this month are shown under the heading and next to the button (from the Phase 5 usage summary; nothing is estimated).
- Below: a compact profile-completion strip, illustrated tool cards, recent content, content counts, and the plan with usage folded into "See this month's usage".

### Content page: Write with AI
- Content without AI copy shows **Write with AI** directly (`components/ai/write-with-ai-button.tsx` → `writeCopyForContent`): one explicit tap, metered like every generation, refuses to overwrite existing copy (Edit is still the place for new versions).

### Navigation
- Sidebar grouped into Create content / Reach customers / My shop (`NAV_GROUPS`, `lib/config/navigation.ts`), active item filled, the business card at the bottom (desktop and the phone "More" sheet).
- **Attention bell** (desktop sidebar and phone header) counts posts that failed in the last 7 days and accounts to reconnect (`getAttentionSummary`, head-only counts as the owner under RLS) and links to them; with nothing to do it says so.

### Look and feel
- Self-hosted Mukta (text) and Baloo 2 (headings) via `@fontsource` — both cover Latin and Devanagari, no external font requests; system fonts remain the fallback.
- New theme tokens (`--accent-foreground`, `--rose(-soft)`, `--indigo(-soft)`, light and dark) for illustrated tool cards; buttons and cards give press/hover feedback; `prefers-reduced-motion` respected globally.
- The shared AI generation code was moved out of the edit-page action into `lib/services/ai-content.ts`, so all three entry points behave identically.

### i18n
33 new strings in English, Marathi and Hindi (composer, examples, quotas, navigation groups, attention, Write with AI).

## Tests
- Unit: composer title + form input accepted by the content schema for every type and language, composer validation (strips client-supplied owner ids), example/language translations in en/mr/hi, navigation grouping (`tests/unit/hardening.test.ts`).
- E2E (`tests/e2e/experience.spec.ts`, mock AI): example sentence → Marathi offer with AI copy and the owner's words kept; Write with AI on the content page; grouped navigation, business card and bell, no horizontal scroll. Full regression: see PROJECT_PHASES.md.

## Not changed
No database migration; no new environment variables; no new paid API. AI still runs only on an explicit tap, through the existing provider, limits and logging.
