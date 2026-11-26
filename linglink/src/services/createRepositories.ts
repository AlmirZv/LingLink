import type { Repositories } from '@/services/repositories/contracts'

import { createFirebaseRepositories } from '@/services/firebase/createFirebaseRepositories'
import { getFirebaseDb, isFirebaseConfigured } from '@/services/firebase/initFirebase'
import { wrapWithLocalCache } from '@/services/local/cachedRepositories'
import { createMockRepositories } from '@/services/mock/createMockRepositories'
import { MockDatabase } from '@/services/mock/mockDatabase'

export type RepositoryMode = 'mock' | 'firebase'

let cached: Repositories | null = null
let cachedMode: RepositoryMode | null = null
let mockDb: MockDatabase | null = null

export function resolveRepositoryMode(): RepositoryMode {
  const env = import.meta.env.VITE_REPOSITORY_MODE
  if (env === 'firebase' && isFirebaseConfigured()) return 'firebase'
  return 'mock'
}

export function createRepositories(mode: RepositoryMode = resolveRepositoryMode()): Repositories {
  if (cached && cachedMode === mode) return cached

  if (mode === 'firebase') {
    if (!isFirebaseConfigured()) {
      throw new Error('VITE_REPOSITORY_MODE=firebase but Firebase env vars are missing.')
    }
    cached = wrapWithLocalCache(createFirebaseRepositories(getFirebaseDb()))
    cachedMode = mode
    mockDb = null
    return cached
  }

  mockDb = new MockDatabase()
  cached = createMockRepositories(mockDb)
  cachedMode = mode
  return cached
}

/** Test-only access to the in-memory DB */
export function getMockDatabaseForTests(): MockDatabase {
  if (!mockDb) {
    createRepositories('mock')
  }
  return mockDb!
}

export function resetRepositoriesForTests(): void {
  cached = null
  cachedMode = null
  mockDb = null
}
