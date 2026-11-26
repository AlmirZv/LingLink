import type { ID, LearningText } from '@/types/db'

import { collectWordSummaries, type TextWordSummary } from './textVocabulary'

export const DEFAULT_BATCH_SIZE = 5

export function selectNextWordBatch(
  text: LearningText,
  excludedWordIds: ReadonlySet<ID>,
  batchSize = DEFAULT_BATCH_SIZE,
): TextWordSummary[] {
  return collectWordSummaries(text)
    .filter((w) => !excludedWordIds.has(w.wordId))
    .slice(0, batchSize)
}

export function hasMoreWordsToLearn(
  text: LearningText,
  excludedWordIds: ReadonlySet<ID>,
): boolean {
  return selectNextWordBatch(text, excludedWordIds, 1).length > 0
}
