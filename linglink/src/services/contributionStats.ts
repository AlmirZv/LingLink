import type { Repositories } from '@/services/repositories/contracts'
import { translationVoteKey } from '@/services/translationChoices'
import type { ID } from '@/types/db'

export interface ContributionStats {
  textCount: number
  textLikes: number
  textDislikes: number
  translationCount: number
  translationLikes: number
  translationDislikes: number
  removedTranslations: number
}

export async function loadContributionStats(repos: Repositories, userId: ID): Promise<ContributionStats> {
  const [texts, words, notices] = await Promise.all([
    repos.texts.listByAuthor(userId),
    repos.words.listAll(),
    repos.notifications.list(userId),
  ])
  const sourcesByTranslation = new Map<ID, ID[]>()
  for (const word of words) {
    for (const ids of Object.values(word.translations)) {
      for (const id of ids ?? []) {
        const sources = sourcesByTranslation.get(id)
        if (sources) sources.push(word.id)
        else sourcesByTranslation.set(id, [word.id])
      }
    }
  }
  const added = words.filter((word) => word.createdBy === userId && sourcesByTranslation.has(word.id))
  const votes = await Promise.all(
    added.flatMap((translation) =>
      (sourcesByTranslation.get(translation.id) ?? []).map((sourceId) =>
        repos.translationVotes.listForProposal(translationVoteKey(sourceId, translation.id)),
      ),
    ),
  )
  let translationLikes = 0
  let translationDislikes = 0
  for (const list of votes) {
    for (const vote of list) {
      if (vote.value === 1) translationLikes += 1
      else if (vote.value === -1) translationDislikes += 1
    }
  }
  return {
    textCount: texts.length,
    textLikes: texts.reduce((sum, text) => sum + (text.favoritesCount ?? 0), 0),
    textDislikes: texts.reduce((sum, text) => sum + (text.dislikesCount ?? 0), 0),
    translationCount: added.length,
    translationLikes,
    translationDislikes,
    removedTranslations: notices.filter((notice) => notice.type === 'translation-removed').length,
  }
}
