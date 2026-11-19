import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { FEATURE_KEYS } from '@/lib/config/billing'
import type { Plan } from '@/lib/data/billing'
import { formatPrice } from '@/lib/billing/format'
import type { MessageKey, Translate } from '@/lib/i18n'
import { cn } from '@/lib/utils/cn'

/** One plan: name, price per month, monthly limits (from the database), and an action. */
export function PlanCard({ plan, t, current, action }: { plan: Plan; t: Translate; current?: boolean; action?: ReactNode }) {
  return (
    <Card className={cn('flex flex-col gap-4', current && 'border-primary ring-2 ring-primary')} aria-label={plan.name}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold">{plan.name}</h3>
          {current && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{t('billing.currentPlan')}</span>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
      </div>
      <div>
        <p className="text-3xl font-bold">
          {formatPrice(plan.price_paise, plan.currency)}
          <span className="text-base font-medium text-muted-foreground"> / {t('billing.month')}</span>
        </p>
        {plan.price_paise > 0 && !plan.is_price_final && <p className="mt-1 text-xs text-muted-foreground">{t('billing.placeholderPrice')}</p>}
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {FEATURE_KEYS.map((key) => (
          <li key={key} className="flex items-start gap-2">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            {t(`billing.entitlement.${key}` as MessageKey, { n: plan.entitlements[key] })}
          </li>
        ))}
      </ul>
      {action && <div className="mt-auto">{action}</div>}
    </Card>
  )
}
