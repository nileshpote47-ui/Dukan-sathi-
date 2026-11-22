import type { QuickCreateType } from './content'
import type { ExampleGroup } from './category-examples'

/*
 * Festival calendar for "Ideas for today" on the dashboard.
 *
 * Dates are the day shops celebrate in India (IST), checked in November 2026 against
 * published 2027 calendars (Drik Panchang, government holiday lists, Calendarific).
 * Lunar festivals can differ by a day by region; Eid depends on the moon sighting.
 * Names are translated in lib/i18n/messages (festival.<slug>).
 *
 * Extend this list every year before CALENDAR_COVERS_UNTIL; after that date the
 * dashboard simply shows ideas for the shop's category (nothing breaks).
 */

export interface Festival {
  slug: FestivalSlug
  /** Day of the festival in IST, "YYYY-MM-DD". */
  date: string
  /** What a festival idea becomes in the composer. */
  type: QuickCreateType
  /** Only suggest to these shop groups; all groups when omitted. */
  groups?: readonly ExampleGroup[]
}

export const FESTIVAL_SLUGS = [
  'christmas',
  'new_year',
  'makar_sankranti',
  'republic_day',
  'maha_shivratri',
  'eid_al_fitr',
  'holi',
  'gudi_padwa',
  'ram_navami',
  'akshaya_tritiya',
  'independence_day',
  'raksha_bandhan',
  'ganesh_chaturthi',
  'navratri',
  'dussehra',
  'dhanteras',
  'diwali',
] as const
export type FestivalSlug = (typeof FESTIVAL_SLUGS)[number]

export const CALENDAR_COVERS_UNTIL = '2027-10-31'

export const FESTIVALS: readonly Festival[] = [
  { slug: 'christmas', date: '2026-12-25', type: 'FESTIVAL' },
  { slug: 'new_year', date: '2027-01-01', type: 'OFFER' },
  { slug: 'makar_sankranti', date: '2027-01-14', type: 'FESTIVAL' },
  { slug: 'republic_day', date: '2027-01-26', type: 'FESTIVAL' },
  { slug: 'maha_shivratri', date: '2027-03-06', type: 'FESTIVAL' },
  { slug: 'eid_al_fitr', date: '2027-03-10', type: 'FESTIVAL' },
  { slug: 'holi', date: '2027-03-22', type: 'OFFER' },
  { slug: 'gudi_padwa', date: '2027-04-07', type: 'OFFER' },
  { slug: 'ram_navami', date: '2027-04-15', type: 'FESTIVAL' },
  { slug: 'akshaya_tritiya', date: '2027-05-09', type: 'OFFER' },
  { slug: 'independence_day', date: '2027-08-15', type: 'FESTIVAL' },
  { slug: 'raksha_bandhan', date: '2027-08-17', type: 'OFFER' },
  { slug: 'ganesh_chaturthi', date: '2027-09-04', type: 'FESTIVAL' },
  { slug: 'navratri', date: '2027-09-30', type: 'OFFER' },
  { slug: 'dussehra', date: '2027-10-09', type: 'OFFER' },
  { slug: 'dhanteras', date: '2027-10-27', type: 'OFFER', groups: ['fashion', 'mobile', 'general', 'agri'] },
  { slug: 'diwali', date: '2027-10-29', type: 'OFFER' },
]

/** Festivals are suggested this many days ahead (time to plan an offer). */
export const FESTIVAL_LOOKAHEAD_DAYS = 21
/** At most this many festival ideas and category ideas at once. */
export const MAX_FESTIVAL_IDEAS = 2
export const CATEGORY_IDEAS_SHOWN = 2

/** Everyday ideas per shop group (text in i18n: ideas.<group>.<n>.title / .brief). */
export const CATEGORY_IDEAS: Record<ExampleGroup, readonly { n: 1 | 2 | 3 | 4; type: QuickCreateType }[]> = {
  grocery: [
    { n: 1, type: 'OFFER' },
    { n: 2, type: 'WHATSAPP' },
    { n: 3, type: 'POST' },
    { n: 4, type: 'REEL' },
  ],
  mobile: [
    { n: 1, type: 'POST' },
    { n: 2, type: 'OFFER' },
    { n: 3, type: 'REEL' },
    { n: 4, type: 'WHATSAPP' },
  ],
  fashion: [
    { n: 1, type: 'REEL' },
    { n: 2, type: 'POSTER' },
    { n: 3, type: 'OFFER' },
    { n: 4, type: 'WHATSAPP' },
  ],
  agri: [
    { n: 1, type: 'POST' },
    { n: 2, type: 'WHATSAPP' },
    { n: 3, type: 'OFFER' },
    { n: 4, type: 'REEL' },
  ],
  food: [
    { n: 1, type: 'REEL' },
    { n: 2, type: 'OFFER' },
    { n: 3, type: 'WHATSAPP' },
    { n: 4, type: 'POSTER' },
  ],
  services: [
    { n: 1, type: 'POST' },
    { n: 2, type: 'OFFER' },
    { n: 3, type: 'REEL' },
    { n: 4, type: 'WHATSAPP' },
  ],
  general: [
    { n: 1, type: 'POST' },
    { n: 2, type: 'OFFER' },
    { n: 3, type: 'WHATSAPP' },
    { n: 4, type: 'REEL' },
  ],
}
