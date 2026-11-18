import { LANGUAGES } from '@/lib/config/languages'
import type { Translate } from '@/lib/i18n'
import { ContentTypeBadge } from './content-badges'

export interface ContentPreviewValues {
  content_type: string
  title: string
  product_name?: string | null
  offer_text?: string | null
  price?: string | null
  description?: string | null
  call_to_action?: string | null
  notes?: string | null
  language: string
}

/**
 * Read-only summary of what the owner entered. Used on the review step and the
 * detail page. Shows the owner's own words only — nothing is generated.
 */
export function ContentPreview({
  values,
  templateName,
  t,
  extraRows = [],
}: {
  values: ContentPreviewValues
  templateName?: string | null
  t: Translate
  extraRows?: [string, React.ReactNode][]
}) {
  const none = t('common.notAdded')
  const language = LANGUAGES.find((l) => l.code === values.language)
  const rows: [string, React.ReactNode][] = [
    [t('contentField.type'), <ContentTypeBadge key="type" type={values.content_type} t={t} className="text-foreground" />],
    [t('contentField.product'), values.product_name || none],
    [t('contentField.offer'), values.offer_text || none],
    [t('contentField.price'), values.price || none],
    [t('contentField.description'), values.description || none],
    [t('contentField.cta'), values.call_to_action || none],
    [t('contentField.language'), language?.nativeLabel ?? values.language],
    [t('contentField.template'), templateName || t('contentField.noTemplate')],
    [t('contentField.notes'), values.notes || none],
    ...extraRows,
  ]
  return (
    <dl className="grid gap-3">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-0.5 sm:grid-cols-[12rem_1fr] sm:gap-3">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className={value === none ? 'text-muted-foreground' : 'break-words whitespace-pre-line'}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
