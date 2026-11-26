import { Capacitor, CapacitorHttp } from '@capacitor/core'

import { normalizeWordStress } from '@/constants/languages'

const DICTIONARY_ORIGIN = 'https://dictionary.piether.com'

export interface PietherEntry {
  word: string
  translations: Record<string, string[]>
}

const HAN = /\p{Script=Han}/u

export function containsIdeographs(text: string): boolean {
  return HAN.test(text)
}

export function ideographRuns(text: string): string | undefined {
  const runs = text.match(/\p{Script=Han}+/gu)
  if (!runs?.length) return undefined
  return runs.join('')
}

/** Group dictionary forms by language, always keeping the text surface in the text language. */
export function formsFromDictionaryEntry(
  entry: PietherEntry,
  surface: string,
  language: string,
): Map<string, string[]> {
  const buckets = new Map<string, string[]>()
  const add = (lang: string, form: string) => {
    const name = normalizeWordStress(form.trim().replace(/\s+/g, ' '))
    if (!name) return
    const list = buckets.get(lang) ?? []
    if (!list.some((item) => item === name)) list.push(name)
    buckets.set(lang, list)
  }

  for (const [lang, forms] of Object.entries(entry.translations)) {
    for (const form of forms) add(lang, form)
  }
  add(language, surface)

  const canonical = entry.word.trim()
  const alreadyStored = [...buckets.values()].some((list) => list.includes(canonical))
  if (canonical && !alreadyStored) {
    add(containsIdeographs(canonical) ? 'zh' : language, canonical)
  }
  return buckets
}

export type PietherLookup =
  | { status: 'found'; entry: PietherEntry }
  | { status: 'missing' }
  | { status: 'unavailable' }

/** Empty translations are a real miss. HTTP and network failures stay retryable. */
export function classifyPietherPayload(
  data: Partial<PietherEntry> | null | undefined,
  fallbackWord: string,
): Exclude<PietherLookup, { status: 'unavailable' }> {
  const translations = data?.translations
  if (!translations || Object.keys(translations).length === 0) return { status: 'missing' }
  return {
    status: 'found',
    entry: { word: data?.word ?? fallbackWord, translations },
  }
}

export async function lookupPietherWord(word: string): Promise<PietherLookup> {
  try {
    const query = `word=${encodeURIComponent(word)}`
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({
        url: `${DICTIONARY_ORIGIN}/api/translation?${query}`,
        responseType: 'json',
      })
      if (response.status < 200 || response.status >= 300) return { status: 'unavailable' }
      const data = (
        typeof response.data === 'string' ? JSON.parse(response.data) : response.data
      ) as Partial<PietherEntry>
      return classifyPietherPayload(data, word)
    }

    const response = await fetch(`/piether-dictionary/api/translation?${query}`)
    if (!response.ok) return { status: 'unavailable' }
    const data = (await response.json()) as Partial<PietherEntry>
    return classifyPietherPayload(data, word)
  } catch {
    return { status: 'unavailable' }
  }
}
