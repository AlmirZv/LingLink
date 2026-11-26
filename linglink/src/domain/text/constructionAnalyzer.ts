import type {
  AnalyzedConstruction,
  AnalysisWordLookup,
  Token,
} from '@/types/analysis'
import type { GrammarConstruction, ID, LanguageCode } from '@/types/db'

import { tokenizeSentence } from './tokenizer'

function wordTokens(tokens: Token[]): Token[] {
  return tokens.filter((t) => t.type === 'word')
}

function formWordParts(form: string, language: LanguageCode): string[] {
  const dummy = { id: 'form', position: 0, text: form }
  return tokenizeSentence(dummy, language)
    .filter((t) => t.type === 'word')
    .map((t) => t.normalized)
}

function matchFormAt(
  sentenceWordTokens: Token[],
  startIndex: number,
  parts: string[],
): { endIndex: number; text: string } | null {
  if (startIndex + parts.length > sentenceWordTokens.length) return null
  for (let i = 0; i < parts.length; i += 1) {
    if (sentenceWordTokens[startIndex + i]!.normalized !== parts[i]) return null
  }
  const matched = sentenceWordTokens.slice(startIndex, startIndex + parts.length)
  return {
    endIndex: startIndex + parts.length - 1,
    text: matched.map((t) => t.text).join(''),
  }
}

export async function analyzeConstructions(
  tokens: Token[],
  language: LanguageCode,
  lookup: AnalysisWordLookup,
): Promise<AnalyzedConstruction[]> {
  const checkedConstructions = new Set<ID>()
  const results: AnalyzedConstruction[] = []
  const tokensBySentence = new Map<ID, Token[]>()

  for (const token of tokens) {
    const list = tokensBySentence.get(token.sentenceId) ?? []
    list.push(token)
    tokensBySentence.set(token.sentenceId, list)
  }

  for (const [sentenceId, sentenceTokens] of tokensBySentence) {
    const wordsInSentence = wordTokens(sentenceTokens)

    for (let i = 0; i < wordsInSentence.length; i += 1) {
      const token = wordsInSentence[i]!
      const wordEntity = token.normalized
        ? await lookup.findWord(language, token.normalized)
        : null
      if (!wordEntity?.grammarConstructions.length) continue

      for (const constructionId of wordEntity.grammarConstructions) {
        if (checkedConstructions.has(constructionId)) continue

        const construction = await lookup.getConstructionById(constructionId)
        if (!construction) continue

        const matched = tryMatchConstruction(construction, language, wordsInSentence, i)
        if (matched) {
          checkedConstructions.add(constructionId)
          const phrase =
            construction.construction.replace(/\s+/g, '') === matched.text.replace(/\s+/g, '')
              ? undefined
              : construction.construction
          results.push({
            constructionId,
            text: matched.text,
            sentenceId,
            startPosition: matched.start,
            endPosition: matched.end,
            ...(phrase ? { phrase } : {}),
            ...(phrase && construction.furigana ? { phraseFurigana: construction.furigana } : {}),
          })
        }
      }
    }
  }

  return results
}

function tryMatchConstruction(
  construction: GrammarConstruction,
  language: LanguageCode,
  wordsInSentence: Token[],
  anchorIndex: number,
): { start: number; end: number; text: string } | null {
  const forms = construction.forms.length ? construction.forms : [construction.construction]

  for (const form of forms) {
    const parts = formWordParts(form, language)
    if (!parts.length) continue

    for (let start = 0; start <= anchorIndex; start += 1) {
      if (wordsInSentence[start]!.normalized !== parts[0]) continue
      const hit = matchFormAt(wordsInSentence, start, parts)
      if (hit && start <= anchorIndex && anchorIndex <= hit.endIndex) {
        return { start, end: hit.endIndex, text: hit.text }
      }
    }
  }

  return null
}
