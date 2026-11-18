import { CONTENT_TYPE_ICONS, type ContentType } from '@/lib/config/content'
import type { MessageKey, Translate } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'

/** Big, tappable choice of content type (a radio button styled as a card). */
export function ContentTypeCard({
  type,
  t,
  name,
  checked,
  onSelect,
}: {
  type: ContentType
  t: Translate
  name: string
  checked: boolean
  onSelect: (type: ContentType) => void
}) {
  const Icon = CONTENT_TYPE_ICONS[type]
  return (
    <label
      className={cn(
        'flex min-h-24 cursor-pointer flex-col gap-2 rounded-2xl border bg-card p-4 transition',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
        checked ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/50',
      )}
    >
      <input
        type="radio"
        name={name}
        value={type}
        checked={checked}
        // onClick (not onChange) so tapping the already-selected card still continues.
        // Keyboard selection also fires click on radios.
        onClick={() => onSelect(type)}
        onChange={() => {}}
        className="sr-only"
      />
      <Icon aria-hidden className={cn('size-6', checked ? 'text-primary' : 'text-muted-foreground')} />
      <span className="font-semibold">{t(`contentType.${type}` as MessageKey)}</span>
      <span className="text-sm text-muted-foreground">{t(`contentType.${type}.help` as MessageKey)}</span>
    </label>
  )
}
