import { createI18n } from 'vue-i18n'

import ar from './locales/ar.json'
import de from './locales/de.json'
import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import it from './locales/it.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import pt from './locales/pt.json'
import ru from './locales/ru.json'
import zh from './locales/zh.json'

import { isSupportedUiLocale, type SupportedUiLocale } from '@/constants/languages'

const STORAGE_KEY = 'linglink.uiLocale'

export function readStoredUiLocale(): SupportedUiLocale | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored && isSupportedUiLocale(stored) ? stored : null
}

function detectLocale(): SupportedUiLocale {
  const stored = readStoredUiLocale()
  if (stored) return stored
  const browser = navigator.language.slice(0, 2)
  if (isSupportedUiLocale(browser)) {
    return browser
  }
  return 'en'
}

const INSTALLED_I18N = '__linglinkInstalledI18n'

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { ar, de, en, es, fr, it, ja, ko, pt, ru, zh },
  pluralRules: {
    ru(choice, choicesLength) {
      if (choicesLength <= 1) return 0
      const n = Math.abs(choice)
      const mod10 = n % 10
      const mod100 = n % 100
      if (mod10 === 1 && mod100 !== 11) return 0
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1
      return Math.min(2, choicesLength - 1)
    },
  },
})

/** The production bundle can load this module twice. Screens must follow the instance passed to app.use. */
export function bindInstalledI18n(installed: typeof i18n): void {
  ;(globalThis as Record<string, unknown>)[INSTALLED_I18N] = installed
}

function activeI18n(): typeof i18n {
  return ((globalThis as Record<string, unknown>)[INSTALLED_I18N] as typeof i18n | undefined) ?? i18n
}

export function setUiLocale(locale: SupportedUiLocale): void {
  activeI18n().global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.lang = locale
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
}

document.documentElement.lang = i18n.global.locale.value
document.documentElement.dir = i18n.global.locale.value === 'ar' ? 'rtl' : 'ltr'
