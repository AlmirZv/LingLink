import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, initializeFirestore, persistentLocalCache, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

let app: FirebaseApp | null = null
let db: Firestore | null = null
let auth: Auth | null = null
let storage: FirebaseStorage | null = null

export function isFirebaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID,
  )
}

function firebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* in .env.local')
  }
  app ??= initializeApp(firebaseConfig())
  return app
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    try {
      db = initializeFirestore(getFirebaseApp(), {
        localCache: persistentLocalCache(),
        ignoreUndefinedProperties: true,
      })
    } catch {
      db = getFirestore(getFirebaseApp())
    }
  }
  return db
}

export function getFirebaseAuth(): Auth {
  auth ??= getAuth(getFirebaseApp())
  return auth
}

export function getFirebaseStorage(): FirebaseStorage {
  storage ??= getStorage(getFirebaseApp())
  return storage
}
