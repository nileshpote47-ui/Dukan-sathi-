import type { ComposerIdea } from '@/components/dashboard/composer'
import type { MessageKey, Translate } from '@/lib/i18n'
import type { Idea } from './today'

/** Turn ideas into translated composer cards (title, badge, the sentence that fills the composer). */
export function presentIdeas(ideas: Idea[], t: Translate): ComposerIdea[] {
  return ideas.map((idea) => {
    if (idea.kind === 'festival') {
      const festival = t(`festival.${idea.slug}` as MessageKey)
      const badge = idea.daysAway === 0 ? t('ideas.today') : idea.daysAway === 1 ? t('ideas.tomorrow') : t('ideas.inDays', { days: idea.daysAway })
      const briefKey = idea.type === 'FESTIVAL' ? 'ideas.festival.brief.FESTIVAL' : 'ideas.festival.brief.OFFER'
      return {
        id: `festival-${idea.slug}`,
        festival: true,
        title: t('ideas.festival.title', { festival }),
        badge,
        brief: t(briefKey, { festival }),
        type: idea.type,
      }
    }
    const base = `ideas.${idea.group}.${idea.n}`
    return {
      id: `category-${idea.group}-${idea.n}`,
      festival: false,
      title: t(`${base}.title` as MessageKey),
      badge: t('ideas.everyday'),
      brief: t(`${base}.brief` as MessageKey),
      type: idea.type,
    }
  })
}
