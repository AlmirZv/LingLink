// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseTopicNames } from '@/domain/text/parseTopicNames'
import { createRepositories, resetRepositoriesForTests } from '@/services/createRepositories'
import { resolveTopicIds } from '@/services/textAuthoringService'

describe('parseTopicNames', () => {
  it('returns nothing for a blank field', () => {
    expect(parseTopicNames('')).toEqual([])
    expect(parseTopicNames('  ,  , ')).toEqual([])
  })

  it('splits on commas and drops duplicates', () => {
    expect(parseTopicNames('Путешествия, еда,  путешествия ,работа')).toEqual([
      'Путешествия',
      'еда',
      'работа',
    ])
  })
})

describe('resolveTopicIds', () => {
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

  it('reuses an existing topic name and creates the rest', async () => {
    const repos = createRepositories('mock')
    const ids = await resolveTopicIds(repos, ['Путешествия', 'Еда'], 'ru', 'user-1')
    expect(ids[0]).toBe('topic-travel')
    expect(ids[1]).toMatch(/^topic-/)
    expect(ids[1]).not.toBe('topic-travel')

    const again = await resolveTopicIds(repos, ['еда'], 'ru', 'user-1')
    expect(again).toEqual([ids[1]])
  })
})
