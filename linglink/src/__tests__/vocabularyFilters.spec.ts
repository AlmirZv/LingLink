// @vitest-environment node
import { describe, it, expect } from 'vitest'

import {
  filterWordEntries,
  groupWordEntries,
  masteryBucket,
  masteryLevelAfterPractice,
  placeKnownGroupsLast,
  WORD_MASTERY_TARGET,
  type UserWordEntry,
  type UserWordGroup,
} from '@/domain/words/vocabularyFilters'
import type { Word } from '@/types/db'

function entry(word: string, textsMastered: number): UserWordEntry {
  const w = { id: word, word, language: 'ja' } as Word
  return { word: w, level: 0, textsMastered }
}

describe('masteryBucket', () => {
  it('classifies 0/5 unknown and 5/5 known', () => {
    expect(masteryBucket(0)).toBe('unknown')
    expect(masteryBucket(WORD_MASTERY_TARGET)).toBe('known')
    expect(masteryBucket(3)).toBe('learning')
  })
})

describe('masteryLevelAfterPractice', () => {
  it('adds one to the current bar and stops at full mastery', () => {
    expect(masteryLevelAfterPractice(0, 0)).toBe(1)
    expect(masteryLevelAfterPractice(2, 0)).toBe(3)
    expect(masteryLevelAfterPractice(0, 4)).toBe(5)
    expect(masteryLevelAfterPractice(5, 5)).toBe(5)
  })
})

describe('filterWordEntries', () => {
  const list = [
    entry('known', 5),
    entry('learning', 2),
    entry('unknown', 0),
  ]

  it('filters known tab (5/5)', () => {
    expect(filterWordEntries(list, 'known', '').map((e) => e.word.word)).toEqual(['known'])
  })

  it('filters learning tab (1–4/5)', () => {
    expect(filterWordEntries(list, 'learning', '').map((e) => e.word.word)).toEqual(['learning'])
  })

  it('filters unknown tab (0/5)', () => {
    expect(filterWordEntries(list, 'unknown', '').map((e) => e.word.word)).toEqual(['unknown'])
  })

  it('searches by substring', () => {
    expect(filterWordEntries(list, 'all', 'earn').map((e) => e.word.word)).toEqual(['learning'])
  })
})

describe('groupWordEntries', () => {
  function sense(id: string, surface: string, translationId: string): UserWordEntry {
    return {
      word: {
        id,
        language: 'ja',
        word: surface,
        translations: { ru: [translationId] },
        type: 'verb',
        rootWords: [],
        grammarConstructions: [],
        createdBy: 'user',
        createdAt: '',
        updatedAt: '',
      },
      level: 0,
      textsMastered: 0,
    }
  }

  it('merges the same surface and stacks mastery per translation', () => {
    const idti = { id: 'idti', language: 'ru', word: 'идти', translations: {}, type: 'verb', rootWords: [], grammarConstructions: [], createdBy: 'user', createdAt: '', updatedAt: '' } as Word
    const idu = { ...idti, id: 'idu', word: 'иду' }
    const groups = groupWordEntries(
      [sense('a', '行く', 'idti'), sense('b', '行く', 'idu'), sense('c', '来た', 'idti')],
      'ru',
      new Map([
        ['idti', idti],
        ['idu', idu],
      ]),
    )
    expect(groups.map((group) => group.word.word)).toEqual(['行く', '来た'])
    expect(groups[0]?.translations.map((item) => item.label)).toEqual(['идти', 'иду'])
    expect(groups[0]?.mastery).toBe(0)
    expect(groups[0]?.masteryTarget).toBe(10)
    expect(groups[1]?.masteryTarget).toBe(5)
  })
})

describe('placeKnownGroupsLast', () => {
  function group(id: string, mastery: number, masteryTarget = 5): UserWordGroup {
    return {
      id,
      word: { id, word: id, language: 'ja' } as Word,
      members: [],
      translations: [],
      mastery,
      masteryTarget,
    }
  }

  it('keeps a full mastery bar after every other word', () => {
    const ordered = placeKnownGroupsLast([
      group('known', 5),
      group('learning', 2),
      group('unknown', 0),
      group('also-known', 10, 10),
    ])
    expect(ordered.map((item) => item.id)).toEqual(['learning', 'unknown', 'known', 'also-known'])
  })
})
