import { buildUserTextProgressUpdate } from '@/domain/learning/computeProgress'
import type { Repositories } from '@/services/repositories/contracts'
import type { ID } from '@/types/db'

/** Reset mastery (N/5), global level, and learned flags in texts for this word. */
export async function forgetWordMastery(
  repos: Repositories,
  userId: ID,
  wordId: ID,
): Promise<void> {
  await repos.wordTextHistory.clearForWord(userId, wordId)
  await repos.progress.setWordLevel(userId, wordId, 0)

  const textProgressRows = await repos.progress.listTextProgress(userId)
  for (const row of textProgressRows) {
    if (!row.learnedWordIds.includes(wordId)) continue
    const text = await repos.texts.getById(row.textId)
    if (!text) continue
    const learnedWordIds = row.learnedWordIds.filter((id) => id !== wordId)
    await repos.progress.upsertTextProgress(
      buildUserTextProgressUpdate(text, row, { learnedWordIds }),
    )
  }
}
