'use client'

import { Search } from 'lucide-react'
import Form from 'next/form'
import Link from 'next/link'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { CONTENT_TYPES, FILTERABLE_STATUSES } from '@/lib/config/content'
import type { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/provider'

/**
 * Search and filters for the content list. A plain GET form (works without
 * JavaScript); with JavaScript, changing a filter applies it immediately.
 */
export function ContentFilters({
  q,
  type,
  status,
  view,
}: {
  q: string
  type?: string
  status?: string
  view: 'list' | 'grid'
}) {
  const { t } = useI18n()
  const formRef = useRef<HTMLFormElement>(null)
  const apply = () => formRef.current?.requestSubmit()
  const hasFilters = Boolean(q || type || status)

  return (
    <Form ref={formRef} action="/dashboard/content" role="search" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
      {view === 'grid' && <input type="hidden" name="view" value="grid" />}
      <div className="flex gap-2">
        <label htmlFor="content-search" className="sr-only">
          {t('content.searchLabel')}
        </label>
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="content-search"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder={t('content.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Button type="submit">{t('content.apply')}</Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <label className="flex flex-col gap-1 text-sm font-medium sm:flex-row sm:items-center sm:gap-2">
          {t('content.typeLabel')}
          <Select name="type" defaultValue={type ?? ''} onChange={apply} className="sm:w-48">
            <option value="">{t('contentType.all')}</option>
            {CONTENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`contentType.${value}` as MessageKey)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium sm:flex-row sm:items-center sm:gap-2">
          {t('content.statusLabel')}
          <Select name="status" defaultValue={status ?? ''} onChange={apply} className="sm:w-44">
            <option value="">{t('contentStatus.all')}</option>
            {FILTERABLE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`contentStatus.${value}` as MessageKey)}
              </option>
            ))}
          </Select>
        </label>
        {hasFilters && (
          <Link
            href={view === 'grid' ? '/dashboard/content?view=grid' : '/dashboard/content'}
            className="col-span-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline sm:ml-auto"
          >
            {t('content.clear')}
          </Link>
        )}
      </div>
    </Form>
  )
}
