import { foldSurface } from '@/constants/languages'
import type { ID, LanguageCode, LearningText } from '@/types/db'

export interface SavedFinalPiece {
  kind: 'word' | 'extra'
  normalized?: string
  text: string
}

/** Saved natural translation, split back into per-sentence review rows. */
export function savedFinalLines(
  text: LearningText,
  targetLanguage: LanguageCode,
): Record<ID, SavedFinalPiece[]> {
  const stored = text.finalTranslations[targetLanguage]
  if (!stored?.words.length) return {}
  const lines: Record<string, SavedFinalPiece[]> = {}
  let index = 0
  const ordered = [...text.sentences].sort((a, b) => a.position - b.position)
  for (const sentence of ordered) {
    const normalizedByOccurrence = new Map(
      sentence.words.map((word) => [word.id, foldSurface(word.text, text.language)]),
    )
    const pieces: SavedFinalPiece[] = []
    while (index < stored.words.length) {
      const word = stored.words[index]!
      const linked = word.sourceOccurrenceIds.some((id) => normalizedByOccurrence.has(id))
      if (linked) {
        const occurrenceId = word.sourceOccurrenceIds.find((id) => normalizedByOccurrence.has(id))!
        pieces.push({
          kind: 'word',
          normalized: normalizedByOccurrence.get(occurrenceId),
          text: word.text,
        })
        index += 1
        continue
      }
      if (word.sourceOccurrenceIds.length === 0) {
        const nextLinked = stored.words.slice(index + 1).find((item) => item.sourceOccurrenceIds.length > 0)
        const nextIsHere = nextLinked?.sourceOccurrenceIds.some((id) => normalizedByOccurrence.has(id))
        if (nextIsHere || !nextLinked) {
          pieces.push({ kind: 'extra', text: word.text })
          index += 1
          continue
        }
      }
      break
    }
    if (pieces.length > 0) lines[sentence.id] = pieces
  }
  return lines
}
