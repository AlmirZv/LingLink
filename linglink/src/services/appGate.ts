import { doc, getDoc, onSnapshot } from 'firebase/firestore'

import { APP_VERSION_CODE } from '@/constants/appVersion'
import { COLLECTIONS } from '@/services/firebase/collections'
import { getFirebaseDb, isFirebaseConfigured } from '@/services/firebase/initFirebase'
import { resolveRepositoryMode } from '@/services/createRepositories'

export const APP_CONFIG_DOC_ID = 'client'
const STORED_BLOCK_KEY = 'linglink.appGate.blocked.v1'

export interface AppClientConfig {
  minVersionCode: number
  downloadUrl: string
}

export function isVersionBlocked(minVersionCode: number, current = APP_VERSION_CODE): boolean {
  return Number.isFinite(minVersionCode) && minVersionCode > current
}

export function readStoredAppBlock(): boolean {
  try {
    return localStorage.getItem(STORED_BLOCK_KEY) === '1'
  } catch {
    return false
  }
}

function writeStoredAppBlock(blocked: boolean): void {
  try {
    if (blocked) localStorage.setItem(STORED_BLOCK_KEY, '1')
    else localStorage.removeItem(STORED_BLOCK_KEY)
  } catch {
    // Ignore quota / private mode.
  }
}

function parseConfig(data: unknown): AppClientConfig | null {
  if (!data || typeof data !== 'object') return null
  const row = data as { minVersionCode?: unknown; downloadUrl?: unknown }
  const minVersionCode = Number(row.minVersionCode)
  if (!Number.isFinite(minVersionCode)) return null
  return {
    minVersionCode,
    downloadUrl: typeof row.downloadUrl === 'string' ? row.downloadUrl.trim() : '',
  }
}

export function applyAppConfig(config: AppClientConfig | null): { blocked: boolean; downloadUrl: string } {
  const blocked = config ? isVersionBlocked(config.minVersionCode) : false
  writeStoredAppBlock(blocked)
  return { blocked, downloadUrl: blocked ? (config?.downloadUrl ?? '') : '' }
}

export async function fetchAppClientConfig(): Promise<AppClientConfig | null> {
  if (!isFirebaseConfigured() || resolveRepositoryMode() !== 'firebase') return null
  const snap = await getDoc(doc(getFirebaseDb(), COLLECTIONS.appConfig, APP_CONFIG_DOC_ID))
  return snap.exists() ? parseConfig(snap.data()) : null
}

export function subscribeAppClientConfig(onChange: (config: AppClientConfig | null) => void): () => void {
  if (!isFirebaseConfigured() || resolveRepositoryMode() !== 'firebase') {
    onChange(null)
    return () => undefined
  }
  return onSnapshot(
    doc(getFirebaseDb(), COLLECTIONS.appConfig, APP_CONFIG_DOC_ID),
    (snap) => {
      onChange(snap.exists() ? parseConfig(snap.data()) : null)
    },
    () => undefined,
  )
}
