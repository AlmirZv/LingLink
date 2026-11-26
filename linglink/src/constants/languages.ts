import type { LanguageCode } from '@/types/db'

/** Interface locales. The same set as the learning languages. */
export const SUPPORTED_UI_LOCALES = ['zh', 'en', 'fr', 'de', 'es', 'pt', 'it', 'ru', 'ar', 'ja', 'ko'] as const
export type SupportedUiLocale = (typeof SUPPORTED_UI_LOCALES)[number]

export interface LanguageOption {
  code: LanguageCode
  nativeName: string
  /** Emoji flag for quick UI pickers */
  flag: string
  /** UI + learning in MVP */
  mvp: boolean
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'zh', nativeName: '中文', flag: '🇨🇳', mvp: false },
  { code: 'en', nativeName: 'English', flag: '🇬🇧', mvp: true },
  { code: 'fr', nativeName: 'Français', flag: '🇫🇷', mvp: false },
  { code: 'de', nativeName: 'Deutsch', flag: '🇩🇪', mvp: false },
  { code: 'es', nativeName: 'Español', flag: '🇪🇸', mvp: false },
  { code: 'pt', nativeName: 'Português', flag: '🇵🇹', mvp: false },
  { code: 'it', nativeName: 'Italiano', flag: '🇮🇹', mvp: false },
  { code: 'ru', nativeName: 'Русский', flag: '🇷🇺', mvp: true },
  { code: 'ar', nativeName: 'العربية', flag: '🇸🇦', mvp: false },
  { code: 'ja', nativeName: '日本語', flag: '🇯🇵', mvp: true },
  { code: 'ko', nativeName: '한국어', flag: '🇰🇷', mvp: false },
]

/** Interface language picker. Matches the learning-language list. */
export const MVP_LANGUAGE_OPTIONS = SUPPORTED_UI_LOCALES.map(
  (code) => LANGUAGE_OPTIONS.find((language) => language.code === code)!,
)

/** Languages the Multilingual Dictionary and LingLink texts use for now. */
export const CONTENT_LANGUAGE_OPTIONS = LANGUAGE_OPTIONS

const CASE_FOLD_LANGUAGES = new Set<LanguageCode>(['ru', 'en', 'fr', 'de', 'es', 'pt', 'it'])

/** Dictionary stress is often a quote-like mark after the vowel instead of a combining acute. */
const STRESS_MARK = /[''`´ʹʻʼ′＇‘’‚‛]/
const COMBINING_ACUTE = '\u0301'
const LETTER = /\p{L}/u

/** Turn `е'` / `е´` into `е́` so stress sits on the letter instead of looking like a quote. */
export function normalizeWordStress(text: string): string {
  const chars = [...text]
  let out = ''
  for (let index = 0; index < chars.length; index += 1) {
    const current = chars[index]!
    const next = chars[index + 1]
    if (next && STRESS_MARK.test(next) && LETTER.test(current)) {
      out += current + COMBINING_ACUTE
      index += 1
      continue
    }
    out += current
  }
  return out.normalize('NFC')
}

export function foldSurface(text: string, language: LanguageCode): string {
  const folded = text.normalize('NFD').replace(/\p{M}+/gu, '')
  return CASE_FOLD_LANGUAGES.has(language) ? folded.toLocaleLowerCase(language) : folded
}

export function languageLabel(code: LanguageCode): string {
  return LANGUAGE_OPTIONS.find((l) => l.code === code)?.nativeName ?? code
}

export function textDirection(language: LanguageCode): 'rtl' | 'ltr' {
  return language === 'ar' ? 'rtl' : 'ltr'
}

export function isSupportedUiLocale(code: string): code is SupportedUiLocale {
  return (SUPPORTED_UI_LOCALES as readonly string[]).includes(code)
}
