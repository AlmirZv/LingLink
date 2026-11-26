/**
 * After firebase firestore:delete texts: confirm empty and strip word text lists.
 * Run: npx vite-node scripts/wipeTexts.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { collection, doc, getDocs, getFirestore, writeBatch } from 'firebase/firestore'

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

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..')
  const env = loadEnv(resolve(root, '.env'))
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  })
  await signInWithEmailAndPassword(getAuth(app), SEED_EMAIL, SEED_PASSWORD)
  const db = getFirestore(app)

  const texts = await getDocs(collection(db, 'texts'))
  const series = await getDocs(collection(db, 'textSeries'))
  const ratings = await getDocs(collection(db, 'textRatings'))
  console.log(`texts=${texts.size} series=${series.size} ratings=${ratings.size}`)

  const words = await getDocs(collection(db, 'words'))
  let cleared = 0
  const rows = words.docs.filter((item) => {
    const data = item.data() as { textAppearances?: unknown[]; translationUseCount?: number }
    return (data.textAppearances?.length ?? 0) > 0 || Boolean(data.translationUseCount)
  })
  for (let index = 0; index < rows.length; index += 400) {
    const batch = writeBatch(db)
    for (const item of rows.slice(index, index + 400)) {
      const data = item.data()
      batch.set(doc(db, 'words', item.id), { ...data, textAppearances: [], translationUseCount: 0 })
      cleared += 1
    }
    await batch.commit()
  }
  console.log(`cleared text lists on ${cleared} words of ${words.size}`)
}

void main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
