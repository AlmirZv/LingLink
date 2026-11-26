import { formatWordLabel } from '@/domain/words/characterReading'
import type { ReadingMode } from '@/domain/learning/readingLanguageModel'
import { bridgeTextForOccurrence } from '@/domain/learning/readingLanguageModel'
import type { ID, TextSentence, TextWordOccurrence, Word } from '@/types/db'

export type RenderSegmentKind = 'source' | 'known' | 'batch' | 'gap'
export interface RenderSegment {
  text: string
  kind: RenderSegmentKind
  wordId?: ID
}

export interface RenderSentenceContext {
  wordsById: Map<ID, Word>
  knownWordIds: ReadonlySet<ID>
  batchWordIds: ReadonlySet<ID>
  /** forward: unknown = source text; known = translation. reverse_scaffold: unknown = bridge; known = source (L_learn). */
  readingMode?: ReadingMode
  bridgeByOccurrenceId?: Map<ID, string>
  /** When set, a known word is replaced only by a translation in this language. */
  targetLanguage?: string
}

function labelInLanguage(word: Word | undefined, targetLanguage: string | undefined): string | null {
  if (!word) return null
  if (targetLanguage && word.language !== targetLanguage) return null
  return formatWordLabel(word)
}

function translationForOccurrence(
  occ: TextWordOccurrence,
  wordsById: Map<ID, Word>,
  targetLanguage: string | undefined,
): string | null {
  const selected = occ.translations.find((proposal) => proposal.id === occ.selectedTranslationId)
  const selectedLabel = labelInLanguage(
    selected ? wordsById.get(selected.translationWordId) : undefined,
    targetLanguage,
  )
  if (selectedLabel) return selectedLabel

  if (targetLanguage) {
    for (const proposal of occ.translations) {
      const label = labelInLanguage(wordsById.get(proposal.translationWordId), targetLanguage)
      if (label) return label
    }
    const source = occ.wordId ? wordsById.get(occ.wordId) : undefined
    const linkedId = source?.translations[targetLanguage]?.[0]
    return labelInLanguage(linkedId ? wordsById.get(linkedId) : undefined, targetLanguage)
  }

  return null
}

export function renderSentence(sentence: TextSentence, ctx: RenderSentenceContext): RenderSegment[] {
  const mode = ctx.readingMode ?? 'forward'
  const bridgeMap = ctx.bridgeByOccurrenceId ?? new Map<ID, string>()

  if (!sentence.words.length) {
    return [{ text: sentence.text, kind: 'source' }]
  }

  const sorted = [...sentence.words].sort((a, b) => a.position - b.position)
  const segments: RenderSegment[] = []
  let cursor = 0

  for (const occ of sorted) {
    const idx = sentence.text.indexOf(occ.text, cursor)
    const start = idx >= 0 ? idx : cursor
    if (start > cursor) {
      segments.push({ text: sentence.text.slice(cursor, start), kind: 'gap' })
    }

    const translation = translationForOccurrence(occ, ctx.wordsById, ctx.targetLanguage)
    const wordId = occ.wordId
    const learned =
      wordId && (ctx.batchWordIds.has(wordId) || ctx.knownWordIds.has(wordId))
    const kind: RenderSegmentKind =
      wordId && ctx.batchWordIds.has(wordId) ? 'batch' : wordId && ctx.knownWordIds.has(wordId) ? 'known' : 'source'

    let displayText: string
    if (mode === 'reverse_scaffold') {
      if (learned) displayText = occ.text
      else displayText = bridgeTextForOccurrence(occ, bridgeMap) ?? occ.text
    } else if (learned) {
      displayText = translation ?? occ.text
    } else {
      displayText = occ.text
    }

    segments.push({ text: displayText, kind, wordId })

    cursor = start + occ.text.length
  }

  if (cursor < sentence.text.length) {
    segments.push({ text: sentence.text.slice(cursor), kind: 'gap' })
  }

  return segments
}
