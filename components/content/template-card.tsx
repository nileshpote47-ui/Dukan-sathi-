import { LayoutTemplate } from 'lucide-react'
import type { ContentTemplate } from '@/lib/data/content'
import { cn } from '@/lib/utils/cn'

/** Selectable template (radio styled as a card). Pass template = null for "No template". */
export function TemplateCard({
  template,
  name,
  checked,
  onSelect,
  noneLabel,
}: {
  template: Pick<ContentTemplate, 'id' | 'name' | 'description'> | null
  name: string
  checked: boolean
  onSelect: (id: string) => void
  noneLabel: string
}) {
  return (
    <label
      className={cn(
        'flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 transition',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
        checked ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/50',
      )}
    >
      <input
        type="radio"
        name={name}
        value={template?.id ?? ''}
        checked={checked}
        onChange={() => onSelect(template?.id ?? '')}
        className="mt-1 size-5 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-medium">
          {template && <LayoutTemplate aria-hidden className="size-4 text-muted-foreground" />}
          {template?.name ?? noneLabel}
        </span>
        {template && <span className="block text-sm text-muted-foreground">{template.description}</span>}
      </span>
    </label>
  )
}
