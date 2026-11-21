/**
 * Supported interface languages. The database check constraint on
 * profiles.preferred_language must list the same codes.
 *
 * To add a language (e.g. Gujarati 'gu'): add it here, add lib/i18n/messages/gu.ts,
 * register it in lib/i18n/index.ts, and add a migration for the check constraint.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English', sample: 'Visit us today' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी', sample: 'आजच भेट द्या' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', sample: 'आज ही आएं' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]]

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

export const isLanguageCode = (value: string): value is LanguageCode =>
  (LANGUAGE_CODES as readonly string[]).includes(value)
