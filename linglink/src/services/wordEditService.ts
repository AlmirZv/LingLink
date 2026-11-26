import { usesCharacterScript } from '@/domain/words/characterReading'
import { wordSurfaceKey } from '@/domain/words/mergeDuplicateWords'
import {
  banEndsAt,
  editVerdict,
  isBanActive,
  qualifiesAsModerator,
} from '@/domain/words/wordEditPolicy'
import type { Repositories } from '@/services/repositories/contracts'
import type {
  EditBan,
  GrammarConstruction,
  ID,
  LanguageCode,
  TextRating,
  Word,
  WordEdit,
  WordEditSnapshot,
  WordEditSummaryLine,
  WordType,
} from '@/types/db'

const ts = () => new Date().toISOString()

export type EditFailure = 'banned' | 'empty' | 'own-vote' | 'not-moderator' | 'missing'

export interface EditorItem {
  id: ID
  label: string
  locked: boolean
}

export interface EditorEdit {
  edit: WordEdit
  up: number
  down: number
  mine: 1 | -1 | null
  authorName: string
}

export interface EditorState {
  word: Word
  targetLanguage: LanguageCode
  headwordLocked: boolean
  translations: EditorItem[]
  roots: EditorItem[]
  constructions: EditorItem[]
  edits: EditorEdit[]
  ban: EditBan | null
  moderator: boolean
}

function stampMs(value: EditBan['startedAt']): number {
  return typeof value === 'string' ? Date.parse(value) : Number.NaN
}

export async function activeEditBan(repos: Repositories, userId: ID): Promise<EditBan | null> {
  const bans = await repos.wordEdits.listBans(userId)
  const now = Date.now()
  return (
    bans.find(
      (ban) => !ban.wordId && isBanActive(ban.endsAt ? stampMs(ban.endsAt) : undefined, now),
    ) ?? null
  )
}

function ratingScores(rating: TextRating): number[] {
  return [rating.usefulness, rating.interestingness, rating.uniqueness, rating.learningValue].filter(
    (score): score is number => typeof score === 'number',
  )
}

export async function userIsModerator(repos: Repositories, userId: ID): Promise<boolean> {
  const [texts, wordRows, authored] = await Promise.all([
    repos.progress.listTextProgress(userId),
    repos.progress.listWordProgress(userId),
    repos.texts.listByAuthor(userId),
  ])
  const ratings = (await Promise.all(authored.map((text) => repos.textRatings.listForText(text.id)))).flat()
  const scores = ratings
    .filter((rating) => rating.userId !== userId)
    .flatMap(ratingScores)
  const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0
  return qualifiesAsModerator({
    finishedTexts: texts.filter((row) => row.progress >= 1).length,
    knownWords: wordRows.filter((row) => row.level >= 1).length,
    ratingCount: scores.length,
    ratingAverage: average,
  })
}

async function dictionaryIds(repos: Repositories, ids: ID[]): Promise<Set<ID>> {
  const words = await repos.words.listByIds(ids)
  return new Set(words.filter((word) => word.multilingualDictionary === 'found').map((word) => word.id))
}

function blankSnapshot(word: Word, targetLanguage: LanguageCode): WordEditSnapshot {
  return {
    word: word.word,
    character: word.character ?? '',
    furigana: word.furigana ?? '',
    type: word.type,
    targetLanguage,
    translationIds: [...(word.translations[targetLanguage] ?? [])],
    addedTranslationLabels: [],
    rootWordIds: [...word.rootWords],
    addedRootLabels: [],
    grammarConstructionIds: [...word.grammarConstructions],
    addedConstructionLabels: [],
  }
}

function cleanLabels(labels: string[]): string[] {
  const out: string[] = []
  for (const label of labels) {
    const text = label.trim()
    if (text && !out.includes(text)) out.push(text)
  }
  return out
}

function sameIds(left: ID[], right: ID[]): boolean {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((id, index) => id === sortedRight[index])
}

function summaryFor(before: WordEditSnapshot, after: WordEditSnapshot, labels: Map<ID, string>): WordEditSummaryLine[] {
  const lines: WordEditSummaryLine[] = []
  if (before.word !== after.word) lines.push({ field: 'word', before: before.word, after: after.word })
  if (before.character !== after.character) {
    lines.push({ field: 'character', before: before.character, after: after.character })
  }
  if (before.furigana !== after.furigana) {
    lines.push({ field: 'furigana', before: before.furigana, after: after.furigana })
  }
  if (before.type !== after.type) lines.push({ field: 'type', before: before.type, after: after.type })
  const beforeTranslations = before.translationIds.map((id) => labels.get(id) ?? id).join(', ')
  const afterTranslations = [
    ...after.translationIds.map((id) => labels.get(id) ?? id),
    ...after.addedTranslationLabels,
  ].join(', ')
  if (beforeTranslations !== afterTranslations) {
    lines.push({ field: 'translations', before: beforeTranslations, after: afterTranslations })
  }
  const beforeRoots = before.rootWordIds.map((id) => labels.get(id) ?? id).join(', ')
  const afterRoots = [...after.rootWordIds.map((id) => labels.get(id) ?? id), ...after.addedRootLabels].join(', ')
  if (beforeRoots !== afterRoots) lines.push({ field: 'rootWords', before: beforeRoots, after: afterRoots })
  const beforeConstructions = before.grammarConstructionIds.map((id) => labels.get(id) ?? id).join(', ')
  const afterConstructions = [
    ...after.grammarConstructionIds.map((id) => labels.get(id) ?? id),
    ...after.addedConstructionLabels,
  ].join(', ')
  if (beforeConstructions !== afterConstructions) {
    lines.push({ field: 'grammarConstructions', before: beforeConstructions, after: afterConstructions })
  }
  return lines
}

async function findSurface(repos: Repositories, language: LanguageCode, surface: string): Promise<Word | null> {
  const needle = wordSurfaceKey({ language, word: surface })
  const matches = await repos.words.findByWordSubstring(surface, language)
  return matches.find((word) => wordSurfaceKey(word) === needle) ?? null
}

async function ensureWord(
  repos: Repositories,
  language: LanguageCode,
  surface: string,
  authorId: ID,
  type: WordType,
): Promise<Word> {
  const existing = await findSurface(repos, language, surface)
  if (existing) return existing
  return repos.words.create({
    id: `word-${crypto.randomUUID()}`,
    language,
    word: surface.trim(),
    translations: {},
    type,
    rootWords: [],
    grammarConstructions: [],
    createdBy: authorId,
    createdAt: ts(),
    updatedAt: ts(),
  })
}

async function ensureConstruction(
  repos: Repositories,
  language: LanguageCode,
  label: string,
  wordId: ID,
  authorId: ID,
): Promise<GrammarConstruction> {
  const matches = await repos.constructions.findBySubstring(label, language)
  const existing = matches.find((item) => item.construction === label || item.forms.includes(label))
  if (existing) return existing
  return repos.constructions.create({
    id: `gc-${crypto.randomUUID()}`,
    language,
    construction: label,
    forms: [label],
    translations: {},
    type: 'other',
    relatedWords: [wordId],
    createdBy: authorId,
    createdAt: ts(),
    updatedAt: ts(),
  })
}

function unique(ids: ID[]): ID[] {
  const out: ID[] = []
  for (const id of ids) {
    if (!out.includes(id)) out.push(id)
  }
  return out
}

async function applySnapshot(
  repos: Repositories,
  word: Word,
  snapshot: WordEditSnapshot,
  authorId: ID,
): Promise<Word> {
  const next: Word = { ...word, translations: { ...word.translations }, type: snapshot.type }
  if (word.multilingualDictionary !== 'found') {
    const written = snapshot.word.trim()
    if (written) next.word = written
  }
  if (usesCharacterScript(word.language)) {
    const character = snapshot.character.trim()
    const furigana = snapshot.furigana.trim()
    if (character) next.character = character
    else delete next.character
    if (furigana) next.furigana = furigana
    else delete next.furigana
  }
  const locked = await dictionaryIds(repos, word.translations[snapshot.targetLanguage] ?? [])
  const translationIds = unique([
    ...locked,
    ...snapshot.translationIds.filter((id) => !locked.has(id)),
  ])
  for (const label of cleanLabels(snapshot.addedTranslationLabels)) {
    const created = await ensureWord(repos, snapshot.targetLanguage, label, authorId, 'other')
    if (!translationIds.includes(created.id)) translationIds.push(created.id)
  }
  next.translations[snapshot.targetLanguage] = translationIds

  const rootIds = [...snapshot.rootWordIds]
  for (const label of cleanLabels(snapshot.addedRootLabels)) {
    const created = await ensureWord(repos, word.language, label, authorId, word.type)
    if (created.id !== word.id && !rootIds.includes(created.id)) rootIds.push(created.id)
  }
  next.rootWords = rootIds

  const constructionIds = [...snapshot.grammarConstructionIds]
  for (const label of cleanLabels(snapshot.addedConstructionLabels)) {
    const created = await ensureConstruction(repos, word.language, label, word.id, authorId)
    if (!constructionIds.includes(created.id)) constructionIds.push(created.id)
  }
  next.grammarConstructions = constructionIds
  return repos.words.update(next)
}

async function restoreSnapshot(repos: Repositories, word: Word, snapshot: WordEditSnapshot): Promise<Word> {
  const next: Word = {
    ...word,
    word: word.multilingualDictionary === 'found' ? word.word : snapshot.word,
    type: snapshot.type,
    translations: { ...word.translations, [snapshot.targetLanguage]: [...snapshot.translationIds] },
    rootWords: [...snapshot.rootWordIds],
    grammarConstructions: [...snapshot.grammarConstructionIds],
  }
  if (usesCharacterScript(word.language)) {
    if (snapshot.character) next.character = snapshot.character
    else delete next.character
    if (snapshot.furigana) next.furigana = snapshot.furigana
    else delete next.furigana
  }
  return repos.words.update(next)
}

async function settle(
  repos: Repositories,
  edit: WordEdit,
  up: number,
  down: number,
): Promise<WordEdit> {
  if (edit.resolution === 'moderator') return edit
  const verdict = editVerdict(up, down)
  if (verdict === 'pending') {
    if (edit.status === 'pending') return edit
    return edit
  }
  const word = await repos.words.getById(edit.wordId)
  if (!word) return edit
  if (verdict === 'accept' && edit.status !== 'accepted') {
    await applySnapshot(repos, word, edit.after, edit.authorId)
    const saved = await repos.wordEdits.save({
      ...edit,
      status: 'accepted',
      resolution: 'votes',
      resolvedAt: ts(),
    })
    return saved
  }
  if ((verdict === 'reject' || verdict === 'reject-ban') && edit.status !== 'rejected') {
    if (edit.status === 'accepted') await restoreSnapshot(repos, word, edit.before)
    const saved = await repos.wordEdits.save({
      ...edit,
      status: 'rejected',
      resolution: 'votes',
      resolvedAt: ts(),
    })
    if (verdict === 'reject-ban') await banAuthor(repos, saved)
    return saved
  }
  return edit
}

async function banAuthor(repos: Repositories, edit: WordEdit): Promise<void> {
  const existing = await repos.wordEdits.listBans(edit.authorId)
  if (existing.some((ban) => ban.editId === edit.id)) return
  const startedAt = ts()
  const ends = banEndsAt(Date.parse(startedAt), existing.length)
  await repos.wordEdits.saveBan({
    id: `ban-${crypto.randomUUID()}`,
    userId: edit.authorId,
    editId: edit.id,
    startedAt,
    ...(ends === undefined ? {} : { endsAt: new Date(ends).toISOString() }),
  })
}

export async function loadWordEditor(
  repos: Repositories,
  wordId: ID,
  userId: ID | undefined,
  targetLanguage: LanguageCode,
): Promise<EditorState | null> {
  const word = await repos.words.getById(wordId)
  if (!word) return null
  const translationIds = word.translations[targetLanguage] ?? []
  const relatedIds = unique([...translationIds, ...word.rootWords])
  const [relatedWords, locked, constructions, edits, ban, moderator] = await Promise.all([
    repos.words.listByIds(relatedIds),
    dictionaryIds(repos, translationIds),
    Promise.all(word.grammarConstructions.map((id) => repos.constructions.getById(id))),
    repos.wordEdits.listForWord(wordId),
    userId ? activeEditBan(repos, userId) : Promise.resolve(null),
    userId ? userIsModerator(repos, userId) : Promise.resolve(false),
  ])
  const byId = new Map(relatedWords.map((item) => [item.id, item]))
  const editorEdits = await Promise.all(
    edits
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(async (edit) => {
        const votes = await repos.wordEdits.listVotes(edit.id)
        const author = await repos.users.getById(edit.authorId)
        const mine = userId ? (votes.find((vote) => vote.userId === userId)?.value ?? null) : null
        return {
          edit,
          up: votes.filter((vote) => vote.value === 1).length,
          down: votes.filter((vote) => vote.value === -1).length,
          mine,
          authorName: author?.displayName ?? edit.authorId,
        }
      }),
  )
  return {
    word,
    targetLanguage,
    headwordLocked: word.multilingualDictionary === 'found',
    translations: translationIds.map((id) => ({
      id,
      label: byId.get(id)?.word ?? id,
      locked: locked.has(id),
    })),
    roots: word.rootWords.map((id) => ({
      id,
      label: byId.get(id)?.word ?? id,
      locked: false,
    })),
    constructions: constructions.flatMap((item) =>
      item ? [{ id: item.id, label: item.construction, locked: false }] : [],
    ),
    edits: editorEdits,
    ban,
    moderator,
  }
}

export async function submitWordEdit(
  repos: Repositories,
  wordId: ID,
  authorId: ID,
  targetLanguage: LanguageCode,
  draft: WordEditSnapshot,
): Promise<{ ok: true; edit: WordEdit } | { ok: false; reason: EditFailure }> {
  if (await activeEditBan(repos, authorId)) return { ok: false, reason: 'banned' }
  const word = await repos.words.getById(wordId)
  if (!word) return { ok: false, reason: 'missing' }
  const before = blankSnapshot(word, targetLanguage)
  const locked = await dictionaryIds(repos, before.translationIds)
  const after: WordEditSnapshot = {
    ...draft,
    word: word.multilingualDictionary === 'found' ? before.word : draft.word.trim(),
    character: draft.character.trim(),
    furigana: draft.furigana.trim(),
    targetLanguage,
    translationIds: unique([...locked, ...draft.translationIds.filter((id) => !locked.has(id))]),
    addedTranslationLabels: cleanLabels(draft.addedTranslationLabels),
    addedRootLabels: cleanLabels(draft.addedRootLabels),
    addedConstructionLabels: cleanLabels(draft.addedConstructionLabels),
  }
  const labels = new Map<ID, string>()
  const named = await repos.words.listByIds(
    unique([...before.translationIds, ...before.rootWordIds, ...after.translationIds, ...after.rootWordIds]),
  )
  for (const item of named) labels.set(item.id, item.word)
  const constructions = await Promise.all(
    unique([...before.grammarConstructionIds, ...after.grammarConstructionIds]).map((id) =>
      repos.constructions.getById(id),
    ),
  )
  for (const item of constructions) {
    if (item) labels.set(item.id, item.construction)
  }
  const summary = summaryFor(before, after, labels)
  if (!summary.length) return { ok: false, reason: 'empty' }
  if (!sameIds(before.translationIds.filter((id) => locked.has(id)), after.translationIds.filter((id) => locked.has(id)))) {
    after.translationIds = unique([...locked, ...after.translationIds])
  }
  const edit = await repos.wordEdits.save({
    id: `edit-${crypto.randomUUID()}`,
    wordId,
    authorId,
    createdAt: ts(),
    status: 'pending',
    before,
    after,
    summary,
  })
  return { ok: true, edit }
}

export async function voteWordEdit(
  repos: Repositories,
  editId: ID,
  userId: ID,
  value: 1 | -1,
): Promise<{ ok: true } | { ok: false; reason: EditFailure }> {
  const edits = await findEdit(repos, editId)
  if (!edits) return { ok: false, reason: 'missing' }
  if (edits.authorId === userId) return { ok: false, reason: 'own-vote' }
  if (await activeEditBan(repos, userId)) return { ok: false, reason: 'banned' }
  await repos.wordEdits.saveVote({
    id: `wevote-${userId}-${editId}`,
    editId,
    userId,
    value,
    createdAt: ts(),
  })
  const votes = await repos.wordEdits.listVotes(editId)
  await settle(
    repos,
    edits,
    votes.filter((vote) => vote.value === 1).length,
    votes.filter((vote) => vote.value === -1).length,
  )
  return { ok: true }
}

export async function resolveWordEdit(
  repos: Repositories,
  editId: ID,
  moderatorId: ID,
  decision: 'accept' | 'reject',
): Promise<{ ok: true } | { ok: false; reason: EditFailure }> {
  if (!(await userIsModerator(repos, moderatorId))) return { ok: false, reason: 'not-moderator' }
  const edit = await findEdit(repos, editId)
  if (!edit) return { ok: false, reason: 'missing' }
  if (edit.authorId === moderatorId) return { ok: false, reason: 'own-vote' }
  const word = await repos.words.getById(edit.wordId)
  if (!word) return { ok: false, reason: 'missing' }
  if (decision === 'accept' && edit.status !== 'accepted') {
    await applySnapshot(repos, word, edit.after, edit.authorId)
  }
  if (decision === 'reject' && edit.status === 'accepted') {
    await restoreSnapshot(repos, word, edit.before)
  }
  await repos.wordEdits.save({
    ...edit,
    status: decision === 'accept' ? 'accepted' : 'rejected',
    resolution: 'moderator',
    resolvedAt: ts(),
    resolvedBy: moderatorId,
  })
  return { ok: true }
}

async function findEdit(repos: Repositories, editId: ID): Promise<WordEdit | null> {
  return repos.wordEdits.getById(editId)
}
