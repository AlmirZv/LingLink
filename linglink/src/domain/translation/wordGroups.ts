import type { LearningText, TextWordOccurrence } from '@/types/db'

export interface UniqueWordGroup {
  key: string
  surface: string
  wordId?: string
  unknown: boolean
  occurrenceCount: number
  occurrenceIds: string[]
}

export function collectUniqueWordGroups(text: LearningText): UniqueWordGroup[] {
  const map = new Map<string, UniqueWordGroup>()

  const addOcc = (occ: TextWordOccurrence) => {
    const key = occ.wordId ?? `new:${occ.text.toLocaleLowerCase()}`
    const existing = map.get(key)
    if (existing) {
      existing.occurrenceIds.push(occ.id)
      existing.occurrenceCount = Math.max(existing.occurrenceCount, occ.occurrenceCount)
    } else {
      map.set(key, {
        key,
        surface: occ.text,
        wordId: occ.wordId,
        unknown: !occ.wordId,
        occurrenceCount: occ.occurrenceCount,
        occurrenceIds: [occ.id],
      })
    }
  }

  for (const sentence of text.sentences) {
    for (const occ of sentence.words) addOcc(occ)
  }

  return [...map.values()].sort((a, b) => b.occurrenceCount - a.occurrenceCount)
}

export function findOccurrence(text: LearningText, occurrenceId: string): TextWordOccurrence | null {
  for (const sentence of text.sentences) {
    const hit = sentence.words.find((w) => w.id === occurrenceId)
    if (hit) return hit
  }
  return null
}
