// @vitest-environment node
import { describe, it, expect } from 'vitest'

import { computeTextProgressFraction } from '@/domain/learning/computeProgress'
import { readingPracticeTargets } from '@/services/awardReadingMastery'
import type { GrammarConstruction, LearningText } from '@/types/db'
import { renderSentence } from '@/domain/learning/renderSentence'
import { selectNextWordBatch } from '@/domain/learning/selectNextWordBatch'
import { buildSeedCatalog } from '@/services/mock/seed'

describe('selectNextWordBatch', () => {
  it('returns up to five words sorted by occurrence count', () => {
    const text = buildSeedCatalog().texts[0]!
    const excluded = new Set<string>(['word-utro-ru'])
    const batch = selectNextWordBatch(text, excluded, 5)
    expect(batch).toHaveLength(2)
    expect(batch[0]!.wordId).toBe('word-shli-ru')
  })
})

describe('renderSentence', () => {
  it('shows translation for known words', () => {
    const text = buildSeedCatalog().texts[0]!
    const sentence = text.sentences[0]!
    const words = buildSeedCatalog().words
    const wordsById = new Map(words.map((w) => [w.id, w]))
    const segments = renderSentence(sentence, {
      wordsById,
      knownWordIds: new Set(['word-utro-ru']),
      batchWordIds: new Set(),
    })
    const knownSeg = segments.find((s) => s.kind === 'known')
    expect(knownSeg?.text).toBe('朝（あさ）')
  })

  it('uses the learner language instead of another saved translation', () => {
    const text = buildSeedCatalog().texts[0]!
    const sentence = text.sentences[0]!
    const words = buildSeedCatalog().words.map((word) =>
      word.id === 'word-utro-ru' ? { ...word, translations: { ...word.translations, en: ['word-morning-en'] } } : word,
    )
    words.push({
      id: 'word-morning-en',
      language: 'en',
      word: 'morning',
      translations: { ru: ['word-utro-ru'] },
      type: 'noun',
      rootWords: [],
      grammarConstructions: [],
      createdBy: 'user-demo',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const wordsById = new Map(words.map((word) => [word.id, word]))
    const segments = renderSentence(sentence, {
      wordsById,
      knownWordIds: new Set(['word-utro-ru']),
      batchWordIds: new Set(),
      targetLanguage: 'en',
    })
    const knownSeg = segments.find((segment) => segment.kind === 'known')
    expect(knownSeg?.text).toBe('morning')
  })
})

describe('computeTextProgressFraction', () => {
  it('counts learned words and constructions', () => {
    const text = buildSeedCatalog().texts[0]!
    const p = computeTextProgressFraction(text, ['word-utro-ru'], [])
    expect(p).toBeCloseTo(1 / 3)
  })

  it('counts a construction instead of the words inside it', () => {
    const text = {
      constructionIds: ['gc'],
      sentences: [
        {
          id: 's',
          words: [
            { id: 'a', wordId: 'bud', position: 0 },
            { id: 'b', wordId: 'care', position: 1 },
          ],
          constructions: [{ constructionId: 'gc', startPosition: 0, endPosition: 1 }],
        },
      ],
    } as unknown as LearningText
    expect(computeTextProgressFraction(text, [], [])).toBe(0)
    expect(computeTextProgressFraction(text, ['bud', 'care'], [])).toBe(0)
    expect(computeTextProgressFraction(text, [], ['gc'])).toBe(1)
  })
})

describe('readingPracticeTargets', () => {
  it('practices the construction words and records the construction itself', () => {
    const construction = {
      id: 'gc',
      wordIds: ['bud', 'care'],
      relatedWords: ['bud', 'care'],
    } as GrammarConstruction
    expect(readingPracticeTargets(['gc', 'other'], new Map([['gc', construction]]))).toEqual({
      masteryWordIds: ['bud', 'care', 'other'],
      learnedWordIds: ['other'],
      learnedConstructionIds: ['gc'],
    })
  })
})
