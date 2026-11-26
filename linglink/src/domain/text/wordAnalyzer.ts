import type { AnalyzedWord, AnalysisWordLookup } from '@/types/analysis'
import type { TextIndexes } from '@/domain/text/buildTextIndexes'
import type { ID, LanguageCode } from '@/types/db'

export async function analyzeWords(
  language: LanguageCode,
  indexes: TextIndexes,
  lookup: AnalysisWordLookup,
): Promise<{ words: AnalyzedWord[]; foundWordIds: Set<ID> }> {
  const words: AnalyzedWord[] = []
  const foundWordIds = new Set<ID>()

  for (const normalized of indexes.uniqueNormalizedWords) {
    const tokens = indexes.byNormalizedWord.get(normalized) ?? []
    const surface = tokens[0]?.text ?? normalized
    const match = await lookup.findWord(language, normalized)

    if (match) foundWordIds.add(match.id)

    words.push({
      wordId: match?.id,
      text: surface,
      normalized,
      occurrenceCount: tokens.length,
      known: Boolean(match),
      rootWordsInText: [],
    })
  }

  words.sort((a, b) => b.occurrenceCount - a.occurrenceCount)
  return { words, foundWordIds }
}
