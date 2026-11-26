import type { ID, LearningText, TextWordOccurrence } from '@/types/db'

export interface TextWordSummary {
  wordId: ID
  /** Representative surface form */
  surface: string
  occurrenceCount: number
}

export function collectWordSummaries(text: LearningText): TextWordSummary[] {
  const byId = new Map<ID, TextWordSummary>()

  for (const sentence of text.sentences) {
    for (const occ of sentence.words) {
      if (!occ.wordId) continue
      const existing = byId.get(occ.wordId)
      if (!existing) {
        byId.set(occ.wordId, {
          wordId: occ.wordId,
          surface: occ.text,
          occurrenceCount: occ.occurrenceCount,
        })
      } else {
        existing.occurrenceCount = Math.max(existing.occurrenceCount, occ.occurrenceCount)
      }
    }
  }

  return [...byId.values()].sort((a, b) => b.occurrenceCount - a.occurrenceCount)
}

export function collectConstructionIds(text: LearningText): ID[] {
  const ids = new Set<ID>()
  for (const sentence of text.sentences) {
    for (const c of sentence.constructions) {
      if (!c.constructionId || c.constructionId.startsWith('local-')) continue
      ids.add(c.constructionId)
    }
  }
  for (const id of text.constructionIds) {
    if (!id || id.startsWith('local-')) continue
    ids.add(id)
  }
  return [...ids]
}

function coveredOccurrenceKeys(text: LearningText): Set<string> {
  const covered = new Set<string>()
  for (const sentence of text.sentences) {
    for (const construction of sentence.constructions) {
      if (!construction.constructionId || construction.constructionId.startsWith('local-')) continue
      for (const word of sentence.words) {
        if (word.position < construction.startPosition || word.position > construction.endPosition) continue
        covered.add(`${sentence.id}:${word.id}`)
      }
    }
  }
  return covered
}

/**
 * Words learned on their own. A word that only appears inside a construction
 * is part of that construction, not a second unit.
 */
export function collectTeachableWordIds(text: LearningText): ID[] {
  const covered = coveredOccurrenceKeys(text)
  const ids = new Set<ID>()
  for (const sentence of text.sentences) {
    for (const word of sentence.words) {
      if (!word.wordId || covered.has(`${sentence.id}:${word.id}`)) continue
      ids.add(word.wordId)
    }
  }
  return [...ids]
}

export function countTeachableUnits(text: LearningText): number {
  return collectTeachableWordIds(text).length + collectConstructionIds(text).length
}

export function allOccurrences(text: LearningText): TextWordOccurrence[] {
  const list: TextWordOccurrence[] = []
  for (const s of text.sentences) {
    list.push(...s.words)
  }
  return list
}
