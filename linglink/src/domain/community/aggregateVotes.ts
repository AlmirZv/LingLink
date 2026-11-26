import type { TranslationVote, TranslationVotes } from '@/types/db'

export function aggregateProposalVotes(votes: TranslationVote[]): TranslationVotes {
  let up = 0
  let down = 0
  for (const v of votes) {
    if (v.value === 1) up += 1
    else down += 1
  }
  return { up, down }
}
