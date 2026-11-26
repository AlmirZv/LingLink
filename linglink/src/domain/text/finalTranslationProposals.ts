import type { FinalTranslation, FinalTranslationProposal, ID, LearningText } from '@/types/db'

const ts = () => new Date().toISOString()

export function sortFinalProposals(proposals: FinalTranslationProposal[]): FinalTranslationProposal[] {
  return [...proposals].sort((a, b) => {
    const likes = (b.likedBy?.length ?? 0) - (a.likedBy?.length ?? 0)
    if (likes !== 0) return likes
    return String(b.addedAt).localeCompare(String(a.addedAt))
  })
}

export function winningFinalProposal(
  proposals: FinalTranslationProposal[],
): FinalTranslationProposal | undefined {
  return sortFinalProposals(proposals.filter((item) => item.text.trim()))[0]
}

export function proposalsForSentence(
  proposals: FinalTranslationProposal[],
  sentenceId: ID,
): FinalTranslationProposal[] {
  return proposals.filter((item) => item.sentenceId === sentenceId)
}

export function replaceSentenceProposals(
  proposals: FinalTranslationProposal[],
  sentenceId: ID,
  next: FinalTranslationProposal[],
): FinalTranslationProposal[] {
  return [
    ...proposals.filter((item) => item.sentenceId !== sentenceId),
    ...next.map((item) => ({ ...item, sentenceId, likedBy: [...(item.likedBy ?? [])] })),
  ]
}

export function serializeFinalProposal(item: FinalTranslationProposal): FinalTranslationProposal {
  return {
    id: String(item.id),
    text: String(item.text),
    addedBy: String(item.addedBy),
    addedAt: item.addedAt,
    likedBy: [...(item.likedBy ?? [])].map(String),
    ...(item.sentenceId ? { sentenceId: String(item.sentenceId) } : {}),
  }
}

export function seedFinalProposalsFromText(text: LearningText, targetLanguage: string): FinalTranslationProposal[] {
  const fromSentences = text.sentences.flatMap((sentence) =>
    (sentence.finalProposals?.[targetLanguage] ?? []).map((item) =>
      serializeFinalProposal({ ...item, sentenceId: sentence.id }),
    ),
  )
  if (fromSentences.length) return fromSentences
  return seedFinalProposals(text.finalTranslations[targetLanguage], text.sentences)
}

export function seedFinalProposals(
  final: FinalTranslation | undefined,
  sentences: { id: ID }[] = [],
): FinalTranslationProposal[] {
  if (!final) return []
  if (final.proposals?.length) {
    const cloned = final.proposals.map(cloneProposal)
    if (!sentences.length || cloned.every((item) => item.sentenceId)) return cloned
    return cloned.map((item, index) => ({
      ...item,
      sentenceId: item.sentenceId ?? sentences[Math.min(index, sentences.length - 1)]?.id,
    }))
  }
  if (!final.text.trim()) return []
  const lines = final.text.split('\n')
  if (!sentences.length) {
    return [
      {
        id: `ftp-seed-${final.addedBy}`,
        text: final.text,
        addedBy: final.addedBy,
        addedAt: final.addedAt,
        likedBy: [],
      },
    ]
  }
  return sentences.flatMap((sentence, index) => {
    const line = (lines[index] ?? (index === 0 ? final.text : '')).trim()
    if (!line) return []
    return [
      {
        id: `ftp-seed-${sentence.id}`,
        text: line,
        addedBy: final.addedBy,
        addedAt: final.addedAt,
        likedBy: [],
        sentenceId: sentence.id,
      },
    ]
  })
}

export function applyFinalProposals(
  text: LearningText,
  proposals: FinalTranslationProposal[],
  targetLanguage: string,
): LearningText {
  const ordered = [...(text.sentences ?? [])].sort((a, b) => a.position - b.position)
  if (ordered.length === 0) {
    const sorted = sortFinalProposals(proposals.filter((item) => item.text.trim()).map(serializeFinalProposal))
    const winner = sorted[0]
    if (!winner) {
      const next = { ...text.finalTranslations }
      delete next[targetLanguage]
      return { ...text, finalTranslations: next, updatedAt: ts() }
    }
    return writeFinal(text, text.sentences, targetLanguage, winner.text, [{ text: winner.text, sourceOccurrenceIds: [] }], winner, sorted)
  }

  const kept: FinalTranslationProposal[] = []
  const sentenceTexts: string[] = []
  const words: LearningText['finalTranslations'][string]['words'] = []
  let winnerMeta: FinalTranslationProposal | undefined
  const sentences = ordered.map((sentence) => {
    const list = sortFinalProposals(
      proposalsForSentence(proposals, sentence.id)
        .filter((item) => item.text.trim())
        .map((item) => serializeFinalProposal({ ...item, sentenceId: sentence.id })),
    )
    kept.push(...list)
    const byLanguage = { ...(sentence.finalProposals ?? {}) }
    if (list.length) byLanguage[targetLanguage] = list
    else delete byLanguage[targetLanguage]
    const winner = list[0]
    if (winner) {
      if (!winnerMeta) winnerMeta = winner
      sentenceTexts.push(winner.text.trim())
      words.push({
        text: winner.text.trim(),
        sourceOccurrenceIds: sentence.words.map((word) => word.id),
      })
    }
    return {
      ...sentence,
      finalProposals: Object.keys(byLanguage).length ? byLanguage : {},
    }
  })

  if (!winnerMeta || sentenceTexts.length === 0) {
    const next = { ...text.finalTranslations }
    delete next[targetLanguage]
    return { ...text, sentences, finalTranslations: next, updatedAt: ts() }
  }

  return writeFinal(text, sentences, targetLanguage, sentenceTexts.join('\n'), words, winnerMeta, kept)
}

export function upsertOwnFinalProposal(
  proposals: FinalTranslationProposal[],
  userId: ID,
  text: string,
  editingId?: ID | null,
): FinalTranslationProposal[] {
  const body = text.trim()
  if (!body) return proposals
  if (editingId) {
    return proposals.map((item) =>
      item.id === editingId && item.addedBy === userId ? { ...item, text: body } : item,
    )
  }
  const existing = proposals.find((item) => item.addedBy === userId)
  if (existing) {
    return proposals.map((item) => (item.id === existing.id ? { ...item, text: body } : item))
  }
  return [
    ...proposals,
    {
      id: `ftp-${crypto.randomUUID()}`,
      text: body,
      addedBy: userId,
      addedAt: ts(),
      likedBy: [],
    },
  ]
}

export function deleteOwnFinalProposal(
  proposals: FinalTranslationProposal[],
  proposalId: ID,
  userId: ID,
): FinalTranslationProposal[] {
  return proposals.filter((item) => !(item.id === proposalId && item.addedBy === userId))
}

export function likeFinalProposal(
  proposals: FinalTranslationProposal[],
  proposalId: ID,
  userId: ID,
): FinalTranslationProposal[] {
  const target = proposals.find((item) => item.id === proposalId)
  if (!target || target.addedBy === userId) return proposals
  const already = (target.likedBy ?? []).includes(userId)
  return proposals.map((item) => {
    const without = (item.likedBy ?? []).filter((id) => id !== userId)
    if (item.id !== proposalId) return { ...item, likedBy: without }
    return { ...item, likedBy: already ? without : [...without, userId] }
  })
}

function writeFinal(
  text: LearningText,
  sentences: LearningText['sentences'],
  targetLanguage: string,
  body: string,
  words: LearningText['finalTranslations'][string]['words'],
  winner: FinalTranslationProposal,
  proposals: FinalTranslationProposal[],
): LearningText {
  return {
    ...text,
    sentences,
    finalTranslations: {
      ...text.finalTranslations,
      [targetLanguage]: {
        text: body,
        words,
        addedBy: winner.addedBy,
        addedAt: winner.addedAt,
        alternatives: [],
        proposals,
      },
    },
    updatedAt: ts(),
  }
}

function cloneProposal(item: FinalTranslationProposal): FinalTranslationProposal {
  return { ...item, likedBy: [...(item.likedBy ?? [])] }
}
