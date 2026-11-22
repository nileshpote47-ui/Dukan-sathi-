import { Sparkles } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AutopilotSettingsForm, type AutopilotAccount } from '@/components/autopilot/settings-form'
import { AutopilotWeek, type WeekPost } from '@/components/autopilot/week-posts'
import { PageHeader } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { weekStartOf } from '@/lib/autopilot/plan'
import { requireOnboardedBusiness } from '@/lib/auth/dal'
import { allowedChannels } from '@/lib/billing/channels'
import { AUTOPILOT_CHANNELS, AUTOPILOT_DEFAULT_TIME } from '@/lib/config/autopilot'
import { isChannel, type Channel } from '@/lib/config/publishing'
import { getAutopilotSettings, listAutopilotPosts } from '@/lib/data/autopilot'
import { getBillingOverview } from '@/lib/data/billing'
import { listSocialAccounts } from '@/lib/data/publishing'
import { getTranslator, type MessageKey } from '@/lib/i18n'
import { posterDefaults } from '@/lib/media/poster-defaults'
import { defaultCaption } from '@/lib/publishing/compose'
import { formatDateTime, intlLocale, istDateKey } from '@/lib/utils/datetime'
import { generatedCopySchema } from '@/services/ai/output'

export const metadata: Metadata = { title: 'Autopilot' }

/** A post whose planned time has passed (this page is rendered per request). */
const isPast = (iso: string) => Date.parse(iso) < Date.now()

export default async function AutopilotPage() {
  const { business, profile } = await requireOnboardedBusiness()
  const t = getTranslator(profile?.preferred_language)
  const locale = intlLocale(profile?.preferred_language)
  const [billing, settings, accounts] = await Promise.all([getBillingOverview(), getAutopilotSettings(), listSocialAccounts()])
  const plan = billing.currentPlan
  const perWeek = plan.autopilot_posts_per_week ?? 0

  if (perWeek < 1) {
    const plans = billing.plans.filter((p) => (p.autopilot_posts_per_week ?? 0) > 0)
    return (
      <>
        <PageHeader title={t('autopilot.title')} description={t('autopilot.description')} />
        <Card className="flex flex-col items-start gap-3">
          <Sparkles aria-hidden className="size-6 text-primary" />
          <CardTitle className="text-base">{t('autopilot.upsellTitle', { plans: plans.map((p) => p.name).join(', ') })}</CardTitle>
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            <li>{t('autopilot.upsell1', { n: plans[0]?.autopilot_posts_per_week ?? 5 })}</li>
            <li>{t('autopilot.upsell2')}</li>
            <li>{t('autopilot.upsell3')}</li>
          </ul>
          <Link href="/dashboard/billing" className={buttonVariants({})}>
            {t('publishing.form.seePlans')}
          </Link>
        </Card>
      </>
    )
  }

  const allowed = new Set(allowedChannels(plan).filter((c) => (AUTOPILOT_CHANNELS as readonly string[]).includes(c)))
  const options: AutopilotAccount[] = accounts
    .filter((a) => a.status === 'CONNECTED' && isChannel(a.channel) && allowed.has(a.channel))
    .map((a) => ({ id: a.id, channel: a.channel as Channel, name: a.external_account_name ?? a.channel }))

  const weekStart = weekStartOf(istDateKey(new Date()))
  const posts = await listAutopilotPosts(weekStart)
  const firstChannel = options.find((o) => settings?.account_ids.includes(o.id))?.channel ?? 'FACEBOOK'
  const week: WeekPost[] = posts
    .filter((p) => p.content)
    .map((p) => {
      const item = p.content!
      const copy = generatedCopySchema.safeParse(item.generated_copy ?? undefined)
      const spec = posterDefaults({ ...item, template: null }, copy.success ? copy.data : null, business)
      const idea = p.idea as { kind?: string; slug?: string }
      return {
        id: p.id,
        contentId: item.id,
        status: p.status as WeekPost['status'],
        when: formatDateTime(p.planned_for, locale),
        past: isPast(p.planned_for),
        title: item.title,
        caption: defaultCaption(firstChannel, item, copy.success ? copy.data : null),
        template: spec.template,
        texts: spec.texts,
        idea: idea.kind === 'festival' && idea.slug ? t('autopilot.ideaFestival', { festival: t(`festival.${idea.slug}` as MessageKey) }) : t('autopilot.ideaShop'),
      }
    })

  return (
    <>
      <PageHeader title={t('autopilot.title')} description={t('autopilot.description')} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div>
          <AutopilotSettingsForm
            initial={{
              enabled: settings?.enabled ?? false,
              accountIds: settings?.account_ids ?? [],
              postTime: settings?.post_time?.slice(0, 5) ?? AUTOPILOT_DEFAULT_TIME,
              ownerOffers: settings?.owner_offers ?? '',
            }}
            accounts={options}
            maxAccounts={plan.max_accounts_per_post ?? 1}
            postsPerWeek={perWeek}
          />
        </div>
        <section aria-labelledby="week-title" className="flex flex-col gap-3">
          <h2 id="week-title" className="font-display text-xl font-bold">
            {t('autopilot.week')}
          </h2>
          <p className="text-sm text-muted-foreground">{settings?.enabled ? t('autopilot.weekHint') : t('autopilot.weekOff')}</p>
          <AutopilotWeek posts={week} canApprove={Boolean(settings?.account_ids.length)} />
        </section>
      </div>
    </>
  )
}
