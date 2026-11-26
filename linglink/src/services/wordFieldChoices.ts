import { shouldRemoveTranslation, TRANSLATION_BAN_MS, isBanActive } from '@/domain/words/wordEditPolicy'
import type { Repositories } from '@/services/repositories/contracts'
import type { TranslationChoice } from '@/services/translationChoices'
import type { EditBan, ID, Word, WordReadingVariant } from '@/types/db'

const ts = () => new Date().toISOString()

export type ReadingField = 'character' | 'furigana'
export type LinkField = 'root' | 'construction'
export type FieldBanScope = NonNullable<EditBan['scope']>

const READING_KEY = {
  character: 'characterVariants',
  furigana: 'furiganaVariants',
} as const

export function fieldVoteKey(scope: FieldBanScope, wordId: ID, itemId: ID): ID {
  const prefix = { translation: 'wt', character: 'rc', furigana: 'rf', root: 'rr', construction: 'rg' }[scope]
  return `${prefix}:${wordId}:${itemId}`
}

export function readableTextCount(word: Word): number {
  return (word.textAppearances ?? []).filter((item) => item.readable).length
}

function stampMs(value: EditBan['endsAt']): number | undefined {
  if (!value || typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

export async function activeFieldBan(
  repos: Repositories,
  userId: ID,
  wordId: ID,
  scope: FieldBanScope,
): Promise<EditBan | null> {
  const bans = await repos.wordEdits.listBans(userId)
  const now = Date.now()
  return (
    bans.find((ban) => {
      if (ban.wordId !== wordId) return false
      const banScope = ban.scope ?? 'translation'
      return banScope === scope && isBanActive(ban.endsAt ? stampMs(ban.endsAt) : undefined, now)
    }) ?? null
  )
}

async function choiceVotes(
  repos: Repositories,
  proposalId: ID,
  userId: ID | undefined,
): Promise<Pick<TranslationChoice, 'up' | 'down' | 'mine'>> {
  const votes = await repos.translationVotes.listForProposal(proposalId)
  const mine = userId ? (votes.find((vote) => vote.userId === userId)?.value ?? null) : null
  return {
    up: votes.filter((vote) => vote.value === 1).length,
    down: votes.filter((vote) => vote.value === -1).length,
    mine: mine === 1 || mine === -1 ? mine : null,
  }
}

function seedVariant(word: Word, field: ReadingField, text: string): WordReadingVariant {
  return {
    id: `${field}-${word.id}`,
    text,
    ...(word.createdBy ? { createdBy: word.createdBy } : {}),
    ...(word.multilingualDictionary === 'found' ? { dictionary: true } : {}),
  }
}

/** Store the current spelling as the first list item when the list key is still missing. */
export async function ensureReadingVariants(repos: Repositories, word: Word, field: ReadingField): Promise<Word> {
  const key = READING_KEY[field]
  if (word[key]) return word
  const text = word[field]?.trim()
  const next: Word = { ...word, [key]: text ? [seedVariant(word, field, text)] : [], updatedAt: ts() }
  if (!text && word.multilingualDictionary !== 'found') return next
  return repos.words.update(next)
}

export async function loadReadingChoices(
  repos: Repositories,
  word: Word,
  field: ReadingField,
  userId: ID | undefined,
): Promise<{ word: Word; choices: TranslationChoice[] }> {
  const stored = await ensureReadingVariants(repos, word, field)
  const variants = stored[READING_KEY[field]] ?? []
  const active = stored[field]
  const choices: TranslationChoice[] = []
  for (const variant of variants) {
    const human = !variant.dictionary
    const votes = human ? await choiceVotes(repos, fieldVoteKey(field, stored.id, variant.id), userId) : { up: 0, down: 0, mine: null }
    choices.push({
      id: variant.id,
      label: variant.text,
      human,
      ...votes,
      textCount: variant.text === active ? readableTextCount(stored) : 0,
    })
  }
  return { word: stored, choices }
}

export async function loadLinkChoices(
  repos: Repositories,
  word: Word,
  field: LinkField,
  items: { id: ID; label: string }[],
  userId: ID | undefined,
): Promise<TranslationChoice[]> {
  const textCount = readableTextCount(word)
  const choices: TranslationChoice[] = []
  for (const item of items) {
    const votes = await choiceVotes(repos, fieldVoteKey(field, word.id, item.id), userId)
    choices.push({
      id: item.id,
      label: item.label,
      human: true,
      ...votes,
      textCount,
    })
  }
  return choices
}

async function saveFieldBan(repos: Repositories, userId: ID, wordId: ID, scope: FieldBanScope, editId: ID): Promise<void> {
  const ban: EditBan = {
    id: `ban-${crypto.randomUUID()}`,
    userId,
    editId,
    wordId,
    scope,
    startedAt: ts(),
    endsAt: new Date(Date.now() + TRANSLATION_BAN_MS).toISOString(),
  }
  await repos.wordEdits.saveBan(ban)
}

export async function voteReading(
  repos: Repositories,
  wordId: ID,
  field: ReadingField,
  variantId: ID,
  userId: ID,
  value: 1 | -1,
): Promise<{ removed: boolean }> {
  const word = await repos.words.getById(wordId)
  if (!word) return { removed: false }
  const key = READING_KEY[field]
  const variants = word[key] ?? []
  const variant = variants.find((item) => item.id === variantId)
  if (!variant || variant.dictionary) return { removed: false }
  await repos.translationVotes.castVote({
    userId,
    proposalId: fieldVoteKey(field, wordId, variantId),
    type: 'word',
    value,
  })
  const votes = await repos.translationVotes.listForProposal(fieldVoteKey(field, wordId, variantId))
  const up = votes.filter((vote) => vote.value === 1).length
  const down = votes.filter((vote) => vote.value === -1).length
  const textCount = variant.text === word[field] ? readableTextCount(word) : 0
  if (!shouldRemoveTranslation({ up, down, textCount })) return { removed: false }
  const nextVariants = variants.filter((item) => item.id !== variantId)
  const next: Word = { ...word, [key]: nextVariants, updatedAt: ts() }
  if (word[field] === variant.text) {
    const replacement = nextVariants.find((item) => item.text !== variant.text)?.text
    if (replacement) next[field] = replacement
    else delete next[field]
  }
  await repos.words.update(next)
  if (variant.createdBy) await saveFieldBan(repos, variant.createdBy, wordId, field, variant.id)
  return { removed: true }
}

export async function voteLink(
  repos: Repositories,
  wordId: ID,
  field: LinkField,
  itemId: ID,
  userId: ID,
  value: 1 | -1,
): Promise<{ removed: boolean }> {
  const word = await repos.words.getById(wordId)
  if (!word) return { removed: false }
  const key = field === 'root' ? 'rootWords' : 'grammarConstructions'
  if (!word[key].includes(itemId)) return { removed: false }
  await repos.translationVotes.castVote({
    userId,
    proposalId: fieldVoteKey(field, wordId, itemId),
    type: 'word',
    value,
  })
  const votes = await repos.translationVotes.listForProposal(fieldVoteKey(field, wordId, itemId))
  const up = votes.filter((vote) => vote.value === 1).length
  const down = votes.filter((vote) => vote.value === -1).length
  if (!shouldRemoveTranslation({ up, down, textCount: readableTextCount(word) })) return { removed: false }
  await repos.words.update({ ...word, [key]: word[key].filter((id) => id !== itemId), updatedAt: ts() })
  return { removed: true }
}

export function addReadingVariant(word: Word, field: ReadingField, text: string, userId: ID): Word | 'duplicate' {
  const value = text.trim()
  if (!value) return word
  const key = READING_KEY[field]
  const variants = word[key] ?? []
  if (variants.some((item) => item.text === value) || word[field] === value) return 'duplicate'
  const variant: WordReadingVariant = {
    id: `${field}-${crypto.randomUUID()}`,
    text: value,
    createdBy: userId,
  }
  const next: Word = { ...word, [key]: [...variants, variant], updatedAt: ts() }
  if (!next[field]) next[field] = value
  return next
}
