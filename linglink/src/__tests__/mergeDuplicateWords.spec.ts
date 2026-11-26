// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { mergeDuplicateWords } from '@/domain/words/mergeDuplicateWords'
import type { Word } from '@/types/db'

function word(patch: Partial<Word> & Pick<Word, 'id' | 'word' | 'language'>): Word {
  return {
    translations: {},
    type: 'other',
    rootWords: [],
    grammarConstructions: [],
    createdBy: 'user',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...patch,
  }
}

describe('mergeDuplicateWords', () => {
  it('keeps one card and unions translation ids', () => {
    const older = word({
      id: 'word-iku-ja',
      language: 'ja',
      word: '行く',
      type: 'verb',
      furigana: 'いく',
      translations: { ru: ['word-idti-ru'] },
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const newer = word({
      id: 'word-iku-copy',
      language: 'ja',
      word: '行く',
      translations: { ru: ['word-idu-ru'] },
      createdAt: '2026-09-27T00:00:00.000Z',
    })
    const idu = word({
      id: 'word-idu-ru',
      language: 'ru',
      word: 'иду',
      translations: { ja: ['word-iku-copy'] },
    })

    const { words, remap } = mergeDuplicateWords([older, newer, idu])
    const iku = words.find((item) => item.word === '行く')

    expect(words.map((item) => item.word).sort()).toEqual(['иду', '行く'])
    expect(iku?.id).toBe('word-iku-ja')
    expect(iku?.type).toBe('verb')
    expect(iku?.translations.ru).toEqual(['word-idti-ru', 'word-idu-ru'])
    expect(words.find((item) => item.id === 'word-idu-ru')?.translations.ja).toEqual(['word-iku-ja'])
    expect(remap.get('word-iku-copy')).toBe('word-iku-ja')
  })
})
