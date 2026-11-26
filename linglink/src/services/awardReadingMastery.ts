import { buildUserTextProgressUpdate } from '@/domain/learning/computeProgress'
import { constructionMemberIds } from '@/domain/words/constructionMastery'
import { masteryLevelAfterPractice } from '@/domain/words/vocabularyFilters'
import type { Repositories } from '@/services/repositories/contracts'
import type { GrammarConstruction, ID, LearningText } from '@/types/db'

/**
 * Splits a reading batch into words to practice and constructions to count.
 * A construction does not keep its own mastery: practicing it practices its words.
 */
export function readingPracticeTargets(
  batchIds: readonly ID[],
  constructionsById: ReadonlyMap<ID, GrammarConstruction>,
): { masteryWordIds: ID[]; learnedWordIds: ID[]; learnedConstructionIds: ID[] } {
  const masteryWordIds: ID[] = []
  const learnedWordIds: ID[] = []
  const learnedConstructionIds: ID[] = []
  const seen = new Set<ID>()
  const addMastery = (wordId: ID) => {
    if (seen.has(wordId)) return
    seen.add(wordId)
    masteryWordIds.push(wordId)
  }
  for (const id of batchIds) {
    const construction = constructionsById.get(id)
    if (!construction) {
      learnedWordIds.push(id)
      addMastery(id)
      continue
    }
    learnedConstructionIds.push(id)
    for (const wordId of constructionMemberIds(construction)) addMastery(wordId)
  }
  return { masteryWordIds, learnedWordIds, learnedConstructionIds }
}

/** Adds one mastery step for each word practiced in this text. */
export async function awardReadingMastery(
  repos: Repositories,
  userId: ID,
  textId: ID,
  wordIds: ID[],
): Promise<void> {
  if (!wordIds.length) return
  const [progressRows, history] = await Promise.all([
    repos.progress.listWordProgress(userId),
    repos.wordTextHistory.listForUser(userId),
  ])
  const levelByWord = new Map(progressRows.map((row) => [row.wordId, row.level]))
  const textsByWord = new Map<ID, Set<ID>>()
  for (const row of history) {
    const texts = textsByWord.get(row.wordId) ?? new Set<ID>()
    texts.add(row.textId)
    textsByWord.set(row.wordId, texts)
  }
  const learnedAt = new Date().toISOString()
  for (const wordId of wordIds) {
    const next = masteryLevelAfterPractice(
      levelByWord.get(wordId) ?? 0,
      textsByWord.get(wordId)?.size ?? 0,
    )
    await repos.progress.setWordLevel(userId, wordId, next)
    await repos.wordTextHistory.record({ userId, wordId, textId, learnedAt })
  }
}

/** Records practiced words and constructions on the text, the same way for both. */
export async function recordReadingTextProgress(
  repos: Repositories,
  userId: ID,
  text: LearningText,
  learnedWordIds: readonly ID[],
  learnedConstructionIds: readonly ID[],
): Promise<void> {
  if (!learnedWordIds.length && !learnedConstructionIds.length) return
  const existing = await repos.progress.getTextProgress(userId, text.id)
  const base = existing ?? {
    userId,
    textId: text.id,
    learnedWordIds: [],
    learnedConstructionIds: [],
    currentStep: 0,
    progress: 0,
    updatedAt: '',
  }
  const updated = buildUserTextProgressUpdate(text, base, {
    learnedWordIds: [...new Set([...base.learnedWordIds, ...learnedWordIds])],
    learnedConstructionIds: [...new Set([...base.learnedConstructionIds, ...learnedConstructionIds])],
    currentStep: base.currentStep + 1,
  })
  await repos.progress.upsertTextProgress(updated)
}

/** Clears learned words and the progress ring for this text. Word mastery stays. */
export async function resetReadingTextProgress(
  repos: Repositories,
  userId: ID,
  text: LearningText,
): Promise<void> {
  await repos.progress.upsertTextProgress({
    userId,
    textId: text.id,
    learnedWordIds: [],
    learnedConstructionIds: [],
    currentStep: 0,
    progress: 0,
    updatedAt: new Date().toISOString(),
  })
}
