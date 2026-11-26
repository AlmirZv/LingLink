import type { TextAnalysisResult } from '@/types/analysis'
import type {
  ID,
  LearningText,
  TextConstructionOccurrence,
  TextLevel,
  TextRatings,
  TextSentence,
  TextWordOccurrence,
  WordTranslationProposal,
} from '@/types/db'

import { collectWordAndConstructionIds, computeTranslationProgress } from '@/services/textDenormalize'

const ts = () => new Date().toISOString()

function emptyRatings(): TextRatings {
  const empty = { average: 0, count: 0 }
  return {
    usefulness: { ...empty },
    interestingness: { ...empty },
    uniqueness: { ...empty },
    learningValue: { ...empty },
    totalVotes: 0,
  }
}

function analyzedByNormalized(analysis: TextAnalysisResult) {
  return new Map(analysis.words.map((w) => [w.normalized, w]))
}

function constructionsForSentence(
  sentenceId: ID,
  analysis: TextAnalysisResult,
  authorId: ID,
): TextConstructionOccurrence[] {
  return analysis.constructions
    .filter((c) => c.sentenceId === sentenceId && !c.constructionId.startsWith('local-'))
    .map((c) => {
      const proposalId = c.translationWordId ? `cprop-${c.constructionId}-${sentenceId}` : ''
      return {
        startPosition: c.startPosition,
        endPosition: c.endPosition,
        constructionId: c.constructionId,
        text: c.text,
        translations: c.translationWordId
          ? [
              {
                id: proposalId,
                translationId: c.translationWordId,
                addedBy: authorId,
                addedAt: ts(),
                votes: { up: 0, down: 0 },
              },
            ]
          : [],
        ...(proposalId ? { selectedTranslationId: proposalId } : {}),
      }
    })
}

function proposalsFromKnownWord(
  occurrenceId: ID,
  translationWordId: ID,
  authorId: ID,
): WordTranslationProposal[] {
  const proposalId = `prop-${occurrenceId}`
  return [
    {
      id: proposalId,
      translationWordId,
      addedBy: authorId,
      addedAt: ts(),
      votes: { up: 0, down: 0 },
    },
  ]
}

export interface BuildDraftInput {
  analysis: TextAnalysisResult
  title: string
  level: TextLevel
  topics: ID[]
  authorId: ID
  /** Learning language — seed proposals for known words when available */
  targetLanguage: string
  /** Map source wordId → first translation word id in target language */
  knownTranslationWordIds: Map<ID, ID>
  /** Choices made while scanning: token id → source word and chosen translation */
  choices?: Map<string, { sourceWordId?: ID; translationWordId?: ID }>
  /** Keep this id when rebuilding a draft that is already stored. */
  textId?: ID
}

export function buildDraftLearningText(input: BuildDraftInput): LearningText {
  const textId = input.textId ?? `text-${crypto.randomUUID()}`
  const byNorm = analyzedByNormalized(input.analysis)
  const occurrenceCounts = new Map(input.analysis.words.map((w) => [w.normalized, w.occurrenceCount]))

  const sentences: TextSentence[] = input.analysis.sentences.map((sentence) => {
    const words: TextWordOccurrence[] = sentence.tokens
      .filter((t) => t.type === 'word')
      .map((token) => {
        const meta = byNorm.get(token.normalized)
        const occurrenceId = `occ-${textId}-${sentence.id}-${token.position}`
        let translations: WordTranslationProposal[] = []
        let selectedTranslationId: string | undefined

        const choice = input.choices?.get(token.id)
        const sourceWordId = choice?.sourceWordId ?? (meta?.known ? meta.wordId : undefined)
        const transWordId = choice
          ? choice.translationWordId
          : sourceWordId
            ? input.knownTranslationWordIds.get(sourceWordId)
            : undefined
        if (transWordId) {
          translations = proposalsFromKnownWord(occurrenceId, transWordId, input.authorId)
          selectedTranslationId = translations[0]!.id
        }

        return {
          id: occurrenceId,
          sentenceId: sentence.id,
          position: token.position,
          wordId: sourceWordId,
          text: token.text,
          occurrenceCount: meta?.occurrenceCount ?? occurrenceCounts.get(token.normalized) ?? 1,
          translations,
          selectedTranslationId,
        }
      })

    return {
      id: sentence.id,
      position: sentence.position,
      text: sentence.text,
      words,
      constructions: constructionsForSentence(sentence.id, input.analysis, input.authorId),
    }
  })

  const draft: LearningText = {
    id: textId,
    title: input.title.trim(),
    language: input.analysis.language,
    authorId: input.authorId,
    coAuthorIds: [],
    topics: input.topics,
    level: input.level,
    wordIds: [],
    constructionIds: [],
    sentences,
    finalTranslations: {},
    translationProgress: 0,
    uniqueWordCount: input.analysis.statistics.uniqueWordCount,
    sentenceCount: input.analysis.statistics.sentenceCount,
    status: 'draft',
    ratings: emptyRatings(),
    views: 0,
    favoritesCount: 0,
    dislikesCount: 0,
    editCount: 0,
    commentsCount: 0,
    createdAt: ts(),
    updatedAt: ts(),
  }

  const ids = collectWordAndConstructionIds(draft)
  draft.wordIds = ids.wordIds
  draft.constructionIds = ids.constructionIds
  draft.translationProgress = computeTranslationProgress(draft)

  return draft
}
