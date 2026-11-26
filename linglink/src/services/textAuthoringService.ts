import { foldSurface } from '@/constants/languages'
import { buildDraftLearningText } from '@/domain/text/buildDraftFromAnalysis'
import { collectUniqueWordGroups, findOccurrence } from '@/domain/translation/wordGroups'
import {
  collectWordAndConstructionIds,
  computeTranslationProgress,
} from '@/services/textDenormalize'
import type { Repositories } from '@/services/repositories/contracts'
import { setTextSeries } from '@/services/seriesService'
import { applyFinalProposals } from '@/domain/text/finalTranslationProposals'
import { savedFinalLines } from '@/domain/text/savedFinalLines'
import type { TextAnalysisResult } from '@/types/analysis'
import type {
  FinalTranslationProposal,
  ID,
  LanguageCode,
  LearningText,
  TextLevel,
  Topic,
  Word,
  WordTranslationProposal,
} from '@/types/db'

const ts = () => new Date().toISOString()

export async function resolveTopicIds(
  repos: Repositories,
  names: string[],
  language: LanguageCode,
  authorId: ID,
): Promise<ID[]> {
  if (names.length === 0) return []
  const existing = await repos.topics.list()
  const byKey = new Map<string, ID>()
  for (const topic of existing) {
    const key = topic.name.trim().toLocaleLowerCase()
    const current = byKey.get(key)
    if (!current || topic.language === language) byKey.set(key, topic.id)
  }

  const ids: ID[] = []
  for (const name of names) {
    const key = name.toLocaleLowerCase()
    const found = byKey.get(key)
    if (found) {
      ids.push(found)
      continue
    }
    const topic: Topic = {
      id: `topic-${crypto.randomUUID()}`,
      name,
      language,
      createdBy: authorId,
      createdAt: ts(),
    }
    const created = await repos.topics.create(topic)
    byKey.set(key, created.id)
    ids.push(created.id)
  }
  return ids
}

export async function topicNamesLine(repos: Repositories, ids: ID[]): Promise<string> {
  if (ids.length === 0) return ''
  const topics = await repos.topics.list()
  const names = new Map(topics.map((topic) => [topic.id, topic.name]))
  return ids
    .map((id) => names.get(id)?.trim())
    .filter((name): name is string => Boolean(name))
    .join(', ')
}

async function knownTranslationMap(
  analysis: TextAnalysisResult,
  targetLanguage: string,
  repos: Repositories,
  choices?: Map<string, { sourceWordId?: ID; translationWordId?: ID }>,
): Promise<Map<ID, ID>> {
  const map = new Map<ID, ID>()
  if (choices) {
    for (const choice of choices.values()) {
      if (choice.sourceWordId && choice.translationWordId) {
        map.set(choice.sourceWordId, choice.translationWordId)
      }
    }
  }
  const needed = new Set<ID>()
  for (const word of analysis.words) {
    if (word.wordId && !map.has(word.wordId)) needed.add(word.wordId)
  }
  if (!needed.size) return map
  const loaded = await repos.words.listByIds([...needed])
  for (const entity of loaded) {
    const tid = entity.translations[targetLanguage]?.[0]
    if (tid) map.set(entity.id, tid)
  }
  return map
}

export interface FinalLinePiece {
  kind: 'word' | 'extra'
  normalized?: string
  text: string
}

function sameSurface(text: string, normalized: string, language: string): boolean {
  return foldSurface(text, language) === normalized
}

function joinFinalText(parts: string[], language: string): string {
  const spaced = language !== 'ja' && language !== 'zh'
  let out = ''
  for (const part of parts) {
    if (!part) continue
    if (!out) {
      out = part
      continue
    }
    const punctuation = /^[.,!?;:。！？、，؟،]/.test(part)
    out += punctuation || !spaced ? part : ` ${part}`
  }
  return out
}

function keepPublishedStatus(status: LearningText['status']): LearningText['status'] {
  return status === 'published' || status === 'hidden' ? status : 'draft'
}

/** Keep library identity when a scan rebuilds sentences. The rebuild itself is always a draft. */
function withExistingCatalogFields(existing: LearningText, rebuilt: LearningText): LearningText {
  return {
    ...existing,
    ...rebuilt,
    id: existing.id,
    title: existing.title,
    language: rebuilt.language,
    authorId: existing.authorId,
    coAuthorIds: existing.coAuthorIds,
    topics: existing.topics,
    level: existing.level,
    imageUrl: existing.imageUrl,
    seriesId: existing.seriesId,
    seriesPosition: existing.seriesPosition,
    ratings: existing.ratings,
    views: existing.views,
    favoritesCount: existing.favoritesCount,
    dislikesCount: existing.dislikesCount ?? 0,
    editCount: existing.editCount ?? 0,
    commentsCount: existing.commentsCount ?? 0,
    createdAt: existing.createdAt,
    status: keepPublishedStatus(existing.status),
    finalTranslations: existing.finalTranslations,
  }
}

/** Arranged review lines become the natural translation of the published text. */
export function applyFinalLines(
  text: LearningText,
  lines: Record<string, FinalLinePiece[]>,
  targetLanguage: string,
  authorId: ID,
): LearningText {
  const words: LearningText['finalTranslations'][string]['words'] = []
  const sentenceTexts: string[] = []
  const fallback = savedFinalLines(text, targetLanguage as LanguageCode)

  for (const sentence of text.sentences) {
    const pieces = lines[sentence.id]?.length ? lines[sentence.id] : fallback[sentence.id]
    if (!pieces?.length) continue
    const used = new Set<ID>()
    const parts: string[] = []
    for (const piece of pieces) {
      const label = piece.text.trim()
      if (!label) continue
      if (piece.kind === 'extra') {
        words.push({ text: label, sourceOccurrenceIds: [] })
        parts.push(label)
        continue
      }
      const occurrence = sentence.words.find(
        (item) =>
          !used.has(item.id) &&
          piece.normalized !== undefined &&
          sameSurface(item.text, piece.normalized, text.language),
      )
      if (occurrence) used.add(occurrence.id)
      const selected = occurrence?.translations.find((proposal) => proposal.id === occurrence.selectedTranslationId)
      words.push({
        text: label,
        ...(selected ? { wordId: selected.translationWordId } : {}),
        sourceOccurrenceIds: occurrence ? [occurrence.id] : [],
      })
      parts.push(label)
    }
    const sentenceText = joinFinalText(parts, targetLanguage)
    if (sentenceText) sentenceTexts.push(sentenceText)
  }

  if (words.length === 0) return text
  const previous = text.finalTranslations[targetLanguage]
  const previousSentences = previous?.text.split('\n').filter((line) => line.trim()).length ?? 0
  if (previous?.text && sentenceTexts.length < text.sentences.length && sentenceTexts.length < previousSentences) {
    return text
  }
  return {
    ...text,
    finalTranslations: {
      ...text.finalTranslations,
      [targetLanguage]: {
        text: sentenceTexts.join('\n'),
        words,
        addedBy: authorId,
        addedAt: ts(),
        alternatives: [],
      },
    },
    updatedAt: ts(),
  }
}

/** Replace a stored draft with the current review, then publish that same text. */
export async function publishDraftFromScan(
  repos: Repositories,
  existing: LearningText,
  input: {
    analysis: TextAnalysisResult
    authorId: ID
    targetLanguage: string
    title?: string
    level?: TextLevel
    topics?: ID[]
    seriesId?: ID | ''
    choices?: Map<string, { sourceWordId?: ID; translationWordId?: ID }>
    finalLines?: Record<string, FinalLinePiece[]>
    finalProposals?: FinalTranslationProposal[]
  },
): Promise<LearningText> {
  const knownTranslationWordIds = await knownTranslationMap(
    input.analysis,
    input.targetLanguage,
    repos,
    input.choices,
  )
  const rebuilt = buildDraftLearningText({
    analysis: input.analysis,
    title: input.title?.trim() || existing.title,
    level: input.level ?? existing.level,
    topics: input.topics ?? existing.topics,
    authorId: input.authorId,
    targetLanguage: input.targetLanguage,
    knownTranslationWordIds,
    choices: input.choices,
    textId: existing.id,
  })
  const merged = withExistingCatalogFields(existing, rebuilt)
  const lined =
    input.finalProposals !== undefined
      ? applyFinalProposals(merged, input.finalProposals, input.targetLanguage)
      : applyFinalLines(merged, input.finalLines ?? {}, input.targetLanguage, input.authorId)
  const indexed: LearningText = {
    ...lined,
    title: input.title?.trim() || lined.title,
    level: input.level ?? lined.level,
    topics: input.topics ?? lined.topics,
    ...collectWordAndConstructionIds(lined),
    translationProgress: computeTranslationProgress(lined),
  }
  let stored = await repos.texts.update(indexed)
  if ('seriesId' in input) stored = await setTextSeries(repos, stored, input.seriesId || undefined)
  if (stored.status === 'published' || stored.status === 'hidden') return stored
  return publishText(repos, existing.id)
}

export async function updatePublishedCatalog(
  repos: Repositories,
  text: LearningText,
  input: { title: string; level: TextLevel; topics: ID[]; seriesId?: ID | '' },
): Promise<LearningText> {
  const stored = await repos.texts.update({
    ...text,
    title: input.title.trim(),
    level: input.level,
    topics: input.topics,
    updatedAt: ts(),
  })
  return setTextSeries(repos, stored, input.seriesId || undefined)
}

export function isDemotedPublishedText(text: LearningText): boolean {
  if (text.status !== 'draft') return false
  if (text.views > 0 || text.favoritesCount > 0 || (text.dislikesCount ?? 0) > 0 || (text.editCount ?? 0) > 0) {
    return true
  }
  if ((text.ratings?.totalVotes ?? 0) > 0) return true
  if (Object.values(text.finalTranslations ?? {}).some((item) => item?.text?.trim())) return true
  return (text.translationProgress ?? 0) > 0 && text.sentences.length > 0
}

async function rebuildEmptyFinalTranslations(
  repos: Repositories,
  text: LearningText,
  authorId: ID,
): Promise<LearningText> {
  if (Object.values(text.finalTranslations ?? {}).some((item) => item?.text?.trim())) return text

  const selectedIds = [
    ...new Set(
      text.sentences.flatMap((sentence) =>
        sentence.words.flatMap((occurrence) => {
          const proposal = occurrence.translations.find((item) => item.id === occurrence.selectedTranslationId)
          return proposal?.translationWordId ? [proposal.translationWordId] : []
        }),
      ),
    ),
  ]
  if (selectedIds.length === 0) return text
  const loaded = await repos.words.listByIds(selectedIds)
  const byId = new Map(loaded.map((word) => [word.id, word]))
  const languages = new Set(loaded.map((word) => word.language))
  let next = text
  for (const language of languages) {
    const lines: Record<string, FinalLinePiece[]> = {}
    for (const sentence of text.sentences) {
      const pieces: FinalLinePiece[] = []
      for (const occurrence of sentence.words) {
        const proposal = occurrence.translations.find((item) => item.id === occurrence.selectedTranslationId)
        const word = proposal?.translationWordId ? byId.get(proposal.translationWordId) : undefined
        if (!word || word.language !== language) continue
        pieces.push({
          kind: 'word',
          normalized: foldSurface(occurrence.text, text.language),
          text: word.word,
        })
      }
      if (pieces.length) lines[sentence.id] = pieces
    }
    next = applyFinalLines(next, lines, language, authorId)
  }
  return next
}

/**
 * Published texts that a translation save turned into drafts (they then vanished from the library).
 * Pass authorId so a signed-in author can restore their own rows without listing every draft.
 */
export async function restorePublishedDrafts(repos: Repositories, authorId?: ID): Promise<number> {
  const candidates = authorId ? await repos.texts.listByAuthor(authorId) : await repos.texts.listByStatus('draft')
  const stuck = candidates.filter(isDemotedPublishedText)
  await Promise.all(
    stuck.map(async (text) => {
      const rebuilt = await rebuildEmptyFinalTranslations(repos, text, text.authorId)
      const next = {
        ...rebuilt,
        status: 'published' as const,
        ...collectWordAndConstructionIds(rebuilt),
        translationProgress: computeTranslationProgress(rebuilt),
        updatedAt: ts(),
      }
      await repos.texts.update(next)
    }),
  )
  return stuck.length
}

export async function publishScannedText(
  repos: Repositories,
  input: {
    analysis: TextAnalysisResult
    title: string
    level: TextLevel
    topics: ID[]
    authorId: ID
    targetLanguage: string
    seriesId?: ID
    choices?: Map<string, { sourceWordId?: ID; translationWordId?: ID }>
    finalLines?: Record<string, FinalLinePiece[]>
    finalProposals?: FinalTranslationProposal[]
  },
): Promise<LearningText> {
  const draft = await confirmDraftFromAnalysis(repos, input)
  const lined =
    input.finalProposals !== undefined
      ? applyFinalProposals(draft, input.finalProposals, input.targetLanguage)
      : applyFinalLines(draft, input.finalLines ?? {}, input.targetLanguage, input.authorId)
  const stored = lined === draft ? draft : await repos.texts.update(lined)
  const linked = await setTextSeries(repos, stored, input.seriesId)
  return publishText(repos, linked.id)
}

export async function confirmDraftFromAnalysis(
  repos: Repositories,
  input: {
    analysis: TextAnalysisResult
    title: string
    level: TextLevel
    topics: ID[]
    authorId: ID
    targetLanguage: string
    choices?: Map<string, { sourceWordId?: ID; translationWordId?: ID }>
  },
): Promise<LearningText> {
  const knownTranslationWordIds = await knownTranslationMap(
    input.analysis,
    input.targetLanguage,
    repos,
  )
  const draft = buildDraftLearningText({
    analysis: input.analysis,
    title: input.title,
    level: input.level,
    topics: input.topics,
    authorId: input.authorId,
    targetLanguage: input.targetLanguage,
    knownTranslationWordIds,
    choices: input.choices,
  })
  return repos.texts.create(draft)
}

export async function applyWordGroupTranslation(
  repos: Repositories,
  text: LearningText,
  groupKey: string,
  translationSurface: string,
  targetLanguage: string,
  authorId: ID,
): Promise<LearningText> {
  const groups = collectUniqueWordGroups(text)
  const group = groups.find((g) => g.key === groupKey)
  if (!group) throw new Error('Word group not found')

  let sourceWordId = group.wordId

  if (!sourceWordId) {
    const created: Word = {
      id: `word-${crypto.randomUUID()}`,
      language: text.language,
      word: group.surface,
      translations: {},
      type: 'other',
      rootWords: [],
      grammarConstructions: [],
      createdBy: authorId,
      createdAt: ts(),
      updatedAt: ts(),
    }
    const stored = await repos.words.create(created)
    sourceWordId = stored.id
  }

  const targetWord: Word = {
    id: `word-${crypto.randomUUID()}`,
    language: targetLanguage,
    word: translationSurface.trim(),
    translations: { [text.language]: [sourceWordId] },
    type: 'other',
    rootWords: [],
    grammarConstructions: [],
    createdBy: authorId,
    createdAt: ts(),
    updatedAt: ts(),
  }
  const storedTarget = await repos.words.create(targetWord)

  const sourceWord = await repos.words.getById(sourceWordId)
  if (sourceWord) {
    const links = { ...sourceWord.translations }
    const list = links[targetLanguage] ? [...links[targetLanguage]!] : []
    if (!list.includes(storedTarget.id)) list.push(storedTarget.id)
    links[targetLanguage] = list
    await repos.words.update({ ...sourceWord, translations: links, updatedAt: ts() })
  }

  const updatedSentences = text.sentences.map((sentence) => ({
    ...sentence,
    words: sentence.words.map((occ) => {
      if (!group.occurrenceIds.includes(occ.id)) return occ
      const proposalId = `prop-${occ.id}-${storedTarget.id}`
      const proposal: WordTranslationProposal = {
        id: proposalId,
        translationWordId: storedTarget.id,
        addedBy: authorId,
        addedAt: ts(),
        votes: { up: 0, down: 0 },
      }
      return {
        ...occ,
        wordId: sourceWordId,
        translations: [...occ.translations.filter((p) => p.id !== proposalId), proposal],
        selectedTranslationId: proposalId,
      }
    }),
  }))

  let updated: LearningText = {
    ...text,
    sentences: updatedSentences,
    updatedAt: ts(),
  }
  const ids = collectWordAndConstructionIds(updated)
  updated = {
    ...updated,
    wordIds: ids.wordIds,
    constructionIds: ids.constructionIds,
    translationProgress: computeTranslationProgress(updated),
  }

  return repos.texts.update(updated)
}

export async function publishText(repos: Repositories, textId: ID): Promise<LearningText> {
  const text = await repos.texts.getById(textId)
  if (!text) throw new Error('Text not found')
  if (text.status === 'published') return text

  const progress = computeTranslationProgress(text)
  const ids = collectWordAndConstructionIds(text)

  return repos.texts.update({
    ...text,
    status: 'published',
    wordIds: ids.wordIds,
    constructionIds: ids.constructionIds,
    translationProgress: progress,
    updatedAt: ts(),
  })
}

export { collectUniqueWordGroups, findOccurrence }
