import { ref } from 'vue'

import { wordMatchesQuery } from '@/domain/words/characterReading'
import { cacheKeys } from '@/services/local/cacheKeys'
import { idbGet, idbSet } from '@/services/local/idb'
import { mergeById, pickNewer } from '@/services/local/mergeByUpdatedAt'
import type { Repositories } from '@/services/repositories/contracts'
import type {
  ID,
  LearningText,
  Topic,
  UserTextProgress,
  UserWordProgress,
  UserWordTextHistory,
  Word,
} from '@/types/db'

type OutboxItem =
  | { kind: 'wordProgress'; entry: UserWordProgress }
  | { kind: 'textProgress'; entry: UserTextProgress }
  | { kind: 'wordTextHistory'; entry: UserWordTextHistory }
  | { kind: 'clearHistory'; userId: ID; wordId: ID }

const words = new Map<ID, Word>()
const texts = new Map<ID, LearningText>()
const topics = new Map<ID, Topic>()
const wordProgress = new Map<string, Map<ID, UserWordProgress>>()
const textProgress = new Map<string, Map<ID, UserTextProgress>>()
const history = new Map<string, UserWordTextHistory[]>()

let wordsReady = false
let textsReady = false
let topicsReady = false
const progressReady = new Set<string>()
let outbox: OutboxItem[] = []
let flushing = false
let inner: Repositories | null = null
let syncing = false

const DAY_MS = 24 * 60 * 60 * 1000
const TEXT_PAGE_SIZE = 5

interface SyncMeta {
  checkedAt: string
  fullAt: string
}

/** Bumps when the on-device catalog or the user record changes, so open screens can refresh. */
export const localDataRevision = ref(0)
/** False until the first launch sync finishes. Mock mode never waits on this. */
export const localCacheReady = ref(false)

function bumpLocalData(): void {
  localDataRevision.value += 1
}

function historyId(userId: string, wordId: string, textId: string): string {
  return `${userId}::${wordId}::${textId}`
}

function progressMap(store: Map<string, Map<ID, UserWordProgress | UserTextProgress>>, userId: string) {
  let map = store.get(userId)
  if (!map) {
    map = new Map()
    store.set(userId, map)
  }
  return map
}

async function loadOutbox(): Promise<void> {
  outbox = (await idbGet<OutboxItem[]>(cacheKeys.outbox)) ?? []
}

async function saveOutbox(): Promise<void> {
  await idbSet(cacheKeys.outbox, outbox)
}

async function ensureWords(): Promise<void> {
  if (wordsReady) return
  const rows = (await idbGet<Word[]>(cacheKeys.words)) ?? []
  words.clear()
  for (const row of rows) words.set(row.id, row)
  wordsReady = true
}

async function ensureTexts(): Promise<void> {
  if (textsReady) return
  const rows = (await idbGet<LearningText[]>(cacheKeys.texts)) ?? []
  texts.clear()
  for (const row of rows) texts.set(row.id, row)
  textsReady = true
}

async function ensureTopics(): Promise<void> {
  if (topicsReady) return
  const rows = (await idbGet<Topic[]>(cacheKeys.topics)) ?? []
  topics.clear()
  for (const row of rows) topics.set(row.id, row)
  topicsReady = true
}

async function ensureProgress(userId: string): Promise<void> {
  if (progressReady.has(userId)) return
  const wordsRows = (await idbGet<UserWordProgress[]>(cacheKeys.wordProgress(userId))) ?? []
  const textsRows = (await idbGet<UserTextProgress[]>(cacheKeys.textProgress(userId))) ?? []
  const historyRows = (await idbGet<UserWordTextHistory[]>(cacheKeys.wordTextHistory(userId))) ?? []
  const wordsMap = new Map<ID, UserWordProgress>()
  for (const row of wordsRows) wordsMap.set(row.wordId, row)
  wordProgress.set(userId, wordsMap)
  const textsMap = new Map<ID, UserTextProgress>()
  for (const row of textsRows) textsMap.set(row.textId, row)
  textProgress.set(userId, textsMap)
  history.set(userId, historyRows)
  progressReady.add(userId)
}

async function persistWords(): Promise<void> {
  await idbSet(cacheKeys.words, [...words.values()])
}

async function persistTexts(): Promise<void> {
  await idbSet(cacheKeys.texts, [...texts.values()])
}

async function persistTopics(): Promise<void> {
  await idbSet(cacheKeys.topics, [...topics.values()])
}

async function persistProgress(userId: string): Promise<void> {
  await idbSet(cacheKeys.wordProgress(userId), [...(wordProgress.get(userId)?.values() ?? [])])
  await idbSet(cacheKeys.textProgress(userId), [...(textProgress.get(userId)?.values() ?? [])])
  await idbSet(cacheKeys.wordTextHistory(userId), history.get(userId) ?? [])
}

function rememberWord(word: Word): void {
  words.set(word.id, word)
}

function rememberText(text: LearningText): void {
  if (text.status === 'published') texts.set(text.id, text)
  else texts.delete(text.id)
}

function enqueue(item: OutboxItem): void {
  if (item.kind === 'wordProgress') {
    outbox = outbox.filter(
      (row) => !(row.kind === 'wordProgress' && row.entry.userId === item.entry.userId && row.entry.wordId === item.entry.wordId),
    )
  }
  if (item.kind === 'textProgress') {
    outbox = outbox.filter(
      (row) => !(row.kind === 'textProgress' && row.entry.userId === item.entry.userId && row.entry.textId === item.entry.textId),
    )
  }
  outbox.push(item)
  void saveOutbox()
}

export async function flushLocalCache(): Promise<void> {
  if (!inner || flushing || !outbox.length) return
  flushing = true
  const pending = [...outbox]
  outbox = []
  await saveOutbox()
  try {
    for (const item of pending) {
      if (item.kind === 'wordProgress') await inner.progress.setWordLevel(item.entry.userId, item.entry.wordId, item.entry.level)
      else if (item.kind === 'textProgress') await inner.progress.upsertTextProgress(item.entry)
      else if (item.kind === 'wordTextHistory') await inner.wordTextHistory.record(item.entry)
      else await inner.wordTextHistory.clearForWord(item.userId, item.wordId)
    }
  } catch (error) {
    outbox = [...pending, ...outbox]
    await saveOutbox()
    throw error
  } finally {
    flushing = false
  }
}

export async function syncLocalCache(userId?: string, reason: 'boot' | 'resume' = 'boot'): Promise<void> {
  if (!inner || syncing) return
  const meta = await readSyncMeta()
  if (reason === 'resume' && !stale(meta.checkedAt)) return
  syncing = true
  try {
    await loadOutbox()
    await ensureWords()
    await ensureTexts()
    await ensureTopics()
    await flushLocalCache().catch(() => undefined)

    const full = stale(meta.fullAt) || words.size === 0
    let catalogOk = true
    try {
      if (full) {
        const remoteWords = await inner.words.listAll()
        words.clear()
        for (const word of remoteWords) words.set(word.id, word)
        await persistWords()
        bumpLocalData()

        const seen = new Set<ID>()
        await inner.texts.forEachPublishedPage(TEXT_PAGE_SIZE, async (page) => {
          for (const text of page) {
            rememberText(text)
            if (text.status === 'published') seen.add(text.id)
          }
          await persistTexts()
          bumpLocalData()
        })
        for (const id of [...texts.keys()]) {
          if (!seen.has(id)) texts.delete(id)
        }
        await persistTexts()
      } else if (meta.checkedAt) {
        const [changedWords, changedTexts] = await Promise.all([
          inner.words.listUpdatedSince(meta.checkedAt),
          inner.texts.listUpdatedSince(meta.checkedAt),
        ])
        for (const word of changedWords) rememberWord(word)
        for (const text of changedTexts) rememberText(text)
        if (changedWords.length) await persistWords()
        if (changedTexts.length) await persistTexts()
      }

      const remoteTopics = await inner.topics.list()
      topics.clear()
      for (const topic of remoteTopics) topics.set(topic.id, topic)
      await persistTopics()
    } catch {
      catalogOk = false
    }

    if (userId) {
      try {
        await ensureProgress(userId)
        const [remoteWordProgress, remoteTextProgress, remoteHistory] = await Promise.all([
          inner.progress.listWordProgress(userId),
          inner.progress.listTextProgress(userId),
          inner.wordTextHistory.listForUser(userId),
        ])
        const wordsMap = progressMap(wordProgress, userId) as Map<ID, UserWordProgress>
        const mergedWords = mergeById([...wordsMap.values()], remoteWordProgress, (row) => row.wordId, pickNewer)
        wordsMap.clear()
        for (const row of mergedWords) wordsMap.set(row.wordId, row)

        const textsMap = progressMap(textProgress, userId) as Map<ID, UserTextProgress>
        const mergedTexts = mergeById([...textsMap.values()], remoteTextProgress, (row) => row.textId, pickNewer)
        textsMap.clear()
        for (const row of mergedTexts) textsMap.set(row.textId, row)

        history.set(
          userId,
          mergeById(
            history.get(userId) ?? [],
            remoteHistory,
            (row) => historyId(row.userId, row.wordId, row.textId),
            pickNewer,
          ),
        )
        await persistProgress(userId)
        await flushLocalCache().catch(() => undefined)
      } catch {
        // Private progress stays on the device when the account token is not ready yet.
      }
    }

    if (catalogOk) {
      const now = new Date().toISOString()
      await idbSet(cacheKeys.syncMeta, { checkedAt: now, fullAt: full ? now : meta.fullAt || now })
    }
    bumpLocalData()
  } finally {
    syncing = false
    localCacheReady.value = true
  }
}

async function readSyncMeta(): Promise<SyncMeta> {
  return (await idbGet<SyncMeta>(cacheKeys.syncMeta)) ?? { checkedAt: '', fullAt: '' }
}

function stale(iso: string): boolean {
  const at = Date.parse(iso)
  return !iso || Number.isNaN(at) || Date.now() - at > DAY_MS
}

export async function pullLocalCache(userId?: string): Promise<void> {
  await syncLocalCache(userId, 'boot')
}

export function wrapWithLocalCache(repos: Repositories): Repositories {
  inner = repos
  void loadOutbox()

  return {
    ...repos,
    words: {
      ...repos.words,
      async getById(id) {
        await ensureWords()
        const cached = words.get(id)
        if (cached) return cached
        const stored = await repos.words.getById(id)
        if (stored) {
          rememberWord(stored)
          await persistWords()
        }
        return stored
      },
      async listByIds(ids) {
        await ensureWords()
        const missing = ids.filter((id) => !words.has(id))
        if (missing.length) {
          const loaded = await repos.words.listByIds(missing)
          for (const word of loaded) rememberWord(word)
          if (loaded.length) await persistWords()
        }
        return ids.map((id) => words.get(id)).filter((word): word is Word => Boolean(word))
      },
      async listAll() {
        await ensureWords()
        return [...words.values()]
      },
      async findByWordSubstring(query, language) {
        await ensureWords()
        const q = query.trim()
        if (!q) return []
        return [...words.values()].filter(
          (word) => wordMatchesQuery(word, q) && (language === undefined || word.language === language),
        )
      },
      async create(word) {
        const stored = await repos.words.create(word)
        rememberWord(stored)
        await persistWords()
        return stored
      },
      async update(word) {
        const stored = await repos.words.update(word)
        rememberWord(stored)
        await persistWords()
        return stored
      },
    },
    topics: {
      ...repos.topics,
      async list() {
        await ensureTopics()
        return [...topics.values()].sort((a, b) => a.name.localeCompare(b.name))
      },
      async getById(id) {
        await ensureTopics()
        const cached = topics.get(id)
        if (cached) return cached
        const stored = await repos.topics.getById(id)
        if (stored) {
          topics.set(stored.id, stored)
          await persistTopics()
        }
        return stored
      },
      async create(topic) {
        const stored = await repos.topics.create(topic)
        topics.set(stored.id, stored)
        await persistTopics()
        return stored
      },
    },
    texts: {
      ...repos.texts,
      async listPublished() {
        await ensureTexts()
        return [...texts.values()].sort((a, b) => a.title.localeCompare(b.title))
      },
      async findByTitleSubstring(queryStr) {
        const q = queryStr.trim()
        if (!q) return []
        const catalog = await this.listPublished()
        const needle = q.toLocaleLowerCase()
        return catalog.filter((text) => text.title.toLocaleLowerCase().includes(needle))
      },
      async getById(id) {
        await ensureTexts()
        const cached = texts.get(id)
        if (cached) return cached
        const stored = await repos.texts.getById(id)
        if (stored) {
          rememberText(stored)
          await persistTexts()
        }
        return stored
      },
      async create(text) {
        const stored = await repos.texts.create(text)
        rememberText(stored)
        await persistTexts()
        return stored
      },
      async update(text) {
        const stored = await repos.texts.update(text)
        rememberText(stored)
        await persistTexts()
        return stored
      },
    },
    progress: {
      ...repos.progress,
      async getWordProgress(userId, wordId) {
        await ensureProgress(userId)
        return (progressMap(wordProgress, userId) as Map<ID, UserWordProgress>).get(wordId) ?? null
      },
      async listWordProgress(userId) {
        await ensureProgress(userId)
        return [...(wordProgress.get(userId)?.values() ?? [])]
      },
      async setWordLevel(userId, wordId, level) {
        await ensureProgress(userId)
        const clamped = Math.min(5, Math.max(0, Math.round(level)))
        const entry: UserWordProgress = {
          userId,
          wordId,
          level: clamped,
          updatedAt: new Date().toISOString(),
        }
        ;(progressMap(wordProgress, userId) as Map<ID, UserWordProgress>).set(wordId, entry)
        await persistProgress(userId)
        enqueue({ kind: 'wordProgress', entry })
        return entry
      },
      async getTextProgress(userId, textId) {
        await ensureProgress(userId)
        return (progressMap(textProgress, userId) as Map<ID, UserTextProgress>).get(textId) ?? null
      },
      async listTextProgress(userId) {
        await ensureProgress(userId)
        return [...(textProgress.get(userId)?.values() ?? [])]
      },
      async upsertTextProgress(entry) {
        await ensureProgress(entry.userId)
        const stored = { ...entry, updatedAt: new Date().toISOString() }
        ;(progressMap(textProgress, entry.userId) as Map<ID, UserTextProgress>).set(entry.textId, stored)
        await persistProgress(entry.userId)
        enqueue({ kind: 'textProgress', entry: stored })
      },
    },
    wordTextHistory: {
      ...repos.wordTextHistory,
      async record(entry) {
        await ensureProgress(entry.userId)
        const stored: UserWordTextHistory = {
          ...entry,
          learnedAt: entry.learnedAt ?? new Date().toISOString(),
        }
        const rows = history.get(entry.userId) ?? []
        const key = historyId(stored.userId, stored.wordId, stored.textId)
        const next = [
          ...rows.filter((row) => historyId(row.userId, row.wordId, row.textId) !== key),
          stored,
        ]
        history.set(entry.userId, next)
        await persistProgress(entry.userId)
        enqueue({ kind: 'wordTextHistory', entry: stored })
        return stored
      },
      async listForUser(userId) {
        await ensureProgress(userId)
        return history.get(userId) ?? []
      },
      async countDistinctTexts(userId, wordId) {
        await ensureProgress(userId)
        return new Set((history.get(userId) ?? []).filter((row) => row.wordId === wordId).map((row) => row.textId)).size
      },
      async listForWord(userId, wordId) {
        await ensureProgress(userId)
        return (history.get(userId) ?? []).filter((row) => row.wordId === wordId)
      },
      async clearForWord(userId, wordId) {
        await ensureProgress(userId)
        history.set(
          userId,
          (history.get(userId) ?? []).filter((row) => row.wordId !== wordId),
        )
        await persistProgress(userId)
        enqueue({ kind: 'clearHistory', userId, wordId })
      },
    },
  }
}
