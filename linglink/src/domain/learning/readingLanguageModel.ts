import type { FinalTranslation, ID, LanguageCode, LearningText, TextWordOccurrence } from '@/types/db'

export type ReadingMode = 'forward' | 'reverse_scaffold'

export function translationTargetLanguage(
  textLanguage: LanguageCode,
  knownLanguage: LanguageCode,
  learningLanguage: LanguageCode,
): LanguageCode {
  if (textLanguage === learningLanguage) return knownLanguage
  return learningLanguage
}

/** Original of the language being learned: show the source, not a study batch. */
export function isOriginalLearningText(
  textLanguage: LanguageCode | undefined,
  knownLanguage: LanguageCode | undefined,
  learningLanguage: LanguageCode,
): boolean {
  return Boolean(
    textLanguage &&
      knownLanguage &&
      textLanguage === learningLanguage &&
      textLanguage !== knownLanguage,
  )
}

export function resolveReadingMode(
  text: LearningText,
  knownLanguage: LanguageCode,
  learningLanguage: LanguageCode,
): { mode: ReadingMode; bridgeLanguage?: LanguageCode } {
  if (text.language === learningLanguage && text.language !== knownLanguage) {
    const bridge = text.finalTranslations[knownLanguage]
    if (bridge?.words?.length) {
      return { mode: 'reverse_scaffold', bridgeLanguage: knownLanguage }
    }
  }
  return { mode: 'forward' }
}

/**
 * A learner sees a text when they can read the original or a translation
 * in the language they know or the language they are learning.
 * A Russian text stays visible to a Russian speaker learning English.
 */
export function textVisibleToLearner(
  text: LearningText,
  knownLanguage: LanguageCode,
  learningLanguage: LanguageCode,
): boolean {
  if (text.language === knownLanguage || text.language === learningLanguage) return true
  return Boolean(text.finalTranslations[knownLanguage] || text.finalTranslations[learningLanguage])
}

/** Map occurrence id → surface in final/bridge translation (L_known). */
export function buildOccurrenceBridgeMap(
  finalTranslation: FinalTranslation | undefined,
): Map<ID, string> {
  const map = new Map<ID, string>()
  if (!finalTranslation) return map
  for (const w of finalTranslation.words) {
    for (const occId of w.sourceOccurrenceIds ?? []) {
      if (!map.has(occId)) map.set(occId, w.text)
    }
  }
  return map
}

export function bridgeTextForOccurrence(
  occ: TextWordOccurrence,
  bridgeByOccurrenceId: Map<ID, string>,
): string | null {
  return bridgeByOccurrenceId.get(occ.id) ?? null
}
