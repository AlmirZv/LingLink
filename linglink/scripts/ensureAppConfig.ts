/**
 * Creates appConfig/client if missing. Does not lower an existing minVersionCode.
 * Run: npx vite-node scripts/ensureAppConfig.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore'

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
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  })
  await signInForSeed(app)
  const db = getFirestore(app)
  const ref = doc(db, 'appConfig', 'client')
  const existing = await getDoc(ref)
  if (existing.exists()) {
    console.log('appConfig/client already present', existing.data())
    return
  }
  await setDoc(ref, { minVersionCode: 1, downloadUrl: '' })
  console.log('created appConfig/client minVersionCode=1')
}

void main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
