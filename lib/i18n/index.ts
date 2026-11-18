import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from '@/lib/config/languages'
import { en, type MessageKey, type Messages } from './messages/en'
import { hi } from './messages/hi'
import { mr } from './messages/mr'

export type { MessageKey, Messages }

const dictionaries: Record<LanguageCode, Partial<Messages>> = { en, mr, hi }

export type TranslationValues = Record<string, string | number>
export type Translate = (key: MessageKey, values?: TranslationValues) => string

/** Full dictionary for a language: its own strings, with English for anything missing. */
export function getMessages(locale: string | null | undefined): Messages {
  const code = locale && isLanguageCode(locale) ? locale : DEFAULT_LANGUAGE
  return { ...en, ...dictionaries[code] }
}

export function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  )
}

export function createTranslator(messages: Messages): Translate {
  return (key, values) => interpolate(messages[key], values)
}

export function getTranslator(locale: string | null | undefined): Translate {
  return createTranslator(getMessages(locale))
}
