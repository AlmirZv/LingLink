import { describe, expect, it, vi } from 'vitest'

import { importMissingWord } from '@/services/dictionary/importDictionaryWord'
import type { Repositories } from '@/services/repositories/contracts'
import type { Word } from '@/types/db'

function memoryRepos() {
  const words = new Map<string, Word>()
  const repos = {
    words: {
      async getById(id: string) {
        return words.get(id) ?? null
      },
      async listByIds(ids: string[]) {
        return ids.flatMap((id) => {
          const word = words.get(id)
          return word ? [word] : []
        })
      },
      async listAll() {
        return [...words.values()]
      },
      async findByWordSubstring(_query: string, language?: string) {
        return [...words.values()].filter((word) => language === undefined || word.language === language)
      },
      async create(word: Word) {
        words.set(word.id, word)
        return word
      },
      async update(word: Word) {
        words.set(word.id, { ...word })
        return words.get(word.id)!
      },
    },
  }
  return repos as Repositories
}

describe('importMissingWord dictionary cache', () => {
  it('remembers a confirmed miss and does not ask the dictionary again', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ word: 'иду', translations: {} }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const repos = memoryRepos()

    const first = await importMissingWord(repos, 'иду', 'ru', 'user-1')
    const second = await importMissingWord(repos, 'Иду', 'ru', 'user-2')

    expect(first?.multilingualDictionary).toBe('missing')
    expect(first?.translations).toEqual({})
    expect(second?.id).toBe(first?.id)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('does not cache a miss when the dictionary request fails', async () => {
    const fetchMock = vi.fn(async () => new Response('no', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const repos = memoryRepos()

    await expect(importMissingWord(repos, 'иду', 'ru', 'user-1')).resolves.toBeNull()
    await expect(importMissingWord(repos, 'иду', 'ru', 'user-2')).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })
})
