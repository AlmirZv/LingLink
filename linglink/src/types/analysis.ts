import type { GrammarConstruction, ID, LanguageCode, Word } from '@/types/db'

export interface NormalizedText {
  original: string
  normalized: string
}

export interface SentenceDraft {
  id: ID
  position: number
  text: string
}

export type TokenType = 'word' | 'punctuation' | 'number' | 'other'

export interface Token {
  id: ID
  sentenceId: ID
  position: number
  text: string
  normalized: string
  type: TokenType
}

export interface AnalyzedWord {
  wordId?: ID
  text: string
  normalized: string
  occurrenceCount: number
  known: boolean
  rootWordsInText: ID[]
}

export interface AnalyzedConstruction {
  constructionId: ID
  text: string
  sentenceId: ID
  startPosition: number
  endPosition: number
  /** Ordered source-word ids that form this construction. */
  wordIds?: ID[]
  /** Translation word saved when a reader stacks this span. */
  translationWordId?: ID
  translationLabel?: string
  /** Construction phrase entered for this span, for example 気を付けて. */
  phrase?: string
  phraseFurigana?: string
}

export interface AnalyzedSentence {
  id: ID
  position: number
  text: string
  tokens: Token[]
}

export interface TextAnalysisStatistics {
  sentenceCount: number
  totalWordCount: number
  uniqueWordCount: number
  knownWordsCount: number
  unknownWordsCount: number
  repeatedWordsCount: number
  rootWordGroupsCount: number
  constructionCount: number
}

export interface TextAnalysisResult {
  originalText: string
  normalizedText: string
  language: LanguageCode
  sentences: AnalyzedSentence[]
  words: AnalyzedWord[]
  constructions: AnalyzedConstruction[]
  statistics: TextAnalysisStatistics
}

export interface AnalysisWordLookup {
  findWord(language: LanguageCode, normalized: string): Promise<Word | null>
  getWordById(id: ID): Promise<Word | null>
  getConstructionById(id: ID): Promise<GrammarConstruction | null>
}
