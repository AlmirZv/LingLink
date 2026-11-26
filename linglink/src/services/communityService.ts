import { aggregateProposalVotes } from '@/domain/community/aggregateVotes'
import { aggregateTextRatings } from '@/domain/community/aggregateTextRatings'
import { collectUniqueWordGroups } from '@/domain/translation/wordGroups'
import { computeTranslationProgress } from '@/services/textDenormalize'
import type { Repositories } from '@/services/repositories/contracts'
import { findOccurrence } from '@/domain/translation/wordGroups'
import { applyFinalProposals } from '@/domain/text/finalTranslationProposals'
import type {
  FinalTranslation,
  FinalTranslationProposal,
  FinalTranslationWord,
  ID,
  LearningText,
  TextWordOccurrence,
  Word,
  WordTranslationProposal,
} from '@/types/db'

const ts = () => new Date().toISOString()

function allProposals(text: LearningText): WordTranslationProposal[] {
  const map = new Map<ID, WordTranslationProposal>()
  for (const s of text.sentences) {
    for (const occ of s.words) {
      for (const p of occ.translations) map.set(p.id, p)
    }
  }
  return [...map.values()]
}

async function syncProposalVoteCounts(repos: Repositories, text: LearningText): Promise<LearningText> {
  const proposals = allProposals(text)
  let changed = false
  const updatedSentences = text.sentences.map((sentence) => ({
    ...sentence,
    words: sentence.words.map((occ) => ({
      ...occ,
      translations: occ.translations.map((p) => ({ ...p })),
    })),
  }))

  for (const proposal of proposals) {
    const votes = await repos.translationVotes.listForProposal(proposal.id)
    const aggregated = aggregateProposalVotes(votes)
    for (const sentence of updatedSentences) {
      for (const occ of sentence.words) {
        for (const p of occ.translations) {
          if (p.id === proposal.id && (p.votes.up !== aggregated.up || p.votes.down !== aggregated.down)) {
            p.votes = aggregated
            changed = true
          }
        }
      }
    }
  }

  if (!changed) return text
  return repos.texts.update({
    ...text,
    sentences: updatedSentences,
    translationProgress: computeTranslationProgress({ ...text, sentences: updatedSentences }),
    updatedAt: ts(),
  })
}

export async function addWordProposal(
  repos: Repositories,
  textId: ID,
  groupKey: string,
  translationWordId: ID,
  authorId: ID,
  reason?: string,
): Promise<LearningText> {
  void reason
  let text = await repos.texts.getById(textId)
  if (!text) throw new Error('Text not found')

  const group = collectUniqueWordGroups(text).find((g) => g.key === groupKey)
  if (!group) throw new Error('Word group not found')

  const proposalId = `prop-alt-${crypto.randomUUID()}`
  const proposal: WordTranslationProposal = {
    id: proposalId,
    translationWordId,
    addedBy: authorId,
    addedAt: ts(),
    votes: { up: 0, down: 0 },
  }

  const sentences = text.sentences.map((sentence) => ({
    ...sentence,
    words: sentence.words.map((occ) => {
      if (!group.occurrenceIds.includes(occ.id)) return occ
      return {
        ...occ,
        translations: [...occ.translations, proposal],
      }
    }),
  }))

  text = await repos.texts.update({
    ...text,
    sentences,
    translationProgress: computeTranslationProgress({ ...text, sentences }),
    updatedAt: ts(),
  })

  return syncProposalVoteCounts(repos, text)
}

export async function selectWordProposal(
  repos: Repositories,
  textId: ID,
  groupKey: string,
  proposalId: ID,
): Promise<LearningText> {
  const text = await repos.texts.getById(textId)
  if (!text) throw new Error('Text not found')
  const group = collectUniqueWordGroups(text).find((g) => g.key === groupKey)
  if (!group) throw new Error('Word group not found')

  const sentences = text.sentences.map((sentence) => ({
    ...sentence,
    words: sentence.words.map((occ) => {
      if (!group.occurrenceIds.includes(occ.id)) return occ
      if (!occ.translations.some((p) => p.id === proposalId)) return occ
      return { ...occ, selectedTranslationId: proposalId }
    }),
  }))

  return repos.texts.update({
    ...text,
    sentences,
    translationProgress: computeTranslationProgress({ ...text, sentences }),
    updatedAt: ts(),
  })
}

export async function voteOnProposal(
  repos: Repositories,
  textId: ID,
  proposalId: ID,
  userId: ID,
  value: 1 | -1,
): Promise<LearningText> {
  await repos.translationVotes.castVote({
    userId,
    proposalId,
    type: 'word',
    value,
  })
  const text = await repos.texts.getById(textId)
  if (!text) throw new Error('Text not found')
  return syncProposalVoteCounts(repos, text)
}

export async function submitTextRating(
  repos: Repositories,
  textId: ID,
  userId: ID,
  scores: { usefulness: number; interestingness: number },
): Promise<LearningText> {
  await repos.textRatings.upsert({
    textId,
    userId,
    usefulness: scores.usefulness,
    interestingness: scores.interestingness,
  })

  const text = await repos.texts.getById(textId)
  if (!text) throw new Error('Text not found')

  const all = await repos.textRatings.listForText(textId)
  return repos.texts.update({
    ...text,
    ratings: aggregateTextRatings(all),
    updatedAt: ts(),
  })
}

export function wordsNeedingTranslation(text: LearningText): ReturnType<typeof collectUniqueWordGroups> {
  return collectUniqueWordGroups(text).filter((g) => {
    const occ = findFirstOccurrence(text, g.occurrenceIds[0]!)
    return !occ?.selectedTranslationId
  })
}

function findFirstOccurrence(text: LearningText, occurrenceId: ID): TextWordOccurrence | null {
  return findOccurrence(text, occurrenceId)
}

export function collectGroupProposals(text: LearningText, groupKey: string): WordTranslationProposal[] {
  const group = collectUniqueWordGroups(text).find((g) => g.key === groupKey)
  if (!group) return []
  const map = new Map<ID, WordTranslationProposal>()
  for (const occId of group.occurrenceIds) {
    const occ = findFirstOccurrence(text, occId)
    if (!occ) continue
    for (const p of occ.translations) map.set(p.id, p)
  }
  return [...map.values()]
}

/** MVP: map natural sentence to occurrence ids in order; extras get empty sourceOccurrenceIds */
export function buildFinalTranslationDraft(
  naturalText: string,
  text: LearningText,
  authorId: ID,
): FinalTranslation {
  const parts = naturalText.trim().split(/\s+/).filter(Boolean)
  const occurrences = text.sentences.flatMap((s) => s.words)
  const words: FinalTranslationWord[] = parts.map((part, index) => {
    const occ = occurrences[index]
    return {
      wordId: occ?.wordId,
      text: part,
      sourceOccurrenceIds: occ ? [occ.id] : [],
    }
  })

  return {
    text: naturalText.trim(),
    words,
    addedBy: authorId,
    addedAt: ts(),
    alternatives: [],
  }
}

async function ensureSourceWordId(
  repos: Repositories,
  text: LearningText,
  groupKey: string,
  authorId: ID,
): Promise<ID> {
  const group = collectUniqueWordGroups(text).find((g) => g.key === groupKey)
  if (!group) throw new Error('Word group not found')
  if (group.wordId) return group.wordId

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

  const sentences = text.sentences.map((sentence) => ({
    ...sentence,
    words: sentence.words.map((occ) =>
      group.occurrenceIds.includes(occ.id) ? { ...occ, wordId: stored.id } : occ,
    ),
  }))
  await repos.texts.update({
    ...text,
    sentences,
    updatedAt: ts(),
  })
  return stored.id
}

export async function suggestWordTranslation(
  repos: Repositories,
  textId: ID,
  groupKey: string,
  translationSurface: string,
  targetLanguage: string,
  authorId: ID,
  reason?: string,
): Promise<LearningText> {
  let text = await repos.texts.getById(textId)
  if (!text) throw new Error('Text not found')

  const sourceWordId = await ensureSourceWordId(repos, text, groupKey, authorId)
  text = (await repos.texts.getById(textId))!

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

  return addWordProposal(repos, textId, groupKey, storedTarget.id, authorId, reason)
}

export async function submitReport(
  repos: Repositories,
  input: Parameters<Repositories['reports']['create']>[0],
): Promise<void> {
  await repos.reports.create(input)
}

export async function saveFinalTranslation(
  repos: Repositories,
  textId: ID,
  targetLanguage: string,
  naturalText: string,
  authorId: ID,
): Promise<LearningText> {
  const text = await repos.texts.getById(textId)
  if (!text) throw new Error('Text not found')
  const finalTranslation = buildFinalTranslationDraft(naturalText, text, authorId)
  const next = {
    ...text,
    finalTranslations: {
      ...text.finalTranslations,
      [targetLanguage]: finalTranslation,
    },
    updatedAt: ts(),
  }
  return repos.texts.update({
    ...next,
    translationProgress: computeTranslationProgress(next),
  })
}

export async function persistFinalProposals(
  repos: Repositories,
  textId: ID,
  targetLanguage: string,
  proposals: FinalTranslationProposal[],
): Promise<LearningText> {
  const text = await repos.texts.getById(textId)
  if (!text) throw new Error('Text not found')
  const next = applyFinalProposals(text, proposals, targetLanguage)
  return repos.texts.update({
    ...next,
    translationProgress: computeTranslationProgress(next),
  })
}
