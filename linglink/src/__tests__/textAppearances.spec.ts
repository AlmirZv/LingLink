// @vitest-environment node
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { countWordOccurrences, indexTextsOntoWords } from '@/domain/words/textAppearances'
import { createRepositories, resetRepositoriesForTests } from '@/services/createRepositories'
import type { LearningText, Word } from '@/types/db'

function word(id: string): Word {
  return {
    id,
    language: 'ja',
    word: id,
    translations: {},
    type: 'other',
    rootWords: [],
    grammarConstructions: [],
    createdBy: 'user',
    createdAt: '',
    updatedAt: '',
  }
}

function text(id: string, status: LearningText['status'], wordIds: string[]): LearningText {
  return {
    id,
    status,
    sentences: [
      {
        id: 's',
        position: 0,
        text: '',
        words: wordIds.map((wordId, index) => ({
          id: `${id}-${index}`,
          sentenceId: 's',
          position: index,
          text: wordId,
          wordId,
          translations: [],
        })),
        constructions: [],
      },
    ],
  } as unknown as LearningText
}

describe('countWordOccurrences', () => {
  it('counts repeated occurrences of the same word', () => {
    const counts = countWordOccurrences(text('t', 'published', ['a', 'b', 'a']))
    expect(counts.get('a')).toBe(2)
    expect(counts.get('b')).toBe(1)
  })
})

describe('indexTextsOntoWords', () => {
  it('stores the text, the count, and whether the text can be read', () => {
    const indexed = indexTextsOntoWords(
      [word('a'), word('b')],
      [text('published-text', 'published', ['a', 'a']), text('hidden-text', 'hidden', ['a']), text('draft-text', 'draft', ['b'])],
    )
    expect(indexed.find((item) => item.id === 'a')?.textAppearances).toEqual([
      { textId: 'hidden-text', count: 1, readable: false },
      { textId: 'published-text', count: 2, readable: true },
    ])
    expect(indexed.find((item) => item.id === 'b')?.textAppearances).toBeUndefined()
  })
})

describe('stored appearances on publish and hide', () => {
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

  it('indexes published seed texts and clears readability when the author hides one', async () => {
    const repos = createRepositories('mock')
    const word = await repos.words.getById('word-kinou-ja')
    expect(word?.textAppearances).toEqual([
      { textId: 'text-yesterday-bread-ja', count: 1, readable: true },
    ])

    const source = await repos.texts.getById('text-yesterday-bread-ja')
    await repos.texts.update({ ...source!, status: 'hidden' })
    const hidden = await repos.words.getById('word-kinou-ja')
    expect(hidden?.textAppearances).toEqual([
      { textId: 'text-yesterday-bread-ja', count: 1, readable: false },
    ])

    await repos.texts.update({ ...source!, status: 'deleted' })
    const deleted = await repos.words.getById('word-kinou-ja')
    expect(deleted?.textAppearances?.[0]?.readable).toBe(false)
  })
})
