# Phase 3 — AI Content Engine

## Objective
Connect the Phase 2 content workflow to a secure, server-side AI layer so a shop owner can generate practical marketing copy from their business profile, marketing preferences, content type, template, language, tone and optional instructions — then review, edit, regenerate and save it as a draft. Text only: no images, video, publishing or billing.

## Architecture
```
Create flow / Edit page (client)
   │  Server Action: generateWithAI (app/dashboard/content/ai-actions.ts)
   ▼
requireOnboardedBusiness()  ── session + the owner's own business (never a client business_id)
aiGenerateSchema            ── validation + length limits (unknown keys stripped)
getTemplates()              ── active template only
buildMarketingContext()     ── lib/marketing/context.ts (business + preferences)
buildAIContentRequest()     ── + content request, template, language, tone, instructions, previous version
generateMarketingContent()  ── services/ai/service.ts (size limit, one call, metadata-only logs)
getAIProvider()             ── services/ai/provider.ts (AI_PROVIDER / AI_MODEL / GEMINI_API_KEY)
GeminiProvider | MockProvider ── services/ai/providers/*
normalizeAIOutput()         ── services/ai/output.ts (per-type schema → AIContentResponse)
   ▼
normalized AIContentResponse → editable panel → Save (content_items.generated_copy)
```

Files (following the existing `services/<area>/` convention for external services):

| File | Responsibility |
|---|---|
| `services/ai/types.ts` | `AIProvider`, `AIContentRequest`, `AIContentResponse`, `MarketingContext`, `AIError` |
| `services/ai/output.ts` | Output spec per content type, JSON schema for structured output, normalization/validation, `generatedCopySchema` for saved edits |
| `services/ai/prompts.ts` | All prompts (system rules, layers, language/tone/type/template guidance) |
| `services/ai/provider.ts` | Provider selection from env, `getAIConfig()`, `isAIConfigured()` (server-only) |
| `services/ai/service.ts` | `generateMarketingContent()` — the single entry point (server-only) |
| `services/ai/providers/gemini.ts` | Google Gemini via `@google/genai` |
| `services/ai/providers/mock.ts` | Deterministic test provider with failure simulation |
| `lib/marketing/context.ts` | Builds the context/request from stored data (pure) |
| `app/dashboard/content/ai-actions.ts` | `generateWithAI`, `saveContentCopy` Server Actions |
| `components/ai/*` | `AIContentPanel` (generate/review/edit/regenerate), `AICopyView`, `CopyTextButton` |

## AI provider abstraction
```ts
interface AIProvider {
  readonly id: string
  readonly model: string
  generateContent(request: AIContentRequest): Promise<AIContentResponse> // validated, normalized; throws AIError
}
```
- The UI never calls a provider; Server Actions call `generateMarketingContent()`.
- Provider SDK types never leave `services/ai/providers/*`; responses are normalized into `AIContentResponse`.
- Adding OpenAI later: `providers/openai.ts` implementing `AIProvider` (reuse `buildPrompt`, `outputJsonSchema`, `normalizeAIOutput`) + one `case` in `provider.ts` + `AI_PROVIDERS` entry. Nothing in the workflow changes.

## Configured provider
**Google Gemini** (Gemini Developer API) with `@google/genai` 3.x, default model `gemini-3.5-flash` (override with `AI_MODEL`). Integration verified against the SDK's bundled documentation/types:
- `ai.models.generateContent({ model, contents, config })` with `systemInstruction`, `responseMimeType: 'application/json'` and `responseJsonSchema` (structured output per content type).
- `httpOptions.retryOptions.attempts = 1`: the SDK retries up to 5 times by default; disabled because each call may cost money (the owner can press Regenerate).
- `httpOptions.timeout = 45 s`; `thinkingConfig.thinkingLevel = LOW` for Gemini 3 models (default high thinking made short copy slow enough to hit the deadline); temperature 0.7 (1.0 when regenerating for more variety); `maxOutputTokens 2048`.
- Blocked responses (`SAFETY`, `PROHIBITED_CONTENT`, …), empty text and non-JSON are turned into `AIError`s.

## Environment variables (server-only)
| Variable | Purpose |
|---|---|
| `AI_PROVIDER` | `gemini` or `mock`. Unset → AI disabled ("not configured" message, button hidden) |
| `AI_MODEL` | Optional model id (default `gemini-3.5-flash`) |
| `GEMINI_API_KEY` | Secret. Never `NEXT_PUBLIC_`, never logged or returned |
| `AI_MOCK_DELAY_MS`, `AI_MOCK_SCENARIO` | Tests only |

The mock provider is refused when `VERCEL_ENV=production`, so test output can never reach real users.

## Generation flow (UI)
Create → choose type → details (title, product/service, offer, price, description, CTA, **language**, **tone**, **template**, notes) → **Generate and review**: "Generate with AI" (optional extra instructions) → loading state, button disabled → AI result marked "AI-generated" with only the fields for that type → edit any field → **Regenerate** with optional suggestion chips (Make it shorter / more local / more premium / more energetic / simpler words / another version) or own text; the previous version can be restored → **Save as draft** (status DRAFT; scheduling stays in the Phase 2 workflow).

Edit page: the same panel generates from the item's saved details; a new version stays in the editor ("Not saved yet") until **Save AI content** — saved copy is never overwritten automatically. Detail page: read-only AI copy with label, provider/date, and **Copy text** for pasting into WhatsApp/Instagram.

Generation happens only on an explicit button press — never on page load, list, calendar or dashboard (tested).

## Business context
From existing data only (no duplicated tables): business name, category, location (village/taluka/district/state/pincode), description, tagline, target customers, opening hours; preferences: content language, tone, usual CTA, promotional style, preferred contact method. CTA precedence: content item → template default (suggested in prompt) → business preference.

## Content types and output
| Type | Asked from model | Stored / shown as |
|---|---|---|
| POST | headline, primary_text, call_to_action, hashtags | Headline, Primary text, Call to action, Hashtags |
| OFFER | headline, promotional_text, value_message, call_to_action, hashtags | Headline, Promotional text, Value message, CTA, Hashtags |
| POSTER | headline, supporting_text, offer_or_value, call_to_action | Headline, Supporting text, Offer or value, CTA |
| WHATSAPP | opening, message, call_to_action | Opening, Message, CTA |
| REEL | hook, short_script, call_to_action | Hook, Script, CTA (copy only — no video) |
| FESTIVAL | greeting, promotion, call_to_action | Greeting, Promotion, CTA |
| OTHER | headline, primary_text, call_to_action | Headline, Text, CTA |

## Language and tone
- English (natural Indian English), Marathi and Hindi (Devanagari; avoid unnecessary English; keep brand/product names). The prompt names the language explicitly and forbids mixing Marathi/Hindi.
- Tones reuse the Phase 2 values with explicit behaviour: Professional, Friendly, Local, Premium, Energetic, Traditional.

## Prompt architecture and factuality
Layers: system rules → BUSINESS → PREFERENCES → REQUEST → TEMPLATE (with per-template focus) → LANGUAGE → TONE → FORMAT (output keys) → PREVIOUS VERSION (regeneration) → OWNER'S EXTRA INSTRUCTIONS.
The system rules forbid inventing prices, discounts, specifications, certifications, phone numbers, locations, testimonials, stock, guarantees or medical outcomes, strengthening claims, excessive emojis and spam. Owner text is quoted as data, so instructions inside it cannot override the rules.

## Storage
Reuses `content_items` (migration `20261118185844_ai_generated_copy.sql`):
- `generated_copy jsonb` — the normalized, owner-edited copy (DB: must be an object, ≤ 12 KB; app: `generatedCopySchema`).
- `tone` — tone used (same check as business tone).
- `ai_provider`, `ai_model`, `ai_generated_at` — set **by the server** from its configuration when copy is saved after (re)generation; never taken from the client.
Not stored: prompts, extra instructions, raw provider responses, API keys. No separate generations table (not needed for Phase 3).

## Security
- Provider calls only in server code; `GEMINI_API_KEY` is server-only, never logged or returned; `.env*` git-ignored; `.env.example` documents names only.
- Every generation: authenticated session, the owner's own onboarded business resolved server-side (client `business_id`/`owner_id` are stripped), validated input, active template check.
- Saved copy goes through the same owner-filtered services and RLS as all content; archived items stay read-only (DB trigger).
- Logs contain provider, model, type, error code and duration only.

## Validation and limits
Content type, language, tone, template id, title (2–120), product (120), offer (300), price (50), description (1,000), CTA (120), notes (1,000), instructions (300), previous version (schema-validated), whole request ≤ 8,000 chars. AI output: per-type required fields, JSON only, text trimmed, over-long fields cut at a word boundary, hashtags normalized (max 8).

## Error handling
| Situation | Code | Owner sees |
|---|---|---|
| No provider/key, bad key, unknown model | `not_configured` | "AI generation is not configured yet. Please contact the administrator." |
| Timeout, outage, network, malformed/empty output, unexpected | `timeout` / `unavailable` / `invalid_response` / `empty_response` / `unknown` | "AI content generation is temporarily unavailable. Please try again." + Try Again |
| Rate limit / quota (429) | `rate_limited` | "Too many requests right now. Please wait a minute and try again." |
| Safety block | `blocked` | "The AI could not write this content. Please change the details and try again." |
| Invalid input | `invalid_request` / validation | field errors / "Some details are not valid." |
No automatic retries; Regenerate/Try Again are user-controlled.

## Testing
| Suite | Result |
|---|---|
| Unit (Vitest) | 77 / 77 — context, prompts (all languages/tones/types/templates, factuality rules, quoting), output normalization (malformed/empty/incomplete/oversized), mock provider (all types, languages, regeneration, 6 failure modes), Gemini provider with a fake client (structured-output config, no retries, blocked/empty/malformed replies, error mapping), provider config, service, input validation incl. stripping client `business_id` |
| Database (pgTAP) | `ai.test.sql` 8 / 8 (copy saved by owner, object-only, size limit, tone check, no cross-user read/write, archived read-only) + Phase 1 24 / 24 + Phase 2 31 / 31 |
| End-to-end (Playwright, mock provider, phone viewport, real Supabase) | 6 Phase 3 tests (full journey in Marathi with template + Local tone → generate → edit → regenerate → undo → regenerate → edit → save → list → open → verify; per-type structure for REEL/WHATSAPP/OFFER in Hindi/English; safe errors + Try Again; edit page does not overwrite saved copy until Save; each user's own business; no AI calls on page loads) + 15 Phase 1/2 regression |
| Real provider (Gemini, production) | 3 / 3 real-world cases — see below |

## Real-world checks (real Gemini)
Run on the deployed app (https://dukan-sathi-nine.vercel.app) through the real UI on a phone viewport, one generation per case, 2026-11-18, model `gemini-3.5-flash` with thinking level LOW.

| Case | Language / tone | Time | Result |
|---|---|---|---|
| Shree Ganesh Kirana (grocery), "Fresh basmati rice", offer "Special weekend offer" | Marathi / Local | 9.0 s | Pass — natural Marathi in Devanagari; mentions only the owner's weekend offer (no amount or discount invented); CTA to visit the shop; hashtags from name/place |
| Sai Mobile Point (mobile shop), "New smartphone", no offer | Hindi / Energetic | 3.0 s | Pass — Hindi in Devanagari; no brand, model, price, specification or EMI invented |
| Glow Salon (salon), "Hair styling", no offer | English / Premium | 4.4 s | Pass — polished Indian English; no price, discount or result guarantee invented |

Sample (grocery headline): "या वीकेंडला आणा ताजी बास्मती तांदूळ!"

**Model note.** The first runs used `gemini-3.8-flash`. Google returned `503 UNAVAILABLE` ("This model is currently experiencing high demand") and `504 DEADLINE_EXCEEDED` on every attempt (5 calls). The app handled each one correctly: a friendly message, Try Again, no automatic retry, and the provider's short error text logged without the prompt, output or key. Setting thinking level LOW alone did not help. With `AI_MODEL=gemini-3.5-flash` (now also the code default), all cases succeeded in 3–9 s. The model can be changed with `AI_MODEL` without a code change.

## Known limitations
- Provider availability: a model can be overloaded on Google's side (seen with `gemini-3.8-flash`); the owner then sees "temporarily unavailable" and can retry. Vercel functions currently run in `iad1` although `bom1` is configured (Phase 8 hardening).
- One business = one owner; no per-user rate limiting or credits yet (Phase 5). Duplicate clicks are prevented in the UI only.
- AI quality depends on the model; the owner must review before using (the UI says so).
- Regeneration keeps one previous version (undo), not a full history.
- Changing a content type after generation hides fields that do not apply; regenerate for the new type.
- Generated copy is not included in the content search.
- Templates and labels are English; Marathi/Hindi UI translations remain partial.

## Future improvements
OpenAI (or another) provider behind the same interface; server-side rate limits and credit accounting (Phase 5); generation history if needed; streaming output; translations of AI UI strings; using generated copy in posters/reels (Phase 4) and publishing (Phase 6).
