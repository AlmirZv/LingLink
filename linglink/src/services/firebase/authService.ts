import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth'

import type { Repositories } from '@/services/repositories/contracts'
import type { LanguageCode, User } from '@/types/db'
import type { SupportedUiLocale } from '@/constants/languages'
import { isSupportedUiLocale } from '@/constants/languages'
import { generateNickname } from '@/constants/nickGenerator'
import type { useSessionStore } from '@/stores/session'

import { getFirebaseAuth, getFirebaseDb } from './initFirebase'
import { doc, getDoc } from 'firebase/firestore'
import { COLLECTIONS } from './collections'

const ts = () => new Date().toISOString()

type SessionStore = ReturnType<typeof useSessionStore>

type AuthPrefs = { interfaceLanguage: SupportedUiLocale | null; learningLanguage: LanguageCode | null }

export async function signInWithGoogle(repos: Repositories, prefs?: AuthPrefs): Promise<User> {
  const auth = getFirebaseAuth()
  if (Capacitor.isNativePlatform()) {
    const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true })
    const idToken = result.credential?.idToken
    if (!idToken) throw new Error('Google sign-in did not return a token')
    const userCredential = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
    return syncUserDocument(repos, userCredential.user, prefs)
  }
  const credential = await signInWithPopup(auth, new GoogleAuthProvider())
  return syncUserDocument(repos, credential.user, prefs)
}

export async function signInWithApple(repos: Repositories, prefs?: AuthPrefs): Promise<User> {
  const provider = new OAuthProvider('apple.com')
  provider.addScope('email')
  provider.addScope('name')
  const credential = await signInWithPopup(getFirebaseAuth(), provider)
  return syncUserDocument(repos, credential.user, prefs)
}

export async function signInWithEmail(
  repos: Repositories,
  email: string,
  password: string,
  prefs?: AuthPrefs,
): Promise<User> {
  const auth = getFirebaseAuth()
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    return syncUserDocument(repos, credential.user, prefs)
  } catch (error) {
    const code = firebaseErrorCode(error)
    if (code !== 'auth/user-not-found' && code !== 'auth/invalid-credential') throw error
    try {
      const created = await createUserWithEmailAndPassword(auth, email, password)
      return syncUserDocument(repos, created.user, prefs)
    } catch (createError) {
      if (firebaseErrorCode(createError) === 'auth/email-already-in-use') throw error
      throw createError
    }
  }
}

export async function signOutFirebase(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await FirebaseAuthentication.signOut()
  }
  await signOut(getFirebaseAuth())
}

export function bindFirebaseAuth(session: SessionStore, repos: Repositories): Promise<void> {
  return new Promise((resolve) => {
    let first = true
    onAuthStateChanged(getFirebaseAuth(), (fbUser) => {
      const ready = (async () => {
        if (!fbUser) {
          session.clearAuthenticatedUser()
          return
        }
        await fbUser.getIdToken()
        const user = await syncUserDocument(repos, fbUser, {
          interfaceLanguage: session.interfaceLanguage,
          learningLanguage: session.activeLearningLanguage,
        })
        session.applyAuthenticatedUser({
          id: user.id,
          displayName: user.displayName,
          interfaceLanguage: user.interfaceLanguage,
          learningLanguages: user.learningLanguages,
        })
      })().catch(() => undefined)
      void ready.finally(() => {
        if (!first) return
        first = false
        resolve()
      })
    })
  })
}

async function syncUserDocument(
  repos: Repositories,
  fbUser: FirebaseUser,
  prefs?: { interfaceLanguage: SupportedUiLocale | null; learningLanguage: LanguageCode | null },
): Promise<User> {
  const existing = await repos.users.getById(fbUser.uid)
  const interfaceLanguage = existingInterfaceLanguage(existing, prefs?.interfaceLanguage ?? null)
  const learning = (prefs?.learningLanguage ?? existing?.learningLanguages?.[0] ?? 'ja') as LanguageCode

  const user: User = {
    id: fbUser.uid,
    displayName: existing?.displayName?.trim() || generateNickname(),
    interfaceLanguage,
    learningLanguages: prefs?.learningLanguage
      ? [prefs.learningLanguage]
      : existing?.learningLanguages?.length
        ? existing.learningLanguages
        : [learning],
    knownLanguages: existing?.knownLanguages ?? [],
    createdAt: existing?.createdAt ?? ts(),
  }

  await repos.users.upsert(user)
  return user
}

function existingInterfaceLanguage(
  existing: User | null,
  preferred: SupportedUiLocale | null,
): SupportedUiLocale {
  if (preferred && isSupportedUiLocale(preferred)) return preferred
  if (existing?.interfaceLanguage && isSupportedUiLocale(existing.interfaceLanguage)) {
    return existing.interfaceLanguage
  }
  return 'ru'
}

function firebaseErrorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
}

export async function loadUserProfile(userId: string): Promise<User | null> {
  const snap = await getDoc(doc(getFirebaseDb(), COLLECTIONS.users, userId))
  return snap.exists() ? (snap.data() as User) : null
}
