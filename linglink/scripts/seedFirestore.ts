/**
 * Copies the current mock catalog (seed + browser overlay) into Firestore.
 * Run: npx vite-node scripts/seedFirestore.ts
 * Optional overlay: scripts/local-overlay.json { catalog, progress, community }
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { doc, getFirestore, writeBatch, type Firestore } from 'firebase/firestore'

const SEED_EMAIL = 'seed@import.linglink.app'
const SEED_PASSWORD = 'LingLink-seed-import-1'

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return env
}

function installLocalStorage(overlayPath: string): void {
  const store = new Map<string, string>()
  try {
    const overlay = JSON.parse(readFileSync(overlayPath, 'utf8')) as Record<string, unknown>
    for (const [key, value] of Object.entries(overlay)) {
      store.set(key, typeof value === 'string' ? value : JSON.stringify(value))
    }
  } catch {
    // Seed-only import when the browser overlay was not exported.
  }
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size
    },
  }
  Object.assign(globalThis, { localStorage })
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

async function commitAll(db: Firestore, writes: Array<{ path: string[]; data: unknown }>): Promise<void> {
  const chunkSize = 400
  for (let index = 0; index < writes.length; index += chunkSize) {
    const batch = writeBatch(db)
    for (const write of writes.slice(index, index + chunkSize)) {
      batch.set(doc(db, write.path[0]!, ...write.path.slice(1)), plain(write.data))
    }
    await batch.commit()
    console.log(`wrote ${Math.min(index + chunkSize, writes.length)} / ${writes.length}`)
  }
}

async function signInForSeed(app: ReturnType<typeof initializeApp>): Promise<void> {
  const auth = getAuth(app)
  try {
    await signInWithEmailAndPassword(auth, SEED_EMAIL, SEED_PASSWORD)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code !== 'auth/user-not-found' && code !== 'auth/invalid-credential') throw error
    try {
      await createUserWithEmailAndPassword(auth, SEED_EMAIL, SEED_PASSWORD)
    } catch (createError) {
      const createCode =
        typeof createError === 'object' && createError && 'code' in createError ? String(createError.code) : ''
      if (createCode !== 'auth/email-already-in-use') throw createError
      throw error
    }
  }
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..')
  const env = loadEnv(resolve(root, '.env'))
  installLocalStorage(resolve(root, 'scripts/local-overlay.json'))

  const { MockDatabase } = await import('../src/services/mock/mockDatabase.ts')
  const { COLLECTIONS } = await import('../src/services/firebase/collections.ts')
  const { historyKey } = await import('../src/services/mock/persistProgress.ts')
  const { ratingKey, voteKey } = await import('../src/services/mock/persistCommunity.ts')

  const dbState = new MockDatabase()
  for (const user of dbState.users.values()) user.displayName = 'админ'

  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  })
  const db = getFirestore(app)

  try {
    await signInForSeed(app)
    console.log('signed in as seed importer')
  } catch (error) {
    console.log('seed sign-in skipped:', error instanceof Error ? error.message : error)
  }

  const writes: Array<{ path: string[]; data: unknown }> = []
  for (const word of dbState.words.values()) writes.push({ path: [COLLECTIONS.words, word.id], data: word })
  for (const construction of dbState.constructions.values()) {
    writes.push({ path: [COLLECTIONS.grammarConstructions, construction.id], data: construction })
  }
  for (const topic of dbState.topics.values()) writes.push({ path: [COLLECTIONS.topics, topic.id], data: topic })
  for (const series of dbState.series.values()) writes.push({ path: [COLLECTIONS.textSeries, series.id], data: series })
  for (const text of dbState.texts.values()) writes.push({ path: [COLLECTIONS.texts, text.id], data: text })
  for (const user of dbState.users.values()) writes.push({ path: [COLLECTIONS.users, user.id], data: user })
  for (const progress of dbState.wordProgress.values()) {
    writes.push({
      path: [COLLECTIONS.users, progress.userId, COLLECTIONS.wordProgress, progress.wordId],
      data: progress,
    })
  }
  for (const progress of dbState.textProgress.values()) {
    writes.push({
      path: [COLLECTIONS.users, progress.userId, COLLECTIONS.textProgress, progress.textId],
      data: progress,
    })
  }
  for (const entry of dbState.wordTextHistory.values()) {
    writes.push({
      path: [
        COLLECTIONS.users,
        entry.userId,
        COLLECTIONS.wordTextHistory,
        historyKey(entry.userId, entry.wordId, entry.textId),
      ],
      data: entry,
    })
  }
  for (const key of dbState.textViews) {
    const splitAt = key.indexOf('::')
    const userId = key.slice(0, splitAt)
    const textId = key.slice(splitAt + 2)
    writes.push({
      path: [COLLECTIONS.texts, textId, COLLECTIONS.textViews, userId],
      data: { userId, textId },
    })
  }
  for (const key of dbState.textLikes) {
    const splitAt = key.indexOf('::')
    const userId = key.slice(0, splitAt)
    const textId = key.slice(splitAt + 2)
    writes.push({
      path: [COLLECTIONS.texts, textId, COLLECTIONS.textLikes, userId],
      data: { userId, textId },
    })
  }
  for (const vote of dbState.translationVotes.values()) {
    writes.push({ path: [COLLECTIONS.translationVotes, voteKey(vote.userId, vote.proposalId)], data: vote })
  }
  for (const rating of dbState.textRatings.values()) {
    writes.push({ path: [COLLECTIONS.textRatings, ratingKey(rating.userId, rating.textId)], data: rating })
  }
  for (const report of dbState.reports) writes.push({ path: [COLLECTIONS.reports, report.id], data: report })
  for (const edit of dbState.wordEdits) writes.push({ path: [COLLECTIONS.wordEdits, edit.id], data: edit })
  for (const vote of dbState.wordEditVotes.values()) {
    writes.push({ path: [COLLECTIONS.wordEditVotes, vote.id], data: vote })
  }
  for (const ban of dbState.editBans) writes.push({ path: [COLLECTIONS.editBans, ban.id], data: ban })

  console.log(
    `importing words=${dbState.words.size} texts=${dbState.texts.size} users=${dbState.users.size} progress=${dbState.wordProgress.size}`,
  )
  await commitAll(db, writes)
  console.log('firestore import finished')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
