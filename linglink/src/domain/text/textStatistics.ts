import type {
  AnalyzedConstruction,
  AnalyzedWord,
  SentenceDraft,
  TextAnalysisStatistics,
  Token,
} from '@/types/analysis'

export function buildStatistics(
  sentences: SentenceDraft[],
  tokens: Token[],
  words: AnalyzedWord[],
  constructions: AnalyzedConstruction[],
  rootWordGroupsCount: number,
): TextAnalysisStatistics {
  const wordTokens = tokens.filter((t) => t.type === 'word')
  const knownWordsCount = words.filter((w) => w.known).length
  const unknownWordsCount = words.length - knownWordsCount
  const repeatedWordsCount = words.filter((w) => w.occurrenceCount > 1).length

  return {
    sentenceCount: sentences.length,
    totalWordCount: wordTokens.length,
    uniqueWordCount: words.length,
    knownWordsCount,
    unknownWordsCount,
    repeatedWordsCount,
    rootWordGroupsCount,
    constructionCount: constructions.length,
  }
}
