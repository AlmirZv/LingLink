import { foldSurface, normalizeWordStress } from '@/constants/languages'
import { analyzeText } from '@/domain/text/textAnalysisService'
import { buildStatistics } from '@/domain/text/textStatistics'
import {
  compactText,
  parseSpacedSurfaces,
  sameLettersIgnoringSpaces,
  tokenizeSentence,
  tokensFromSurfaces,
} from '@/domain/text/tokenizer'
import { formatWordLabel, wordMatchSurfaces } from '@/domain/words/characterReading'
import { savedFinalLines, type SavedFinalPiece } from '@/domain/text/savedFinalLines'
import { createAnalysisWordLookup } from '@/services/analysisWordLookup'
import { importMissingWord } from '@/services/dictionary/importDictionaryWord'
import type { Repositories } from '@/services/repositories/contracts'
import { createWordCatalog, mapPool, type WordCatalog } from '@/services/wordCatalog'
import type { AnalyzedConstruction, AnalyzedSentence, AnalyzedWord, TextAnalysisResult } from '@/types/analysis'
import type { ID, LanguageCode, LearningText, Word } from '@/types/db'

export type ScanMode = 'auto' | 'manual'

export type { SavedFinalPiece }
export { savedFinalLines }

export interface ScanOption {
  id: ID
  label: string
  character?: string
  furigana?: string
}

export interface ScanWord {
  normalized: string
  surface: string
  language: LanguageCode
  sourceWordId?: ID
  character?: string
  furigana?: string
  options: ScanOption[]
  selectedTranslationId: string
  roots: ScanOption[]
  constructions: ScanOption[]
}

export interface ScanColumn {
  id: string
  kind: 'word' | 'other'
  text: string
  normalized: string
  /** Chosen translation for this occurrence. The same word can differ between sentences. */
  selectedTranslationId?: string
}

export interface ScanSentence {
  id: string
  columns: ScanColumn[]
}

export interface TextScan {
  analysis: TextAnalysisResult
  sentences: ScanSentence[]
  words: Record<string, ScanWord>
  targetLanguage: LanguageCode
  sentenceCount: number
  uniqueWordCount: number
}

function optionFromWord(word: Word): ScanOption {
  return {
    id: word.id,
    label: normalizeWordStress(word.word),
    character: word.character,
    furigana: word.furigana,
  }
}

function pushUniqueOption(options: ScanOption[], word: Word, language: LanguageCode) {
  const option = optionFromWord(word)
  const key = foldSurface(option.label, language)
  if (!option.label) return
  if (options.some((item) => item.id === option.id || foldSurface(item.label, language) === key)) return
  options.push(option)
}

function surfaceMatches(word: Word, normalized: string, language: LanguageCode): boolean {
  return word.language === language && wordMatchSurfaces(word).some((surface) => foldSurface(surface, language) === normalized)
}

async function scanOptionsFromIds(
  catalog: WordCatalog,
  ids: ID[],
  language: LanguageCode,
): Promise<ScanOption[]> {
  const options: ScanOption[] = []
  for (const id of ids) {
    const word = await catalog.getById(id)
    if (word) pushUniqueOption(options, word, language)
  }
  return options
}

export async function scanText(
  repos: Repositories,
  input: {
    text: string
    language: LanguageCode
    targetLanguage: LanguageCode
    authorId?: ID
    mode?: ScanMode
  },
): Promise<TextScan> {
  const dictionary = input.mode !== 'manual'
  const catalog = createWordCatalog(repos)
  await catalog.ensure()
  const lookup = createAnalysisWordLookup(repos, catalog)
  const analysis = await analyzeText({ text: input.text, language: input.language }, lookup)
  const words: Record<string, ScanWord> = {}
  const entities = new Map<string, Word | null>()

  for (const analyzed of analysis.words) {
    let entity = analyzed.wordId ? await catalog.getById(analyzed.wordId) : null
    if (!entity) entity = await catalog.findExact(input.language, analyzed.text)
    entities.set(analyzed.normalized, entity)
  }

  const missing = analysis.words.filter((item) => !entities.get(item.normalized))
  if (dictionary && input.authorId && missing.length) {
    await mapPool(missing, 4, async (analyzed) => {
      try {
        const entity = await importMissingWord(
          repos,
          analyzed.text,
          input.language,
          input.authorId!,
          catalog,
        )
        entities.set(analyzed.normalized, entity)
      } catch {
        entities.set(analyzed.normalized, null)
      }
    })
  }

  const constructionIds = new Set<ID>()
  for (const entity of entities.values()) {
    for (const id of entity?.grammarConstructions ?? []) constructionIds.add(id)
  }
  const constructionRows = await Promise.all(
    [...constructionIds].map(async (id) => [id, await repos.constructions.getById(id)] as const),
  )
  const constructionById = new Map(constructionRows)

  for (const analyzed of analysis.words) {
    const entity = entities.get(analyzed.normalized) ?? null
    const options = await scanOptionsFromIds(
      catalog,
      entity?.translations[input.targetLanguage] ?? [],
      input.targetLanguage,
    )
    const roots = await scanOptionsFromIds(catalog, entity?.rootWords ?? [], input.language)
    const constructions: ScanOption[] = []
    for (const id of entity?.grammarConstructions ?? []) {
      const construction = constructionById.get(id)
      if (construction) constructions.push({ id: construction.id, label: construction.construction })
    }

    words[analyzed.normalized] = {
      normalized: analyzed.normalized,
      surface: analyzed.text,
      language: input.language,
      sourceWordId: entity?.id,
      character: entity?.character,
      furigana: entity?.furigana,
      options,
      selectedTranslationId: options[0]?.id ?? '',
      roots,
      constructions,
    }
  }

  const sentences: ScanSentence[] = analysis.sentences.map((sentence) => ({
    id: sentence.id,
    columns: sentence.tokens.map((token) => ({
      id: token.id,
      kind: token.type === 'word' ? 'word' : 'other',
      text: token.text,
      normalized: token.normalized,
      ...(token.type === 'word'
        ? { selectedTranslationId: words[token.normalized]?.selectedTranslationId ?? '' }
        : {}),
    })),
  }))

  return {
    analysis,
    sentences,
    words,
    targetLanguage: input.targetLanguage,
    sentenceCount: analysis.statistics.sentenceCount,
    uniqueWordCount: analysis.statistics.uniqueWordCount,
  }
}

export type RetokenizeSentenceResult = { ok: true } | { ok: false; reason: 'empty' | 'mismatch' }

function columnSpans(columns: ScanColumn[]): Array<{ start: number; end: number; column: ScanColumn }> {
  const spans: Array<{ start: number; end: number; column: ScanColumn }> = []
  let offset = 0
  for (const column of columns) {
    const length = compactText(column.text).length
    spans.push({ start: offset, end: offset + length, column })
    offset += length
  }
  return spans
}

export function spacedScanSentence(columns: ScanColumn[]): string {
  return columns.map((column) => column.text).join(' ')
}

export function transferScanTranslations(previous: ScanColumn[], next: ScanColumn[]): ScanColumn[] {
  const oldSpans = columnSpans(previous)
  const newSpans = columnSpans(next)
  return next.map((column, index) => {
    if (column.kind !== 'word') return column
    const span = newSpans[index]
    if (!span) return column
    const match = oldSpans.find(
      (item) => item.column.kind === 'word' && item.start === span.start && item.end === span.end,
    )
    if (!match?.column.selectedTranslationId) return column
    return { ...column, selectedTranslationId: match.column.selectedTranslationId }
  })
}

function remapSentenceConstructions(
  constructions: AnalyzedConstruction[],
  sentenceId: string,
  columns: ScanColumn[],
  words: Record<string, ScanWord>,
): AnalyzedConstruction[] {
  const wordColumns = columns.filter((column) => column.kind === 'word')
  return constructions.flatMap((construction) => {
    if (construction.sentenceId !== sentenceId) return [construction]
    const target = compactText(construction.text)
    if (!target) return []
    for (let start = 0; start < wordColumns.length; start += 1) {
      let joined = ''
      for (let end = start; end < wordColumns.length; end += 1) {
        joined += wordColumns[end]!.text
        if (compactText(joined) !== target) continue
        const wordIds = wordColumns
          .slice(start, end + 1)
          .map((column) => words[column.normalized]?.sourceWordId)
          .filter((id): id is ID => Boolean(id))
        return [
          {
            ...construction,
            startPosition: start,
            endPosition: end,
            ...(wordIds.length === end - start + 1 ? { wordIds } : { wordIds: undefined }),
          },
        ]
      }
    }
    return []
  })
}

function rebuildAnalyzedWords(scan: TextScan): AnalyzedWord[] {
  const counts = new Map<string, AnalyzedWord>()
  for (const sentence of scan.sentences) {
    for (const column of sentence.columns) {
      if (column.kind !== 'word') continue
      const current = counts.get(column.normalized)
      if (current) {
        current.occurrenceCount += 1
        continue
      }
      const entity = scan.words[column.normalized]
      counts.set(column.normalized, {
        wordId: entity?.sourceWordId,
        text: column.text,
        normalized: column.normalized,
        occurrenceCount: 1,
        known: Boolean(entity?.sourceWordId),
        rootWordsInText: [],
      })
    }
  }
  return [...counts.values()]
}

async function materializeScanWord(
  scan: TextScan,
  surface: string,
  repos: Repositories,
  catalog: WordCatalog,
  authorId?: ID,
): Promise<ScanWord> {
  const language = scan.analysis.language
  const normalized = foldSurface(surface, language)
  const existing = scan.words[normalized]
  if (existing) return existing

  let entity = await catalog.findExact(language, surface)
  if (!entity && authorId) {
    try {
      entity = await importMissingWord(repos, surface, language, authorId, catalog)
    } catch {
      entity = null
    }
  }

  const constructionIds = entity?.grammarConstructions ?? []
  const constructionRows = await Promise.all(
    constructionIds.map(async (id) => [id, await repos.constructions.getById(id)] as const),
  )
  const options = await scanOptionsFromIds(catalog, entity?.translations[scan.targetLanguage] ?? [], scan.targetLanguage)
  const roots = await scanOptionsFromIds(catalog, entity?.rootWords ?? [], language)
  const constructions: ScanOption[] = []
  for (const [id, construction] of constructionRows) {
    if (construction) constructions.push({ id, label: construction.construction })
  }

  const word: ScanWord = {
    normalized,
    surface,
    language,
    sourceWordId: entity?.id,
    character: entity?.character,
    furigana: entity?.furigana,
    options,
    selectedTranslationId: options[0]?.id ?? '',
    roots,
    constructions,
  }
  scan.words[normalized] = word
  return word
}

/** Rebuild one sentence from a space-separated edit. Letters must stay the same. */
export async function retokenizeScanSentence(
  scan: TextScan,
  sentenceId: string,
  spacedText: string,
  repos: Repositories,
  authorId?: ID,
): Promise<RetokenizeSentenceResult> {
  const sentence = scan.sentences.find((item) => item.id === sentenceId)
  const analyzed = scan.analysis.sentences.find((item) => item.id === sentenceId)
  if (!sentence || !analyzed) return { ok: false, reason: 'empty' }
  const surfaces = parseSpacedSurfaces(spacedText)
  if (!surfaces.length) return { ok: false, reason: 'empty' }
  const original = analyzed.text || sentence.columns.map((column) => column.text).join('')
  if (!sameLettersIgnoringSpaces(spacedText, original)) {
    return { ok: false, reason: 'mismatch' }
  }

  const tokens = tokensFromSurfaces({ id: sentenceId }, surfaces, scan.analysis.language)
  const next = tokens.map((token) => ({
    id: token.id,
    kind: token.type === 'word' ? ('word' as const) : ('other' as const),
    text: token.text,
    normalized: token.normalized,
    ...(token.type === 'word' ? { selectedTranslationId: '' } : {}),
  }))
  const transferred = transferScanTranslations(sentence.columns, next)
  const catalog = createWordCatalog(repos)
  await catalog.ensure()
  const columns: ScanColumn[] = []
  for (const column of transferred) {
    if (column.kind !== 'word') {
      columns.push(column)
      continue
    }
    const word = await materializeScanWord(scan, column.text, repos, catalog, authorId)
    columns.push({
      ...column,
      selectedTranslationId: column.selectedTranslationId || word.selectedTranslationId || word.options[0]?.id || '',
    })
  }

  sentence.columns = columns
  analyzed.tokens = tokens
  scan.analysis.constructions = remapSentenceConstructions(
    scan.analysis.constructions,
    sentenceId,
    columns,
    scan.words,
  )
  scan.analysis.words = rebuildAnalyzedWords(scan)
  scan.analysis.statistics = buildStatistics(
    scan.analysis.sentences.map((item) => ({ id: item.id, position: item.position, text: item.text })),
    scan.analysis.sentences.flatMap((item) => item.tokens),
    scan.analysis.words,
    scan.analysis.constructions,
    scan.analysis.statistics.rootWordGroupsCount,
  )
  scan.sentenceCount = scan.analysis.statistics.sentenceCount
  scan.uniqueWordCount = scan.analysis.statistics.uniqueWordCount
  return { ok: true }
}

/** Copies a translation onto the same word wherever that occurrence still has none. */
export function fillMissingScanTranslations(scan: TextScan, normalized: string, translationId: string): void {
  if (!translationId) return
  for (const sentence of scan.sentences) {
    for (const column of sentence.columns) {
      if (column.kind !== 'word' || column.normalized !== normalized) continue
      if (column.selectedTranslationId) continue
      column.selectedTranslationId = translationId
    }
  }
  const word = scan.words[normalized]
  if (word && !word.selectedTranslationId) word.selectedTranslationId = translationId
}

export function scanChoices(scan: TextScan): Map<string, { sourceWordId?: ID; translationWordId?: ID }> {
  const choices = new Map<string, { sourceWordId?: ID; translationWordId?: ID }>()
  for (const sentence of scan.sentences) {
    for (const column of sentence.columns) {
      if (column.kind !== 'word') continue
      const word = scan.words[column.normalized]
      choices.set(column.id, {
        sourceWordId: word?.sourceWordId,
        translationWordId: column.selectedTranslationId || undefined,
      })
    }
  }
  return choices
}

/** Rebuild the post-scan review from a stored draft, including chosen translations. */
export async function scanFromLearningText(
  repos: Repositories,
  text: LearningText,
  targetLanguage: LanguageCode,
): Promise<TextScan> {
  const analyzedSentences: AnalyzedSentence[] = [...text.sentences]
    .sort((a, b) => a.position - b.position)
    .map((sentence) => ({
      id: sentence.id,
      position: sentence.position,
      text: sentence.text,
      tokens: tokenizeSentence(
        { id: sentence.id, position: sentence.position, text: sentence.text },
        text.language,
      ),
    }))
  const tokens = analyzedSentences.flatMap((sentence) => sentence.tokens)
  const occurrences = text.sentences.flatMap((sentence) => sentence.words)
  const words: Record<string, ScanWord> = {}
  const analyzedWords: AnalyzedWord[] = []
  const pending: Array<{ normalized: string; surface: string; matches: typeof occurrences }> = []

  for (const sentence of analyzedSentences) {
    for (const token of sentence.tokens) {
      if (token.type !== 'word' || words[token.normalized] || pending.some((item) => item.normalized === token.normalized)) {
        continue
      }
      pending.push({
        normalized: token.normalized,
        surface: token.text,
        matches: occurrences.filter(
          (occurrence) => foldSurface(occurrence.text, text.language) === token.normalized,
        ),
      })
    }
  }

  const storedIds = pending.flatMap((item) => {
    const id = item.matches.find((occurrence) => occurrence.wordId)?.wordId
    return id ? [id] : []
  })
  const byId = new Map((await repos.words.listByIds(storedIds)).map((word) => [word.id, word]))
  const entityByNormalized = new Map<string, Word | null>()
  const unresolved: typeof pending = []
  for (const item of pending) {
    const storedId = item.matches.find((occurrence) => occurrence.wordId)?.wordId
    const stored = storedId ? byId.get(storedId) : undefined
    if (stored && surfaceMatches(stored, item.normalized, text.language)) entityByNormalized.set(item.normalized, stored)
    else unresolved.push(item)
  }
  if (unresolved.length) {
    const catalog = (await repos.words.listAll()).filter((word) => word.language === text.language)
    for (const word of catalog) byId.set(word.id, word)
    for (const item of unresolved) {
      entityByNormalized.set(
        item.normalized,
        catalog.find((word) => surfaceMatches(word, item.normalized, text.language)) ?? null,
      )
    }
  }

  const linkedIds: ID[] = []
  for (const entity of entityByNormalized.values()) {
    if (!entity) continue
    linkedIds.push(...(entity.translations[targetLanguage] ?? []), ...entity.rootWords)
  }
  for (const occurrence of occurrences) {
    for (const proposal of occurrence.translations) {
      if (proposal.translationWordId) linkedIds.push(proposal.translationWordId)
    }
  }
  for (const sentence of text.sentences) {
    for (const occurrence of sentence.constructions) {
      const proposal = occurrence.translations.find((item) => item.id === occurrence.selectedTranslationId)
      if (proposal?.translationId) linkedIds.push(proposal.translationId)
    }
  }
  const missingIds = [...new Set(linkedIds)].filter((id) => !byId.has(id))
  if (missingIds.length) {
    for (const word of await repos.words.listByIds(missingIds)) byId.set(word.id, word)
  }

  const constructionIds = new Set<ID>()
  for (const entity of entityByNormalized.values()) {
    for (const id of entity?.grammarConstructions ?? []) constructionIds.add(id)
  }
  for (const sentence of text.sentences) {
    for (const occurrence of sentence.constructions) constructionIds.add(occurrence.constructionId)
  }
  const storedConstructions = await Promise.all(
    [...constructionIds].map(async (id) => [id, await repos.constructions.getById(id)] as const),
  )
  const constructionById = new Map(storedConstructions)

  for (const item of pending) {
    const entity = entityByNormalized.get(item.normalized) ?? null
    const translationIds = entity?.translations[targetLanguage] ?? []
    const options = translationIds.flatMap((id) => {
      const word = byId.get(id)
      return word ? [optionFromWord(word)] : []
    })
    const selectedOccurrence = item.matches.find((occurrence) => occurrence.selectedTranslationId)
    const proposal = selectedOccurrence?.translations.find(
      (entry) => entry.id === selectedOccurrence.selectedTranslationId,
    )
    const proposalId =
      proposal?.translationWordId && translationIds.includes(proposal.translationWordId)
        ? proposal.translationWordId
        : ''
    if (proposalId && !options.some((option) => option.id === proposalId)) {
      const chosen = byId.get(proposalId)
      if (chosen) options.unshift(optionFromWord(chosen))
    }
    for (const match of item.matches) {
      const chosenProposal = match.translations.find((entry) => entry.id === match.selectedTranslationId)
      const translationWordId = chosenProposal?.translationWordId
      if (!translationWordId || !translationIds.includes(translationWordId)) continue
      if (options.some((option) => option.id === translationWordId)) continue
      const chosen = byId.get(translationWordId)
      if (chosen) options.push(optionFromWord(chosen))
    }
    const roots = (entity?.rootWords ?? []).flatMap((id) => {
      const word = byId.get(id)
      return word ? [optionFromWord(word)] : []
    })
    const linkedConstructions: ScanOption[] = []
    for (const id of entity?.grammarConstructions ?? []) {
      const construction = constructionById.get(id)
      if (construction) linkedConstructions.push({ id: construction.id, label: construction.construction })
    }
    words[item.normalized] = {
      normalized: item.normalized,
      surface: item.surface,
      language: text.language,
      sourceWordId: entity?.id,
      character: entity?.character,
      furigana: entity?.furigana,
      options,
      selectedTranslationId: proposalId || options[0]?.id || '',
      roots,
      constructions: linkedConstructions,
    }
    analyzedWords.push({
      wordId: entity?.id,
      text: item.surface,
      normalized: item.normalized,
      occurrenceCount: item.matches.length || 1,
      known: Boolean(entity?.id),
      rootWordsInText: [],
    })
  }

  const constructions: AnalyzedConstruction[] = []
  for (const sentence of text.sentences) {
    for (const occurrence of sentence.constructions) {
      const stored = constructionById.get(occurrence.constructionId) ?? null
      const proposal = occurrence.translations.find((item) => item.id === occurrence.selectedTranslationId)
      const translationWordId = proposal?.translationId
      const translationWord = translationWordId ? byId.get(translationWordId) : undefined
      const wordIds = stored?.wordIds?.length ? stored.wordIds : stored?.relatedWords
      constructions.push({
        constructionId: occurrence.constructionId,
        text: occurrence.text,
        sentenceId: sentence.id,
        startPosition: occurrence.startPosition,
        endPosition: occurrence.endPosition,
        ...(wordIds?.length ? { wordIds } : {}),
        ...(translationWordId ? { translationWordId } : {}),
        ...(translationWord ? { translationLabel: translationWord.word } : {}),
        ...(stored?.construction ? { phrase: stored.construction } : {}),
        ...(stored?.furigana ? { phraseFurigana: stored.furigana } : {}),
      })
    }
  }
  const analysis: TextAnalysisResult = {
    originalText: analyzedSentences.map((sentence) => sentence.text).join('\n'),
    normalizedText: analyzedSentences.map((sentence) => sentence.text).join('\n'),
    language: text.language,
    sentences: analyzedSentences,
    words: analyzedWords,
    constructions,
    statistics: buildStatistics(
      analyzedSentences.map((sentence) => ({
        id: sentence.id,
        position: sentence.position,
        text: sentence.text,
      })),
      tokens,
      analyzedWords,
      constructions,
      0,
    ),
  }

  return {
    analysis,
    sentences: analyzedSentences.map((sentence) => {
      const stored = text.sentences.find((item) => item.id === sentence.id)
      let occurrenceIndex = 0
      return {
        id: sentence.id,
        columns: sentence.tokens.map((token) => {
          if (token.type !== 'word') {
            return {
              id: token.id,
              kind: 'other' as const,
              text: token.text,
              normalized: token.normalized,
            }
          }
          const occurrence = stored?.words[occurrenceIndex]
          occurrenceIndex += 1
          const word = words[token.normalized]
          const proposal = occurrence?.translations.find((item) => item.id === occurrence.selectedTranslationId)
          const chosenId =
            proposal?.translationWordId && word?.options.some((option) => option.id === proposal.translationWordId)
              ? proposal.translationWordId
              : word?.options[0]?.id ?? ''
          return {
            id: token.id,
            kind: 'word' as const,
            text: token.text,
            normalized: token.normalized,
            selectedTranslationId: chosenId,
          }
        }),
      }
    }),
    words,
    targetLanguage,
    sentenceCount: analysis.statistics.sentenceCount,
    uniqueWordCount: analysis.statistics.uniqueWordCount,
  }
}

export function translationLabel(word: ScanWord | undefined): string {
  if (!word?.selectedTranslationId) return ''
  const chosen = word.options.find((option) => option.id === word.selectedTranslationId)
  if (!chosen) return ''
  return formatWordLabel({ word: chosen.label, furigana: chosen.furigana })
}
