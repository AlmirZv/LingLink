import { countWordOccurrences, selectedTranslationWordIds, setAppearanceReadable, textIsReadable, upsertAppearance, removeAppearance, sameAppearances } from '@/domain/words/textAppearances'
import type { WordRepository } from '@/services/repositories/contracts'
import type { ID, LearningText } from '@/types/db'

function sameCounts(left: Map<ID, number>, right: Map<ID, number>): boolean {
  if (left.size !== right.size) return false
  for (const [id, count] of left) {
    if (right.get(id) !== count) return false
  }
  return true
}

/**
 * Write this text onto every word that occurs in it.
 * A draft is ignored until it is published.
 * Hiding, showing, or deleting only changes `readable`.
 * An edit recounts occurrences and drops words that left the text.
 */
export async function syncWordsForText(
  words: WordRepository,
  previous: LearningText | null,
  next: LearningText,
): Promise<void> {
  if (next.status === 'draft' && (!previous || previous.status === 'draft')) return

  await syncTranslationUseCounts(words, previous, next)

  const nextCounts = countWordOccurrences(next)
  const prevCounts =
    previous && previous.status !== 'draft' ? countWordOccurrences(previous) : new Map<ID, number>()
  const readable = textIsReadable(next.status)
  const ids = [...new Set<ID>([...nextCounts.keys(), ...prevCounts.keys()])]
  const loaded = await words.listByIds(ids)
  const byId = new Map(loaded.map((word) => [word.id, word]))

  const leavingDraft = !previous || previous.status === 'draft'
  const countsChanged = leavingDraft || !sameCounts(prevCounts, nextCounts)
  const missing = [...nextCounts.keys()].some((id) => {
    const word = byId.get(id)
    return !word || !(word.textAppearances ?? []).some((item) => item.textId === next.id)
  })

  if (!countsChanged && !missing) {
    const wasReadable = previous ? textIsReadable(previous.status) : readable
    if (wasReadable === readable) return
    for (const wordId of nextCounts.keys()) {
      const word = byId.get(wordId)
      if (!word) continue
      const updated = setAppearanceReadable(word, next.id, readable)
      if (updated === word) continue
      await words.update(updated)
    }
    return
  }

  for (const [wordId, count] of nextCounts) {
    const word = byId.get(wordId)
    if (!word) continue
    const updated = upsertAppearance(word, { textId: next.id, count, readable })
    if (sameAppearances(word.textAppearances, updated.textAppearances)) continue
    await words.update(updated)
  }

  for (const wordId of prevCounts.keys()) {
    if (nextCounts.has(wordId)) continue
    const word = byId.get(wordId)
    if (!word) continue
    const updated = removeAppearance(word, next.id)
    if (sameAppearances(word.textAppearances, updated.textAppearances)) continue
    await words.update(updated)
  }
}

/** Keep each translation word's text count in step with published selections. */
async function syncTranslationUseCounts(
  words: WordRepository,
  previous: LearningText | null,
  next: LearningText,
): Promise<void> {
  const before = previous ? selectedTranslationWordIds(previous) : new Set<ID>()
  const after = selectedTranslationWordIds(next)
  const delta = new Map<ID, number>()
  for (const id of after) if (!before.has(id)) delta.set(id, 1)
  for (const id of before) if (!after.has(id)) delta.set(id, -1)
  if (!delta.size) return
  const loaded = await words.listByIds([...delta.keys()])
  for (const word of loaded) {
    const change = delta.get(word.id) ?? 0
    if (!change || typeof word.translationUseCount !== 'number') continue
    const translationUseCount = Math.max(0, word.translationUseCount + change)
    if (translationUseCount === word.translationUseCount) continue
    await words.update({ ...word, translationUseCount, updatedAt: new Date().toISOString() })
  }
}
