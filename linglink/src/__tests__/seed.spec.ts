// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { buildSeedCatalog } from '@/services/mock/seed'
import { createRepositories, resetRepositoriesForTests } from '@/services/createRepositories'

describe('seed catalog', () => {
  it('includes published texts and demo progress', () => {
    const seed = buildSeedCatalog()
    expect(seed.texts).toHaveLength(4)
    expect(seed.texts.every((t) => t.status === 'published')).toBe(true)
    expect(seed.texts.some((t) => t.authorId === 'user-contributor' && t.id === 'text-morning-walk')).toBe(true)
    expect(seed.wordProgress.some((p) => p.level === 1)).toBe(true)
  })
})

describe('mock repositories', () => {
  beforeEach(() => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem(key: string) {
        return store[key] ?? null
      },
      setItem(key: string, value: string) {
        store[key] = value
      },
      removeItem(key: string) {
        delete store[key]
      },
      clear() {
        for (const key of Object.keys(store)) delete store[key]
      },
    })
    resetRepositoriesForTests()
  })

  it('lists published texts', async () => {
    const repos = createRepositories('mock')
    const texts = await repos.texts.listPublished()
    expect(texts.length).toBe(4)
  })

  it('finds texts by word id', async () => {
    const repos = createRepositories('mock')
    const matches = await repos.texts.findByWordId('word-utro-ru')
    expect(matches.some((t) => t.id === 'text-morning-city')).toBe(true)
  })

  it('reads and writes word progress level', async () => {
    const repos = createRepositories('mock')
    const saved = await repos.progress.setWordLevel('user-demo', 'word-hleb-ru', 1)
    expect(saved.level).toBe(1)
    const loaded = await repos.progress.getWordProgress('user-demo', 'word-hleb-ru')
    expect(loaded?.level).toBe(1)
  })
})
