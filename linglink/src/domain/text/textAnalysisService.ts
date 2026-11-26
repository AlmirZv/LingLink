import type { AnalysisWordLookup, TextAnalysisResult } from '@/types/analysis'
import type { LanguageCode } from '@/types/db'

import { buildTextIndexes } from './buildTextIndexes'
import { analyzeConstructions } from './constructionAnalyzer'
import { normalizeText } from './normalizeText'
import { attachRootWordsInText } from './rootWordAnalyzer'
import { splitIntoSentences } from './sentenceSplitter'
import { buildStatistics } from './textStatistics'
import { tokenizeAll } from './tokenizer'
import { analyzeWords } from './wordAnalyzer'

export interface AnalyzeTextInput {
  text: string
  language: LanguageCode
}

export async function analyzeText(
  input: AnalyzeTextInput,
  lookup: AnalysisWordLookup,
): Promise<TextAnalysisResult> {
  const { original, normalized } = normalizeText(input.text)
  const sentences = splitIntoSentences(normalized)
  const tokens = tokenizeAll(sentences, input.language)
  const indexes = buildTextIndexes(tokens)

  const { words, foundWordIds } = await analyzeWords(input.language, indexes, lookup)
  const rootWordGroupsCount = await attachRootWordsInText(words, foundWordIds, lookup)
  const constructions = await analyzeConstructions(tokens, input.language, lookup)

  const analyzedSentences = sentences.map((s) => ({
    id: s.id,
    position: s.position,
    text: s.text,
    tokens: tokens.filter((t) => t.sentenceId === s.id),
  }))

  const statistics = buildStatistics(sentences, tokens, words, constructions, rootWordGroupsCount)

  return {
    originalText: original,
    normalizedText: normalized,
    language: input.language,
    sentences: analyzedSentences,
    words,
    constructions,
    statistics,
  }
}
