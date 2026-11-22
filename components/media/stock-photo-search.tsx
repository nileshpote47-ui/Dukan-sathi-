'use client'

import { Search } from 'lucide-react'
import { useId, useRef, useState, useTransition } from 'react'
import { saveStockPhotoAction, searchStockPhotosAction } from '@/app/dashboard/media/actions'
import { ActionError } from '@/components/billing/action-error'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'
import type { StockPhoto } from '@/services/stock/types'

export interface StockOptions {
  available: boolean
  /** Translated label → English search term (Pixabay searches in English). */
  suggestions: { label: string; q: string }[]
}

/*
 * Free stock photos (Pixabay). Search results are shown only while searching (the provider's previews);
 * a tapped photo is saved on the server into the owner's own private pictures, then selected.
 */
export function StockPhotoSearch({
  contentId,
  options,
  onPicked,
  disabled,
}: {
  contentId: string
  options: StockOptions
  onPicked: (picture: { id: string; url: string | null }) => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  const inputId = useId()
  const busy = useRef(false)
  const [query, setQuery] = useState('')
  const [last, setLast] = useState<{ q: string; page: number; total: number } | null>(null)
  const [photos, setPhotos] = useState<StockPhoto[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<MessageKey | null>(null)
  const [searching, startSearch] = useTransition()

  const search = (q: string, page = 1) =>
    startSearch(async () => {
      setError(null)
      const result = await searchStockPhotosAction({ query: q, page })
      if (!result.ok || !result.data) return setError(result.ok ? 'stock.error.unavailable' : result.error)
      setPhotos((prev) => (page === 1 ? result.data!.photos : [...prev, ...result.data!.photos]))
      setLast({ q, page, total: result.data.total })
    })

  const pick = async (photo: StockPhoto) => {
    if (busy.current) return
    busy.current = true
    setSaving(photo.id)
    setError(null)
    try {
      const result = await saveStockPhotoAction({ photo_id: photo.id, content_id: contentId })
      if (!result.ok || !result.data) return setError(result.ok ? 'errors.saveFailed' : result.error)
      onPicked(result.data)
    } finally {
      busy.current = false
      setSaving(null)
    }
  }

  const locked = disabled || saving !== null

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/50 p-3">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          if (query.trim().length >= 2) search(query.trim())
        }}
        className="flex gap-2"
      >
        <label htmlFor={inputId} className="sr-only">
          {t('stock.searchLabel')}
        </label>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('stock.placeholder')}
          maxLength={100}
          disabled={locked}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-base focus:outline-2 focus:outline-ring"
        />
        <Button type="submit" size="sm" disabled={locked || query.trim().length < 2} loading={searching}>
          <Search aria-hidden className="size-4" />
          {t('stock.search')}
        </Button>
      </form>

      {options.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('stock.suggestions')}>
          {options.suggestions.map((s) => (
            <button
              key={s.q}
              type="button"
              disabled={locked}
              onClick={() => {
                setQuery(s.q)
                search(s.q)
              }}
              className="min-h-9 rounded-full border border-border bg-card px-3 text-sm font-medium hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <ActionError messageKey={error} />

      {last && photos.length === 0 && !searching && <p className="text-sm text-muted-foreground">{t('stock.none')}</p>}

      {photos.length > 0 && (
        <>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={t('stock.results')}>
            {photos.map((photo) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => void pick(photo)}
                  disabled={locked}
                  aria-label={t('stock.use', { name: photo.photographer || 'Pixabay' })}
                  className="relative block aspect-square w-full overflow-hidden rounded-lg border bg-card focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {/* Provider preview, shown only while searching (allowed by Pixabay); the chosen photo is copied to our storage. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.previewUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                  {saving === photo.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Spinner className="size-6 text-white" />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {last && photos.length < last.total && (
            <Button type="button" variant="secondary" size="sm" onClick={() => search(last.q, last.page + 1)} loading={searching} disabled={locked}>
              {t('stock.more')}
            </Button>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        {t('stock.attribution')}{' '}
        <a href="https://pixabay.com/" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
          Pixabay
        </a>
      </p>
    </div>
  )
}
