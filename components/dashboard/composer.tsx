'use client'

import { ArrowRight, CalendarHeart, Lightbulb, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState, useTransition } from 'react'
import { quickCreateWithAI } from '@/app/dashboard/content/ai-actions'
import { Spinner } from '@/components/ui/spinner'
import {
  CONTENT_TYPE_ICONS,
  QUICK_CREATE_BRIEF_MAX,
  QUICK_CREATE_EXAMPLES,
  QUICK_CREATE_TYPES,
  type QuickCreateType,
} from '@/lib/config/content'
import { LANGUAGES, type LanguageCode } from '@/lib/config/languages'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils/cn'

/** One "Ideas for today" card, already translated on the server. */
export interface ComposerIdea {
  id: string
  festival: boolean
  title: string
  badge: string
  brief: string
  type: QuickCreateType
}

/*
 * Dashboard composer: "What shall we make today: a reel, a poster or a WhatsApp status?". The owner writes one sentence (or taps
 * an example), picks what it becomes and the language, and one tap creates the draft with AI
 * copy. AI runs only on this explicit tap; the server checks plan and burst limits.
 */
export function Composer({
  defaultLanguage,
  remaining,
  aiReady,
  ideas = [],
}: {
  defaultLanguage: LanguageCode
  /** AI text generations left this month (null when the plan has no metered limit data). */
  remaining: number | null
  aiReady: boolean
  ideas?: ComposerIdea[]
}) {
  const { t } = useI18n()
  const router = useRouter()
  const ids = { brief: useId(), hint: useId(), error: useId(), ideas: useId() }
  const [brief, setBrief] = useState('')
  const [type, setType] = useState<QuickCreateType>('POST')
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage)
  const [error, setError] = useState<{
    key: MessageKey
    draftId?: string
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const briefRef = useRef<HTMLTextAreaElement>(null)
  const applyIdea = (idea: ComposerIdea) => {
    setBrief(idea.brief)
    setType(idea.type)
    setError(null)
    briefRef.current?.focus({ preventScroll: true })
    briefRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const outOfUses = remaining !== null && remaining <= 0
  const tooShort = brief.trim().length < 5

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (tooShort || pending) return
    setError(null)
    startTransition(async () => {
      const result = await quickCreateWithAI({
        brief,
        content_type: type,
        language,
      })
      if (!result.ok) return setError({ key: result.error })
      const { id, aiError } = result.data!
      if (aiError) return setError({ key: aiError, draftId: id })
      router.push(`/dashboard/content/${id}?created=1`)
    })
  }

  return (
    <>
      {ideas.length > 0 && (
        <section aria-labelledby={ids.ideas} className="mb-5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 id={ids.ideas} className="flex items-center gap-1.5 font-display text-lg font-bold">
              <Lightbulb aria-hidden className="size-5 text-accent" />
              {t('ideas.title')}
            </h2>
            <p className="hidden text-xs text-muted-foreground sm:block">{t('ideas.subtitle')}</p>
          </div>
          <ul className="flex snap-x gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
            {ideas.map((idea) => {
              const Icon = idea.festival ? CalendarHeart : CONTENT_TYPE_ICONS[idea.type]
              return (
                <li key={idea.id} className="w-60 shrink-0 snap-start sm:w-auto">
                  <button
                    type="button"
                    onClick={() => applyIdea(idea)}
                    className={cn(
                      'flex h-full w-full flex-col gap-1.5 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-ring',
                      idea.festival
                        ? 'border-accent/50 bg-accent-soft hover:border-accent'
                        : 'border-border bg-card hover:border-primary/60',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                          idea.festival ? 'bg-card text-accent-foreground' : 'bg-primary-soft text-primary',
                        )}
                      >
                        <Icon aria-hidden className="size-3.5" />
                        {idea.badge}
                      </span>
                      <span className="text-xs text-muted-foreground">{t(`contentType.${idea.type}` as MessageKey)}</span>
                    </span>
                    <span className="font-semibold">{idea.title}</span>
                    <span className="line-clamp-2 text-sm text-muted-foreground">{idea.brief}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <form
        onSubmit={submit}
        aria-describedby={ids.hint}
        className="flex flex-col gap-4 rounded-3xl border-2 border-foreground bg-card p-4 shadow-[0_4px_0_var(--foreground)] transition focus-within:border-primary focus-within:shadow-[0_4px_0_var(--primary)] sm:p-5"
      >
        <label htmlFor={ids.brief} className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {t('composer.label')}
        </label>
        <textarea
          id={ids.brief}
          ref={briefRef}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          maxLength={QUICK_CREATE_BRIEF_MAX}
          rows={3}
          placeholder={t('composer.placeholder')}
          className="-mt-2 min-h-20 w-full resize-none bg-transparent text-lg leading-relaxed placeholder:text-muted-foreground/80 focus:outline-none"
        />

        <div className="flex flex-wrap gap-2" role="group" aria-label={t('composer.examples')}>
          {QUICK_CREATE_EXAMPLES.map((example) => (
            <button
              key={example.key}
              type="button"
              onClick={() => {
                setBrief(t(`composer.example.${example.key}` as MessageKey))
                setType(example.type)
              }}
              className="min-h-9 rounded-full border border-border bg-muted px-3 text-sm font-medium transition hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t(`composer.chip.${example.key}` as MessageKey)}
            </button>
          ))}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">{t('composer.makeAs')}</legend>
          <div className="flex flex-wrap gap-2">
            {QUICK_CREATE_TYPES.map((value) => {
              const Icon = CONTENT_TYPE_ICONS[value]
              const on = type === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setType(value)}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-ring',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary',
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                  {t(`contentType.${value}` as MessageKey)}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">{t('composer.language')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {LANGUAGES.map((lang) => {
              const on = language === lang.code
              return (
                <button
                  key={lang.code}
                  type="button"
                  lang={lang.code}
                  aria-pressed={on}
                  onClick={() => setLanguage(lang.code)}
                  className={cn(
                    'flex min-h-14 flex-col items-start justify-center rounded-2xl border-2 px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-ring',
                    on ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:border-primary/60',
                  )}
                >
                  <span className="font-semibold">{lang.nativeLabel}</span>
                  <span className="text-xs text-muted-foreground">{lang.sample}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        {error && (
          <p id={ids.error} role="alert" className="rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {t(error.key)}{' '}
            {error.draftId && (
              <Link href={`/dashboard/content/${error.draftId}`} className="font-semibold underline underline-offset-2">
                {t('composer.openDraft')}
              </Link>
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p id={ids.hint} className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Sparkles aria-hidden className="size-4 shrink-0 text-primary" />
            {!aiReady
              ? t('ai.error.notConfigured')
              : remaining === null
                ? t('composer.costOne')
                : t('composer.cost', { remaining: Math.max(remaining, 0) })}
          </p>
          <button
            type="submit"
            disabled={!aiReady || outOfUses || pending || tooShort}
            aria-describedby={error ? ids.error : undefined}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground shadow-[0_3px_0_rgb(0_0_0/0.25)] transition active:translate-y-0.5 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
          >
            {pending ? (
              <>
                <Spinner className="size-4" />
                {t('composer.making')}
              </>
            ) : (
              <>
                {t('composer.make')}
                <ArrowRight aria-hidden className="size-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </>
  )
}
