import type { LearningText } from '@/types/db'

/** Community corrections: proposals and final lines that are not the author's. */
export function countCommunityEdits(text: LearningText): number {
  const proposalIds = new Set<string>()
  for (const sentence of text.sentences) {
    for (const word of sentence.words) {
      for (const proposal of word.translations) {
        if (proposal.addedBy !== text.authorId) proposalIds.add(proposal.id)
      }
    }
    for (const construction of sentence.constructions) {
      for (const proposal of construction.translations) {
        if (proposal.addedBy !== text.authorId) proposalIds.add(proposal.id)
      }
    }
  }

  let finals = 0
  const counted = new Set<string>()
  for (const sentence of text.sentences) {
    for (const list of Object.values(sentence.finalProposals ?? {})) {
      for (const proposal of list) {
        if (proposal.addedBy === text.authorId || counted.has(proposal.id)) continue
        counted.add(proposal.id)
        finals += 1
      }
    }
  }
  for (const translation of Object.values(text.finalTranslations)) {
    const proposals = translation.proposals?.length
      ? translation.proposals
      : [
          { addedBy: translation.addedBy, id: `legacy-${translation.addedBy}` },
          ...translation.alternatives,
        ]
    for (const proposal of proposals) {
      const id = 'id' in proposal && proposal.id ? String(proposal.id) : `legacy-${proposal.addedBy}`
      if (proposal.addedBy === text.authorId || counted.has(id)) continue
      counted.add(id)
      finals += 1
    }
  }
  return proposalIds.size + finals
}

/** Stored supplement counter, never below the proposals already saved in that text. */
export function textEditCount(text: LearningText): number {
  const stored = typeof text.editCount === 'number' ? text.editCount : 0
  return Math.max(stored, countCommunityEdits(text))
}
