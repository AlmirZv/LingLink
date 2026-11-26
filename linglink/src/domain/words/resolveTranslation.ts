import { formatWordLabel } from '@/domain/words/characterReading'
import type { ID, LanguageCode, Word } from '@/types/db'

/** First linked translation word id for target language. */
export function translationWordIds(source: Word, targetLanguage: LanguageCode): ID[] {
  return source.translations[targetLanguage] ?? []
}

export function resolveTranslationLabel(
  source: Word,
  targetLanguage: LanguageCode,
  wordsById: Map<ID, Word>,
): string | null {
  return resolveTranslationLabels(source, targetLanguage, wordsById)[0]?.label ?? null
}

export function resolveTranslationLabels(
  source: Word,
  targetLanguage: LanguageCode,
  wordsById: Map<ID, Word>,
): { id: ID; label: string }[] {
  const labels: { id: ID; label: string }[] = []
  for (const tid of translationWordIds(source, targetLanguage)) {
    const tw = wordsById.get(tid)
    if (!tw || labels.some((item) => item.id === tw.id)) continue
    labels.push({ id: tw.id, label: formatWordLabel(tw) })
  }
  return labels
}
