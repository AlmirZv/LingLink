import { describe, expect, it } from 'vitest'

import { formatWordLabel, wordMatchesQuery } from '@/domain/words/characterReading'
import type { Word } from '@/types/db'

const iku = {
  word: '行く',
  character: '行',
  furigana: 'いく',
} as Word

describe('character reading', () => {
  it('formats a character word with its reading', () => {
    expect(formatWordLabel(iku)).toBe('行く（いく）')
    expect(formatWordLabel({ word: 'パン' } as Word)).toBe('パン')
  })

  it('matches the written form, the characters, or the reading', () => {
    expect(wordMatchesQuery(iku, '行く')).toBe(true)
    expect(wordMatchesQuery(iku, '行')).toBe(true)
    expect(wordMatchesQuery(iku, 'いく')).toBe(true)
    expect(wordMatchesQuery(iku, '来る')).toBe(false)
  })
})
