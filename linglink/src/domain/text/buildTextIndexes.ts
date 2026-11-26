import type { Token } from '@/types/analysis'

export interface TextIndexes {
  byNormalizedWord: Map<string, Token[]>
  uniqueNormalizedWords: Set<string>
}

export function buildTextIndexes(tokens: Token[]): TextIndexes {
  const byNormalizedWord = new Map<string, Token[]>()
  const uniqueNormalizedWords = new Set<string>()

  for (const token of tokens) {
    if (token.type !== 'word') continue
    uniqueNormalizedWords.add(token.normalized)
    const list = byNormalizedWord.get(token.normalized) ?? []
    list.push(token)
    byNormalizedWord.set(token.normalized, list)
  }

  return { byNormalizedWord, uniqueNormalizedWords }
}
