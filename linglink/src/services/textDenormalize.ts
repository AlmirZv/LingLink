import { foldSurface } from '@/constants/languages'
import {
  proposalsForSentence,
  seedFinalProposalsFromText,
  winningFinalProposal,
} from '@/domain/text/finalTranslationProposals'
import { tokenizeSentence } from '@/domain/text/tokenizer'
import type { ID, LearningText, TextWordOccurrence } from '@/types/db'

/**
 * Recompute denormalized search fields on LearningText after publish / translation updates.
 * Full implementation in phase 8–9; kept pure for unit tests later.
 */
export function collectWordAndConstructionIds(text: LearningText): {
  wordIds: ID[]
  constructionIds: ID[]
} {
  const wordIds = new Set<ID>()
  const constructionIds = new Set<ID>(text.constructionIds)

  for (const sentence of text.sentences) {
    for (const w of sentence.words) {
      if (w.wordId) wordIds.add(w.wordId)
    }
    for (const c of sentence.constructions) {
      constructionIds.add(c.constructionId)
    }
  }

  return {
    wordIds: [...wordIds],
    constructionIds: [...constructionIds],
  }
}

/** 100% only when every word and every sentence final translation is present. */
export function weightedTranslationProgress(wordRatio: number, finalSentenceRatio: number): number {
  const words = Math.min(1, Math.max(0, wordRatio))
  const finals = Math.min(1, Math.max(0, finalSentenceRatio))
  return words * 0.9 + finals * 0.1
}

function takeMatchingOccurrence(
  pending: TextWordOccurrence[],
  normalized: string,
  language: LearningText['language'],
): TextWordOccurrence | undefined {
  const index = pending.findIndex((occurrence) => foldSurface(occurrence.text, language) === normalized)
  if (index === -1) return undefined
  return pending.splice(index, 1)[0]
}

export function computeTranslationProgress(text: LearningText): number {
  let wordTotal = 0
  let wordDone = 0
  for (const sentence of text.sentences) {
    const pending = [...sentence.words]
    const tokens = tokenizeSentence(
      { id: sentence.id, position: sentence.position, text: sentence.text },
      text.language,
    )
    for (const token of tokens) {
      if (token.type !== 'word') continue
      wordTotal += 1
      const occurrence = takeMatchingOccurrence(pending, token.normalized, text.language)
      if (!occurrence) continue
      const coveredByConstruction = sentence.constructions.some(
        (construction) =>
          Boolean(construction.constructionId) &&
          !construction.constructionId.startsWith('local-') &&
          occurrence.position >= construction.startPosition &&
          occurrence.position <= construction.endPosition,
      )
      if (occurrence.selectedTranslationId || coveredByConstruction) wordDone += 1
    }
  }
  const wordRatio = wordTotal === 0 ? 1 : wordDone / wordTotal

  const sentenceCount = text.sentences.length
  const languages = new Set([
    ...text.sentences.flatMap((sentence) => Object.keys(sentence.finalProposals ?? {})),
    ...Object.keys(text.finalTranslations ?? {}),
  ])
  const finalsByLanguage = [...languages].map((language) => seedFinalProposalsFromText(text, language))
  let covered = 0
  for (const sentence of text.sentences) {
    const hasFinal = finalsByLanguage.some((proposals) =>
      Boolean(winningFinalProposal(proposalsForSentence(proposals, sentence.id))?.text.trim()),
    )
    if (hasFinal) covered += 1
  }
  const finalRatio = sentenceCount === 0 ? 1 : covered / sentenceCount

  return weightedTranslationProgress(wordRatio, finalRatio)
}
