import { foldSurface } from '@/constants/languages'
import { wordMatchSurfaces } from '@/domain/words/characterReading'
import type { Repositories } from '@/services/repositories/contracts'
import type { ID, LanguageCode, Word } from '@/types/db'

export interface WordCatalog {
  ensure(): Promise<void>
  getById(id: ID): Promise<Word | null>
  findExact(language: LanguageCode, form: string): Promise<Word | null>
  remember(word: Word): void
}

function sameForm(word: Word, form: string, language: LanguageCode): boolean {
  const needle = foldSurface(form, language)
  return word.language === language && wordMatchSurfaces(word).some((surface) => foldSurface(surface, language) === needle)
}

/** One in-memory snapshot of the word collection for a scan, so Firestore is not listed per token. */
export function createWordCatalog(repos: Repositories): WordCatalog {
  let cache: Word[] | null = null
  const byId = new Map<ID, Word>()

  async function ensure() {
    if (cache) return
    cache = await repos.words.listAll()
    for (const word of cache) byId.set(word.id, word)
  }

  function remember(word: Word) {
    byId.set(word.id, word)
    if (!cache) {
      cache = [word]
      return
    }
    const index = cache.findIndex((item) => item.id === word.id)
    if (index >= 0) cache[index] = word
    else cache.push(word)
  }

  return {
    ensure,
    remember,
    async getById(id) {
      await ensure()
      const cached = byId.get(id)
      if (cached) return cached
      const stored = await repos.words.getById(id)
      if (stored) remember(stored)
      return stored
    },
    async findExact(language, form) {
      await ensure()
      return cache!.find((word) => sameForm(word, form, language)) ?? null
    },
  }
}

export async function mapPool<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  if (!items.length) return
  let index = 0
  async function next() {
    while (index < items.length) {
      const current = items[index]
      index += 1
      if (current !== undefined) await worker(current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, () => next()))
}
