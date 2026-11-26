import type { ID, LearningText, UserTextProgress } from '@/types/db'

import { collectConstructionIds, collectTeachableWordIds } from './textVocabulary'

export function computeTextProgressFraction(
  text: LearningText,
  learnedWordIds: readonly ID[],
  learnedConstructionIds: readonly ID[],
): number {
  const words = new Set(collectTeachableWordIds(text))
  const constructions = new Set(collectConstructionIds(text))
  const total = words.size + constructions.size
  if (total <= 0) return 1
  let learned = 0
  for (const id of new Set(learnedWordIds)) if (words.has(id)) learned += 1
  for (const id of new Set(learnedConstructionIds)) if (constructions.has(id)) learned += 1
  return Math.min(1, learned / total)
}

export function buildUserTextProgressUpdate(
  text: LearningText,
  base: UserTextProgress,
  patch: Partial<Pick<UserTextProgress, 'learnedWordIds' | 'learnedConstructionIds' | 'currentStep'>>,
): UserTextProgress {
  const learnedWordIds = patch.learnedWordIds ?? base.learnedWordIds
  const learnedConstructionIds = patch.learnedConstructionIds ?? base.learnedConstructionIds
  const progress = computeTextProgressFraction(text, learnedWordIds, learnedConstructionIds)
  return {
    ...base,
    ...patch,
    learnedWordIds,
    learnedConstructionIds,
    progress,
  }
}
