import { normalizeWordStress } from '@/constants/languages'
import { isOriginalLearningText } from '@/domain/learning/readingLanguageModel'
import {
  findReadingConstructionSpans,
  learningWordFor,
  type ReadingConstructionSpan,
} from '@/domain/text/readingFocus'
import type {
  GrammarConstruction,
  ID,
  LanguageCode,
  LearningText,
  TextSentence,
  TextWordOccurrence,
  Word,
} from '@/types/db'

/** Enough characters to fill three lines of the library card, including a wide layout. */
export const LIBRARY_SNIPPET_LENGTH = 120

export interface LibrarySnippetPiece {
  text: string
  translated: boolean
}

function tokenPiece(
  occurrence: TextWordOccurrence,
  wordsById: Map<ID, Word>,
  masteredWordIds: ReadonlySet<ID>,
  learningLanguage: LanguageCode,
  originalReading: boolean,
  knownLanguage: LanguageCode | undefined,
): LibrarySnippetPiece {
  const source = occurrence.wordId ? wordsById.get(occurrence.wordId) : undefined
  const learning = learningWordFor(occurrence, wordsById, learningLanguage) ?? source
  if (originalReading) {
    return {
      text: occurrence.text,
      translated: hasKnownGloss(learning, occurrence, wordsById, knownLanguage),
    }
  }
  if (learning && masteredWordIds.has(learning.id)) {
    return { text: normalizeWordStress(learning.word), translated: true }
  }
  return { text: occurrence.text, translated: false }
}

function hasKnownGloss(
  word: Word | undefined,
  occurrence: TextWordOccurrence,
  wordsById: Map<ID, Word>,
  knownLanguage: LanguageCode | undefined,
): boolean {
  if (!knownLanguage) return false
  if (word?.translations[knownLanguage]?.some((id) => wordsById.get(id)?.language === knownLanguage)) return true
  return occurrence.translations.some((proposal) => wordsById.get(proposal.translationWordId)?.language === knownLanguage)
}

function pushPiece(pieces: LibrarySnippetPiece[], text: string, translated: boolean) {
  if (!text) return
  const last = pieces[pieces.length - 1]
  if (last && last.translated === translated) last.text += text
  else pieces.push({ text, translated })
}

function sentencePieces(
  sentence: TextSentence,
  wordsById: Map<ID, Word>,
  masteredWordIds: ReadonlySet<ID>,
  learningLanguage: LanguageCode,
  spans: ReadingConstructionSpan[],
  masteredConstructionIds: ReadonlySet<ID>,
  originalReading: boolean,
  knownLanguage: LanguageCode | undefined,
): LibrarySnippetPiece[] {
  const pieces: LibrarySnippetPiece[] = []
  if (!sentence.words.length) {
    pushPiece(pieces, sentence.text, false)
    return pieces
  }
  const sorted = [...sentence.words].sort((a, b) => a.position - b.position)
  const spanAt = new Map(
    originalReading
      ? []
      : spans
          .filter((span) => span.sentenceId === sentence.id && masteredConstructionIds.has(span.constructionId))
          .map((span) => [span.start, span]),
  )
  let cursor = 0
  for (let index = 0; index < sorted.length; index += 1) {
    const occurrence = sorted[index]!
    const span = spanAt.get(index)
    const at = sentence.text.indexOf(occurrence.text, cursor)
    const start = at >= 0 ? at : cursor
    if (start > cursor) pushPiece(pieces, sentence.text.slice(cursor, start), false)
    if (span) {
      pushPiece(pieces, span.phrase, true)
      let scan = start
      for (let wordIndex = span.start; wordIndex <= span.end; wordIndex += 1) {
        const word = sorted[wordIndex]!
        const pos = sentence.text.indexOf(word.text, scan)
        const from = pos >= 0 ? pos : scan
        scan = from + word.text.length
      }
      cursor = scan
      index = span.end
      continue
    }
    const token = tokenPiece(
      occurrence,
      wordsById,
      masteredWordIds,
      learningLanguage,
      originalReading,
      knownLanguage,
    )
    pushPiece(pieces, token.text, token.translated)
    cursor = start + occurrence.text.length
  }
  if (cursor < sentence.text.length) pushPiece(pieces, sentence.text.slice(cursor), false)
  return pieces
}

function clipPieces(pieces: LibrarySnippetPiece[], limit: number): LibrarySnippetPiece[] {
  const total = pieces.reduce((count, piece) => count + piece.text.length, 0)
  const visible: LibrarySnippetPiece[] = []
  let left = limit
  for (const piece of pieces) {
    if (left <= 0) break
    if (piece.text.length <= left) {
      visible.push(piece)
      left -= piece.text.length
      continue
    }
    visible.push({ text: piece.text.slice(0, left), translated: piece.translated })
    left = 0
  }
  if (total > limit) pushPiece(visible, '...', false)
  return visible
}

/** Opening of the text, long enough for three card lines. Mastered words use the selected learning-language translation. */
export function librarySnippet(
  text: LearningText,
  wordsById: Map<ID, Word>,
  masteredWordIds: ReadonlySet<ID>,
  learningLanguage: LanguageCode,
  constructionsById: ReadonlyMap<ID, GrammarConstruction> = new Map(),
  masteredConstructionIds: ReadonlySet<ID> = new Set(),
  knownLanguage?: LanguageCode,
): LibrarySnippetPiece[] {
  const pieces: LibrarySnippetPiece[] = []
  const spans = findReadingConstructionSpans(text, wordsById, constructionsById)
  const originalReading = isOriginalLearningText(text.language, knownLanguage, learningLanguage)
  for (const sentence of [...text.sentences].sort((a, b) => a.position - b.position)) {
    if (pieces.length) pushPiece(pieces, ' ', false)
    for (const piece of sentencePieces(
      sentence,
      wordsById,
      masteredWordIds,
      learningLanguage,
      spans,
      masteredConstructionIds,
      originalReading,
      knownLanguage,
    )) {
      pushPiece(pieces, piece.text, piece.translated)
    }
  }
  const collapsed = collapseSpaces(pieces)
  return clipPieces(trimPieces(collapsed), LIBRARY_SNIPPET_LENGTH)
}

function collapseSpaces(pieces: LibrarySnippetPiece[]): LibrarySnippetPiece[] {
  const collapsed: LibrarySnippetPiece[] = []
  for (const piece of pieces) {
    const text = piece.text.replace(/\s+/g, ' ')
    if (!text) continue
    const last = collapsed[collapsed.length - 1]
    if (last?.text.endsWith(' ') && text.startsWith(' ')) {
      pushPiece(collapsed, text.slice(1), piece.translated)
    } else {
      pushPiece(collapsed, text, piece.translated)
    }
  }
  return collapsed
}

function trimPieces(pieces: LibrarySnippetPiece[]): LibrarySnippetPiece[] {
  if (!pieces.length) return []
  const copy = pieces.map((piece) => ({ ...piece }))
  const first = copy[0]!
  first.text = first.text.trimStart()
  const last = copy[copy.length - 1]!
  last.text = last.text.trimEnd()
  return copy.filter((piece) => piece.text)
}
