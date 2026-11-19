import { Progress } from '@/components/ui/progress'
import { FEATURE_LABELS, LOW_USAGE_SHARE, type FeatureKey } from '@/lib/config/billing'
import { usageLevel } from '@/lib/billing/state'
import type { UsageRow } from '@/lib/data/billing'
import type { MessageKey, Translate } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'

const LEVEL_STYLE = {
  available: 'bg-success-soft text-success',
  low: 'bg-muted text-foreground',
  reached: 'bg-destructive-soft text-destructive',
} as const

/** This month's real usage per metered feature (from the ledger). */
export function UsageList({ usage, t, compact }: { usage: UsageRow[]; t: Translate; compact?: boolean }) {
  return (
    <ul className="flex flex-col gap-4">
      {usage.map((row) => {
        const level = usageLevel(row.remaining, row.monthly_limit, LOW_USAGE_SHARE)
        const label = t(FEATURE_LABELS[row.feature_key as FeatureKey])
        return (
          <li key={row.feature_key} aria-label={label}>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">{label}</span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">{t('billing.usedOf', { used: row.used + row.reserved, limit: row.monthly_limit })}</span>
                {!compact && (
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', LEVEL_STYLE[level])}>
                    {t(`billing.level.${level}` as MessageKey, { n: row.remaining })}
                  </span>
                )}
              </span>
            </div>
            <Progress value={row.monthly_limit ? ((row.used + row.reserved) / row.monthly_limit) * 100 : 100} label={label} />
          </li>
        )
      })}
    </ul>
  )
}
