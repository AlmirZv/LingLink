import { foldSurface, normalizeWordStress } from '@/constants/languages'
import { isOriginalLearningText } from '@/domain/learning/readingLanguageModel'
import {
  proposalsForSentence,
  seedFinalProposalsFromText,
  winningFinalProposal,
} from '@/domain/text/finalTranslationProposals'
import { usesCharacterScript } from '@/domain/words/characterReading'
import type {
  GrammarConstruction,
  ID,
  LanguageCode,
  LearningText,
  TextSentence,
  TextWordOccurrence,
  Word,
} from '@/types/db'

export const READING_BATCH_SIZE = 5

export interface ReadingFocusMember {
  learningWord: Word
  /** Surface that appears most often for this form in the text. */
  original: string
}

export interface ReadingFocusWord {
  /** Most frequent form. The slot id for this family. */
  learningWord: Word
  original: string
  count: number
  /** Every in-text form of the family. One slot, revealed together. */
  members: ReadingFocusMember[]
}

export interface ReadingHint {
  /** Gloss that is not already written in the text. */
  translation?: string
  /** Reading of the word shown in the text, for character-script languages. */
  furigana?: string
  /** Reading of `translation`, when that gloss itself uses characters. */
  translationFurigana?: string
}

export interface ReadingPiece {
  text: string
  kind: 'plain' | 'known' | 'study'
  hint?: ReadingHint
}

export function learningWordFor(
  occurrence: TextWordOccurrence,
  wordsById: Map<ID, Word>,
  learningLanguage: LanguageCode,
): Word | undefined {
  const source = occurrence.wordId ? wordsById.get(occurrence.wordId) : undefined
  if (source?.language === learningLanguage) return source
  if (!occurrence.translations.length) return undefined

  const selected = occurrence.translations.find((item) => item.id === occurrence.selectedTranslationId)
  const selectedWord = selected ? wordsById.get(selected.translationWordId) : undefined
  if (selectedWord?.language === learningLanguage) return selectedWord

  for (const proposal of occurrence.translations) {
    const word = wordsById.get(proposal.translationWordId)
    if (word?.language === learningLanguage) return word
  }
  return undefined
}

function mostFrequentSurface(surfaces: Map<string, number>): string {
  let best = ''
  let bestCount = -1
  for (const [surface, count] of surfaces) {
    if (count > bestCount) {
      best = surface
      bestCount = count
    }
  }
  return best
}

interface ReadingGroup {
  learning: Word
  surfaces: Map<string, number>
  count: number
  firstIndex: number
  sourceIds: Set<ID>
}

class FamilyIndex {
  private parent = new Map<ID, ID>()

  add(id: ID) {
    if (!this.parent.has(id)) this.parent.set(id, id)
  }

  find(id: ID): ID {
    const parent = this.parent.get(id) ?? id
    if (parent === id) return id
    const root = this.find(parent)
    this.parent.set(id, root)
    return root
  }

  union(a: ID, b: ID) {
    this.add(a)
    this.add(b)
    const left = this.find(a)
    const right = this.find(b)
    if (left !== right) this.parent.set(left, right)
  }
}

function connectRoots(ids: ID[], wordsById: Map<ID, Word>, families: FamilyIndex) {
  const present = new Set(ids)
  for (const id of ids) {
    families.add(id)
    const word = wordsById.get(id)
    if (!word) continue
    for (const rootId of word.rootWords) {
      if (!present.has(rootId)) continue
      families.union(id, rootId)
    }
  }
}

/**
 * Words that have a translation, are not fully mastered, ordered by how often
 * they occur. Forms of one family that appear in this text share a single slot.
 */
export interface ReadingConstructionSpan {
  constructionId: ID
  phrase: string
  furigana?: string
  sentenceId: ID
  /** Indexes into the sentence words sorted by position. */
  start: number
  end: number
  surface: string
  firstIndex: number
}

function wordParts(form: string, language: LanguageCode): string[] {
  const parts = form.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+/gu) ?? []
  return parts.filter((part) => /^[\p{L}]+$/u.test(part)).map((part) => foldSurface(part, language))
}

function sameSurface(left: string, right: string): boolean {
  return left.replace(/\s+/g, '') === right.replace(/\s+/g, '')
}

function sortedWords(sentence: TextSentence): TextWordOccurrence[] {
  return [...sentence.words].sort((a, b) => a.position - b.position)
}

function wordRange(
  sentence: TextSentence,
  words: TextWordOccurrence[],
  start: number,
  end: number,
  cursor = 0,
): { from: number; to: number } | null {
  let scan = cursor
  let from = cursor
  let to = cursor
  for (let index = start; index <= end; index += 1) {
    const word = words[index]
    if (!word) return null
    const at = sentence.text.indexOf(word.text, scan)
    const pos = at >= 0 ? at : scan
    if (index === start) from = pos
    to = pos + word.text.length
    scan = to
  }
  return { from, to }
}

function constructionWord(construction: GrammarConstruction, learningLanguage: LanguageCode): Word {
  return {
    id: construction.id,
    language: learningLanguage,
    word: construction.construction,
    ...(construction.furigana ? { furigana: construction.furigana } : {}),
    translations: {},
    type: 'other',
    rootWords: [],
    grammarConstructions: [],
    createdBy: construction.createdBy,
    createdAt: construction.createdAt,
    updatedAt: construction.updatedAt,
  }
}

/**
 * Constructions linked from the words in this text, or already stored on a sentence.
 * A hit is an ordered word-id sequence or a multi-word surface form.
 */
export function findReadingConstructionSpans(
  text: LearningText,
  wordsById: Map<ID, Word>,
  constructionsById: ReadonlyMap<ID, GrammarConstruction>,
): ReadingConstructionSpan[] {
  const raw: ReadingConstructionSpan[] = []
  let globalIndex = 0

  for (const sentence of [...text.sentences].sort((a, b) => a.position - b.position)) {
    const words = sortedWords(sentence)
    const startsAt = words.map((_, index) => {
      const at = globalIndex
      globalIndex += 1
      return at
    })
    const ids = new Set<ID>()
    for (const occurrence of sentence.constructions) ids.add(occurrence.constructionId)
    for (const occurrence of words) {
      const source = occurrence.wordId ? wordsById.get(occurrence.wordId) : undefined
      for (const id of source?.grammarConstructions ?? []) ids.add(id)
    }

    const hits: { id: ID; start: number; end: number }[] = []
    const seen = new Set<string>()
    const addHit = (id: ID, start: number, end: number) => {
      if (end <= start || start < 0 || end >= words.length) return
      const key = `${id}:${start}:${end}`
      if (seen.has(key)) return
      seen.add(key)
      hits.push({ id, start, end })
    }

    for (const id of ids) {
      const construction = constructionsById.get(id)
      const phrase = construction?.construction.trim()
      if (!construction || !phrase) continue
      const sequence = construction.wordIds
      if (sequence && sequence.length >= 2) {
        for (let start = 0; start <= words.length - sequence.length; start += 1) {
          const matches = sequence.every((wordId, offset) => words[start + offset]?.wordId === wordId)
          if (matches) addHit(id, start, start + sequence.length - 1)
        }
      }
      const forms = construction.forms.length ? construction.forms : [construction.construction]
      for (const form of forms) {
        if (sameSurface(form, phrase)) continue
        const parts = wordParts(form, text.language)
        if (parts.length < 2) continue
        for (let start = 0; start <= words.length - parts.length; start += 1) {
          const matches = parts.every(
            (part, offset) => foldSurface(words[start + offset]!.text, text.language) === part,
          )
          if (matches) addHit(id, start, start + parts.length - 1)
        }
      }
      for (const occurrence of sentence.constructions) {
        if (occurrence.constructionId !== id) continue
        addHit(id, occurrence.startPosition, occurrence.endPosition)
      }
    }

    hits.sort((a, b) => a.start - b.start || b.end - a.end)
    let lastEnd = -1
    for (const hit of hits) {
      if (hit.start <= lastEnd) continue
      const construction = constructionsById.get(hit.id)
      if (!construction) continue
      const range = wordRange(sentence, words, hit.start, hit.end)
      if (!range) continue
      const surface = sentence.text.slice(range.from, range.to)
      if (sameSurface(surface, construction.construction)) continue
      lastEnd = hit.end
      raw.push({
        constructionId: hit.id,
        phrase: construction.construction,
        ...(construction.furigana ? { furigana: construction.furigana } : {}),
        sentenceId: sentence.id,
        start: hit.start,
        end: hit.end,
        surface,
        firstIndex: startsAt[hit.start] ?? 0,
      })
    }
  }

  return raw
}

function legendGlossSurface(
  occurrence: TextWordOccurrence,
  learning: Word,
  wordsById: Map<ID, Word>,
  knownLanguage: LanguageCode | undefined,
): string {
  const source = occurrence.wordId ? wordsById.get(occurrence.wordId) : undefined
  const inLearningLanguage = Boolean(
    source && (source.id === learning.id || source.language === learning.language),
  )
  if (knownLanguage && inLearningLanguage) {
    const gloss = knownGloss(learning, occurrence, wordsById, knownLanguage)
    if (gloss?.word) return normalizeWordStress(gloss.word)
  }
  return occurrence.text
}

export function rankReadingWords(
  text: LearningText,
  wordsById: Map<ID, Word>,
  masteredWordIds: ReadonlySet<ID>,
  learningLanguage: LanguageCode,
  constructionsById: ReadonlyMap<ID, GrammarConstruction> = new Map(),
  masteredConstructionIds: ReadonlySet<ID> = new Set(),
  knownLanguage?: LanguageCode,
): ReadingFocusWord[] {
  const groups = new Map<ID, ReadingGroup>()
  const learningIds: ID[] = []
  const sourceIds: ID[] = []
  let index = 0

  for (const sentence of [...text.sentences].sort((a, b) => a.position - b.position)) {
    for (const occurrence of [...sentence.words].sort((a, b) => a.position - b.position)) {
      const seenAt = index
      index += 1
      if (occurrence.wordId) sourceIds.push(occurrence.wordId)
      const learning = learningWordFor(occurrence, wordsById, learningLanguage)
      if (!learning) continue
      learningIds.push(learning.id)
      if (masteredWordIds.has(learning.id)) continue
      const group = groups.get(learning.id) ?? {
        learning,
        surfaces: new Map<string, number>(),
        count: 0,
        firstIndex: seenAt,
        sourceIds: new Set<ID>(),
      }
      group.count += 1
      if (occurrence.wordId) group.sourceIds.add(occurrence.wordId)
      const gloss = legendGlossSurface(occurrence, learning, wordsById, knownLanguage)
      group.surfaces.set(gloss, (group.surfaces.get(gloss) ?? 0) + 1)
      groups.set(learning.id, group)
    }
  }

  const families = new FamilyIndex()
  connectRoots(learningIds, wordsById, families)
  connectRoots(sourceIds, wordsById, families)
  for (const group of groups.values()) {
    for (const sourceId of group.sourceIds) {
      if (sourceIds.includes(sourceId)) families.union(group.learning.id, sourceId)
    }
  }

  const slots = new Map<ID, ReadingGroup[]>()
  for (const group of groups.values()) {
    const key = families.find(group.learning.id)
    const list = slots.get(key) ?? []
    list.push(group)
    slots.set(key, list)
  }

  const wordSlots = [...slots.values()].map((members) => {
    const ordered = [...members].sort((a, b) => a.firstIndex - b.firstIndex)
    const primary = [...ordered].sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex)[0]!
    return {
      learningWord: primary.learning,
      original: mostFrequentSurface(primary.surfaces),
      count: ordered.reduce((sum, member) => sum + member.count, 0),
      members: ordered.map((member) => ({
        learningWord: member.learning,
        original: mostFrequentSurface(member.surfaces),
      })),
      firstIndex: ordered[0]?.firstIndex ?? 0,
    }
  })

  const constructionSlots = constructionSlotsFor(
    findReadingConstructionSpans(text, wordsById, constructionsById),
    constructionsById,
    masteredConstructionIds,
    learningLanguage,
    wordsById,
    knownLanguage,
  )

  return [...wordSlots, ...constructionSlots]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.firstIndex - b.firstIndex
    })
    .map(({ firstIndex: _firstIndex, ...slot }) => slot)
}

function constructionLegendOriginal(
  construction: GrammarConstruction,
  surface: string,
  wordsById: Map<ID, Word>,
  learningLanguage: LanguageCode,
  knownLanguage: LanguageCode | undefined,
): string {
  if (!knownLanguage || construction.language !== learningLanguage) return surface
  for (const id of construction.translations[knownLanguage] ?? []) {
    const word = wordsById.get(id)
    if (word?.language === knownLanguage && word.word) return word.word
  }
  return surface
}

function constructionSlotsFor(
  spans: ReadingConstructionSpan[],
  constructionsById: ReadonlyMap<ID, GrammarConstruction>,
  masteredConstructionIds: ReadonlySet<ID>,
  learningLanguage: LanguageCode,
  wordsById: Map<ID, Word>,
  knownLanguage: LanguageCode | undefined,
): Array<ReadingFocusWord & { firstIndex: number }> {
  const byId = new Map<ID, ReadingConstructionSpan[]>()
  for (const span of spans) {
    const list = byId.get(span.constructionId) ?? []
    list.push(span)
    byId.set(span.constructionId, list)
  }

  const slots: Array<ReadingFocusWord & { firstIndex: number }> = []
  for (const [id, group] of byId) {
    if (masteredConstructionIds.has(id)) continue
    const construction = constructionsById.get(id)
    if (!construction) continue
    const learning = constructionWord(construction, learningLanguage)
    const ordered = [...group].sort((a, b) => a.firstIndex - b.firstIndex)
    const surfaces = new Map<string, number>()
    for (const span of ordered) {
      const gloss = constructionLegendOriginal(
        construction,
        span.surface,
        wordsById,
        learningLanguage,
        knownLanguage,
      )
      surfaces.set(gloss, (surfaces.get(gloss) ?? 0) + 1)
    }
    const uniqueSurfaces = [...surfaces.keys()]
    slots.push({
      learningWord: learning,
      original: mostFrequentSurface(surfaces),
      count: ordered.length,
      members: uniqueSurfaces.map((surface) => ({ learningWord: learning, original: surface })),
      firstIndex: ordered[0]?.firstIndex ?? 0,
    })
  }
  return slots
}

export function revealedReadingWords(words: ReadingFocusWord[], revealedCount: number): ReadingFocusWord[] {
  const shown = Math.min(words.length, Math.max(0, revealedCount))
  return words.slice(0, shown)
}

/** The latest batch of five (or fewer) among the words already revealed. */
export function currentReadingWindow(words: ReadingFocusWord[], revealedCount: number): ReadingFocusWord[] {
  const shown = Math.min(words.length, Math.max(0, revealedCount))
  if (shown === 0) return []
  const start = Math.floor((shown - 1) / READING_BATCH_SIZE) * READING_BATCH_SIZE
  return words.slice(start, shown)
}

function characterReading(word: Word | undefined): string | undefined {
  if (!word?.furigana || !usesCharacterScript(word.language)) return undefined
  return word.furigana
}

function knownGloss(
  word: Word | undefined,
  occurrence: TextWordOccurrence | undefined,
  wordsById: Map<ID, Word>,
  knownLanguage: LanguageCode | undefined,
): Word | undefined {
  if (!knownLanguage) return undefined
  const linked = word?.translations[knownLanguage]
    ?.map((id) => wordsById.get(id))
    .find((item): item is Word => Boolean(item))
  if (linked) return linked
  if (!occurrence) return undefined
  for (const proposal of occurrence.translations) {
    const candidate = wordsById.get(proposal.translationWordId)
    if (candidate?.language === knownLanguage) return candidate
  }
  return undefined
}

function constructionKnownGloss(
  construction: GrammarConstruction,
  wordsById: Map<ID, Word>,
  knownLanguage: LanguageCode | undefined,
): Word | undefined {
  if (!knownLanguage) return undefined
  for (const id of construction.translations[knownLanguage] ?? []) {
    const word = wordsById.get(id)
    if (word?.language === knownLanguage) return word
  }
  return undefined
}

function hintForShownWord(
  shown: string,
  sourceSurface: string,
  learning: Word | undefined,
  occurrence: TextWordOccurrence | undefined,
  wordsById: Map<ID, Word>,
  knownLanguage: LanguageCode | undefined,
): ReadingHint | undefined {
  const onScreenReading = characterReading(learning)
  const gloss = shown === sourceSurface ? knownGloss(learning, occurrence, wordsById, knownLanguage) : undefined
  const translation = shown === sourceSurface ? (gloss?.word ? normalizeWordStress(gloss.word) : undefined) : sourceSurface
  const hint: ReadingHint = {}
  if (translation && translation !== shown) hint.translation = translation
  if (onScreenReading) hint.furigana = onScreenReading
  const glossReading = characterReading(gloss)
  if (hint.translation && glossReading) hint.translationFurigana = glossReading
  if (!hint.translation && !hint.furigana) return undefined
  return hint
}

function pushPiece(pieces: ReadingPiece[], text: string, kind: ReadingPiece['kind'], hint?: ReadingHint) {
  if (!text) return
  const last = pieces[pieces.length - 1]
  if (last && last.kind === kind && !hint && !last.hint) {
    last.text += text
    return
  }
  pieces.push(hint ? { text, kind, hint } : { text, kind })
}

function sentencePieces(
  sentence: TextSentence,
  wordsById: Map<ID, Word>,
  masteredWordIds: ReadonlySet<ID>,
  studyWordIds: ReadonlySet<ID>,
  learningLanguage: LanguageCode,
  spans: ReadingConstructionSpan[],
  knownLanguage: LanguageCode | undefined,
  masteredConstructionIds: ReadonlySet<ID>,
  constructionsById: ReadonlyMap<ID, GrammarConstruction>,
  originalReading: boolean,
): ReadingPiece[] {
  const pieces: ReadingPiece[] = []
  if (!sentence.words.length) {
    pushPiece(pieces, sentence.text, 'plain')
    return pieces
  }

  const sorted = sortedWords(sentence)
  const spanAt = new Map(spans.filter((span) => span.sentenceId === sentence.id).map((span) => [span.start, span]))
  let cursor = 0
  for (let index = 0; index < sorted.length; index += 1) {
    const occurrence = sorted[index]!
    const span = spanAt.get(index)
    const construction = span ? constructionsById.get(span.constructionId) : undefined
    const originalConstructionGloss = originalReading
      ? construction
        ? constructionKnownGloss(construction, wordsById, knownLanguage)
        : undefined
      : undefined
    const active =
      span &&
      (originalConstructionGloss
        ? span
        : !originalReading &&
            (masteredConstructionIds.has(span.constructionId) || studyWordIds.has(span.constructionId))
          ? span
          : undefined)
    if (active) {
      const range = wordRange(sentence, sorted, active.start, active.end, cursor)
      const from = range?.from ?? cursor
      const to = range?.to ?? from
      if (from > cursor) pushPiece(pieces, sentence.text.slice(cursor, from), 'plain')
      const kind = originalReading || !masteredConstructionIds.has(active.constructionId) ? 'study' : 'known'
      const shown = originalReading ? active.surface : active.phrase
      const learning = constructionWord(
        {
          id: active.constructionId,
          language: learningLanguage,
          construction: active.phrase,
          ...(active.furigana ? { furigana: active.furigana } : {}),
          forms: [],
          translations: construction?.translations ?? {},
          type: 'expression',
          relatedWords: [],
          createdBy: '',
          createdAt: '',
          updatedAt: '',
        },
        learningLanguage,
      )
      pushPiece(
        pieces,
        shown,
        kind,
        originalReading
          ? originalConstructionHint(active, originalConstructionGloss)
          : hintForShownWord(active.phrase, active.surface, learning, undefined, wordsById, knownLanguage),
      )
      cursor = to
      index = active.end
      continue
    }

    const at = sentence.text.indexOf(occurrence.text, cursor)
    const start = at >= 0 ? at : cursor
    if (start > cursor) pushPiece(pieces, sentence.text.slice(cursor, start), 'plain')

    const source = occurrence.wordId ? wordsById.get(occurrence.wordId) : undefined
    const learning = learningWordFor(occurrence, wordsById, learningLanguage) ?? source
    if (originalReading) {
      const gloss = knownGloss(learning, occurrence, wordsById, knownLanguage)
      if (gloss?.word) {
        pushPiece(
          pieces,
          occurrence.text,
          'study',
          hintForShownWord(occurrence.text, occurrence.text, learning, occurrence, wordsById, knownLanguage),
        )
      } else {
        pushPiece(pieces, occurrence.text, 'plain')
      }
    } else if (learning && masteredWordIds.has(learning.id)) {
      const shown = normalizeWordStress(learning.word)
      pushPiece(
        pieces,
        shown,
        'known',
        hintForShownWord(shown, occurrence.text, learning, occurrence, wordsById, knownLanguage),
      )
    } else if (learning && studyWordIds.has(learning.id)) {
      const shown = normalizeWordStress(learning.word)
      pushPiece(
        pieces,
        shown,
        'study',
        hintForShownWord(shown, occurrence.text, learning, occurrence, wordsById, knownLanguage),
      )
    } else {
      pushPiece(pieces, occurrence.text, 'plain')
    }
    cursor = start + occurrence.text.length
  }
  if (cursor < sentence.text.length) pushPiece(pieces, sentence.text.slice(cursor), 'plain')
  return pieces
}

function originalConstructionHint(
  span: ReadingConstructionSpan,
  gloss: Word | undefined,
): ReadingHint | undefined {
  if (!gloss?.word) return undefined
  const hint: ReadingHint = { translation: normalizeWordStress(gloss.word) }
  if (span.furigana) hint.furigana = span.furigana
  const glossReading = characterReading(gloss)
  if (glossReading) hint.translationFurigana = glossReading
  return hint
}

/** Full text. Mastered words and the revealed study words are shown as the learning-language form. */
export function renderReadingText(
  text: LearningText,
  wordsById: Map<ID, Word>,
  masteredWordIds: ReadonlySet<ID>,
  studyWordIds: ReadonlySet<ID>,
  learningLanguage: LanguageCode,
  constructionsById: ReadonlyMap<ID, GrammarConstruction> = new Map(),
  knownLanguage?: LanguageCode,
  masteredConstructionIds: ReadonlySet<ID> = new Set(),
): ReadingPiece[] {
  const pieces: ReadingPiece[] = []
  const spans = findReadingConstructionSpans(text, wordsById, constructionsById)
  const originalReading = isOriginalLearningText(text.language, knownLanguage, learningLanguage)
  const sentences = [...text.sentences].sort((a, b) => a.position - b.position)
  sentences.forEach((sentence, sentenceIndex) => {
    if (sentenceIndex > 0) pushPiece(pieces, ' ', 'plain')
    for (const piece of sentencePieces(
      sentence,
      wordsById,
      masteredWordIds,
      studyWordIds,
      learningLanguage,
      spans,
      knownLanguage,
      masteredConstructionIds,
      constructionsById,
      originalReading,
    )) {
      pushPiece(pieces, piece.text, piece.kind, piece.hint)
    }
  })
  return pieces
}

export function sentenceHasFinalTranslation(
  text: LearningText,
  sentenceId: ID,
  targetLanguage: LanguageCode,
): boolean {
  return Boolean(
    winningFinalProposal(
      proposalsForSentence(seedFinalProposalsFromText(text, targetLanguage), sentenceId),
    )?.text.trim(),
  )
}

export function textHasFinalTranslations(text: LearningText, targetLanguage: LanguageCode): boolean {
  return [...text.sentences].some((sentence) =>
    sentenceHasFinalTranslation(text, sentence.id, targetLanguage),
  )
}

/** Whole-sentence natural translations instead of word-by-word substitutions. */
export function renderFinalReadingText(text: LearningText, targetLanguage: LanguageCode): ReadingPiece[] {
  const proposals = seedFinalProposalsFromText(text, targetLanguage)
  const pieces: ReadingPiece[] = []
  const sentences = [...text.sentences].sort((a, b) => a.position - b.position)
  sentences.forEach((sentence, sentenceIndex) => {
    if (sentenceIndex > 0) pushPiece(pieces, ' ', 'plain')
    const winner = winningFinalProposal(proposalsForSentence(proposals, sentence.id))
    const line = winner?.text.trim()
    pushPiece(pieces, line || sentence.text, 'plain')
  })
  return pieces
}
