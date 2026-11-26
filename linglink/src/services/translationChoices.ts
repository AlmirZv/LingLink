import { textSelectsTranslation } from '@/domain/words/textAppearances'
import { shouldRemoveTranslation, TRANSLATION_BAN_MS, isBanActive } from '@/domain/words/wordEditPolicy'
import type { Repositories } from '@/services/repositories/contracts'
import type { EditBan, ID, LanguageCode, LearningText, TranslationVote, UserNotification, Word } from '@/types/db'

const ts = () => new Date().toISOString()

export interface TranslationChoice {
  id: ID
  label: string
  furigana?: string
  character?: string
  /** A person typed this translation. Dictionary entries are not voted on. */
  human: boolean
  up: number
  down: number
  mine: 1 | -1 | null
  textCount: number
  createdBy?: ID
}

export function translationVoteKey(sourceWordId: ID, translationWordId: ID): ID {
  return `wt:${sourceWordId}:${translationWordId}`
}

export function isHumanTranslation(word: Word): boolean {
  return word.multilingualDictionary !== 'found'
}

function stampMs(value: EditBan['endsAt']): number | undefined {
  if (!value || typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

export async function activeTranslationBan(
  repos: Repositories,
  userId: ID,
  wordId: ID,
): Promise<EditBan | null> {
  const bans = await repos.wordEdits.listBans(userId)
  const now = Date.now()
  return (
    bans.find(
      (ban) =>
        ban.wordId === wordId &&
        (ban.scope === undefined || ban.scope === 'translation') &&
        isBanActive(ban.endsAt ? stampMs(ban.endsAt) : undefined, now),
    ) ?? null
  )
}

export function translationBanLabel(
  ban: EditBan | null,
  translate: (key: string, values?: Record<string, string>) => string,
  locale: string,
): string {
  if (!ban) return ''
  if (!ban.endsAt || typeof ban.endsAt !== 'string') return translate('words.translationBanned')
  const date = new Date(ban.endsAt)
  return translate('words.translationBannedUntil', {
    date: Number.isNaN(date.getTime()) ? ban.endsAt : date.toLocaleString(locale, { dateStyle: 'medium' }),
  })
}

async function useCounts(repos: Repositories, words: Word[]): Promise<Map<ID, number>> {
  const counts = new Map<ID, number>()
  const missing: Word[] = []
  for (const word of words) {
    if (typeof word.translationUseCount === 'number') counts.set(word.id, word.translationUseCount)
    else missing.push(word)
  }
  if (!missing.length) return counts
  const texts = await repos.texts.listPublished()
  for (const word of missing) {
    const count = texts.filter((text) => textSelectsTranslation(text, word.id)).length
    counts.set(word.id, count)
    await repos.words.update({ ...word, translationUseCount: count, updatedAt: ts() })
  }
  return counts
}

export async function loadTranslationChoices(
  repos: Repositories,
  source: Word,
  targetLanguage: LanguageCode,
  userId: ID | undefined,
): Promise<TranslationChoice[]> {
  const ids = source.translations[targetLanguage] ?? []
  if (!ids.length) return []
  const words = await repos.words.listByIds(ids)
  const byId = new Map(words.map((word) => [word.id, word]))
  const counts = await useCounts(repos, words)
  const choices: TranslationChoice[] = []
  for (const id of ids) {
    const word = byId.get(id)
    if (!word) continue
    const human = isHumanTranslation(word)
    const proposalId = translationVoteKey(source.id, word.id)
    const votes = human ? await repos.translationVotes.listForProposal(proposalId) : []
    const mine = userId ? votes.find((vote) => vote.userId === userId)?.value ?? null : null
    choices.push({
      id: word.id,
      label: word.word,
      ...(word.furigana ? { furigana: word.furigana } : {}),
      ...(word.character ? { character: word.character } : {}),
      human,
      ...(word.createdBy ? { createdBy: word.createdBy } : {}),
      up: votes.filter((vote) => vote.value === 1).length,
      down: votes.filter((vote) => vote.value === -1).length,
      mine: mine === 1 || mine === -1 ? mine : null,
      textCount: counts.get(word.id) ?? 0,
    })
  }
  return choices
}

function withoutTranslation(text: LearningText, sourceWordId: ID, translationWordId: ID): LearningText | null {
  let changed = false
  const sentences = text.sentences.map((sentence) => ({
    ...sentence,
    words: sentence.words.map((occurrence) => {
      if (occurrence.wordId !== sourceWordId) return occurrence
      const translations = occurrence.translations.filter((item) => item.translationWordId !== translationWordId)
      if (translations.length === occurrence.translations.length) return occurrence
      changed = true
      const selected = translations.some((item) => item.id === occurrence.selectedTranslationId)
        ? occurrence.selectedTranslationId
        : undefined
      return { ...occurrence, translations, ...(selected ? { selectedTranslationId: selected } : { selectedTranslationId: undefined }) }
    }),
  }))
  return changed ? { ...text, sentences, updatedAt: ts() } : null
}

async function unlinkTranslation(
  repos: Repositories,
  source: Word,
  translation: Word,
  targetLanguage: LanguageCode,
): Promise<void> {
  const list = (source.translations[targetLanguage] ?? []).filter((id) => id !== translation.id)
  const translations = { ...source.translations, [targetLanguage]: list }
  await repos.words.update({ ...source, translations, updatedAt: ts() })
  const texts = await repos.texts.findByWordId(source.id)
  for (const text of texts) {
    const next = withoutTranslation(text, source.id, translation.id)
    if (next) await repos.texts.update(next)
  }
}

/** The author removes their translation so they can add it again. */
export async function deleteOwnTranslation(
  repos: Repositories,
  sourceWordId: ID,
  translationWordId: ID,
  userId: ID,
): Promise<boolean> {
  const source = await repos.words.getById(sourceWordId)
  const translation = await repos.words.getById(translationWordId)
  if (!source || !translation || translation.createdBy !== userId) return false
  const language = Object.entries(source.translations).find(([, ids]) => ids.includes(translation.id))?.[0]
  if (!language) return false
  await unlinkTranslation(repos, source, translation, language)
  return true
}

async function removeTranslation(
  repos: Repositories,
  source: Word,
  translation: Word,
  targetLanguage: LanguageCode,
): Promise<void> {
  await unlinkTranslation(repos, source, translation, targetLanguage)
  if (translation.createdBy) {
    const ban: EditBan = {
      id: `ban-${crypto.randomUUID()}`,
      userId: translation.createdBy,
      editId: translation.id,
      wordId: source.id,
      startedAt: ts(),
      endsAt: new Date(Date.now() + TRANSLATION_BAN_MS).toISOString(),
    }
    await repos.wordEdits.saveBan(ban)
  }
}

async function notifyDislikers(
  repos: Repositories,
  source: Word,
  translation: Word,
  votes: TranslationVote[],
): Promise<void> {
  const userIds = [...new Set(votes.filter((vote) => vote.value === -1).map((vote) => vote.userId))]
  await Promise.all(
    userIds.map(async (userId) => {
      const notice: UserNotification = {
        id: `notice-${crypto.randomUUID()}`,
        userId,
        type: 'translation-removed',
        word: source.word,
        translation: translation.word,
        read: false,
        createdAt: ts(),
      }
      try {
        await repos.notifications.add(notice)
      } catch {
        // Removal already happened. A rejected notice must not undo it.
      }
    }),
  )
}

export async function voteWordTranslation(
  repos: Repositories,
  sourceWordId: ID,
  translationWordId: ID,
  userId: ID,
  value: 1 | -1,
): Promise<{ removed: boolean }> {
  const source = await repos.words.getById(sourceWordId)
  const translation = await repos.words.getById(translationWordId)
  if (!source || !translation || !isHumanTranslation(translation)) return { removed: false }
  await repos.translationVotes.castVote({
    userId,
    proposalId: translationVoteKey(sourceWordId, translationWordId),
    type: 'word',
    value,
  })
  const votes = await repos.translationVotes.listForProposal(translationVoteKey(sourceWordId, translationWordId))
  const up = votes.filter((vote) => vote.value === 1).length
  const down = votes.filter((vote) => vote.value === -1).length
  const counts = await useCounts(repos, [translation])
  const textCount = counts.get(translation.id) ?? 0
  if (!shouldRemoveTranslation({ up, down, textCount })) return { removed: false }
  const language = Object.entries(source.translations).find(([, ids]) => ids.includes(translation.id))?.[0]
  if (!language) return { removed: false }
  await removeTranslation(repos, source, translation, language)
  await notifyDislikers(repos, source, translation, votes)
  return { removed: true }
}
