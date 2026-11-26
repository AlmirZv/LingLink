import { WORD_MASTERY_TARGET } from '@/domain/words/vocabularyFilters'
import type { GrammarConstruction, ID } from '@/types/db'

/** Words that make up the construction. Their mastery is what the construction's mastery is made of. */
export function constructionMemberIds(
  construction: Pick<GrammarConstruction, 'wordIds' | 'relatedWords'>,
): ID[] {
  const source = construction.wordIds?.length ? construction.wordIds : construction.relatedWords
  return [...new Set(source)]
}

/**
 * A construction's mastery is the sum of its words' mastery.
 * The bar is full only when every word is at full mastery.
 */
export function constructionMastery(
  construction: Pick<GrammarConstruction, 'wordIds' | 'relatedWords'>,
  masteryByWordId: ReadonlyMap<ID, number>,
): { mastery: number; masteryTarget: number } {
  const ids = constructionMemberIds(construction)
  let mastery = 0
  for (const id of ids) mastery += masteryByWordId.get(id) ?? 0
  return { mastery, masteryTarget: ids.length * WORD_MASTERY_TARGET }
}

export function isConstructionMastered(
  construction: Pick<GrammarConstruction, 'wordIds' | 'relatedWords'>,
  masteryByWordId: ReadonlyMap<ID, number>,
): boolean {
  const score = constructionMastery(construction, masteryByWordId)
  return score.masteryTarget > 0 && score.mastery >= score.masteryTarget
}
