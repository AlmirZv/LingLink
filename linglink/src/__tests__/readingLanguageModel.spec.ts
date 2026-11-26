// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  buildOccurrenceBridgeMap,
  isOriginalLearningText,
  resolveReadingMode,
  textVisibleToLearner,
  translationTargetLanguage,
} from '@/domain/learning/readingLanguageModel'
import { renderSentence } from '@/domain/learning/renderSentence'
import { buildSeedCatalog } from '@/services/mock/seed'

describe('isOriginalLearningText', () => {
  it('is true when the text is in the language being learned', () => {
    expect(isOriginalLearningText('ja', 'ru', 'ja')).toBe(true)
    expect(isOriginalLearningText('ru', 'ru', 'ja')).toBe(false)
  })
})

describe('translationTargetLanguage', () => {
  it('ru text targets ja for ru learner', () => {
    expect(translationTargetLanguage('ru', 'ru', 'ja')).toBe('ja')
  })

  it('ja text targets ru for ru learner', () => {
    expect(translationTargetLanguage('ja', 'ru', 'ja')).toBe('ru')
  })
})

describe('resolveReadingMode', () => {
  it('uses reverse scaffold for ja text with final ru', () => {
    const text = buildSeedCatalog().texts.find((t) => t.id === 'text-yesterday-bread-ja')!
    const mode = resolveReadingMode(text, 'ru', 'ja')
    expect(mode.mode).toBe('reverse_scaffold')
  })

  it('uses forward for ru text', () => {
    const text = buildSeedCatalog().texts[0]!
    expect(resolveReadingMode(text, 'ru', 'ja').mode).toBe('forward')
  })
})

describe('textVisibleToLearner', () => {
  it('shows a russian text to a russian learning english', () => {
    const text = buildSeedCatalog().texts.find((item) => item.language === 'ru')!
    expect(textVisibleToLearner(text, 'ru', 'en')).toBe(true)
  })

  it('hides a text that is neither known, learned, nor translated into those languages', () => {
    const text = {
      ...buildSeedCatalog().texts[0]!,
      language: 'ko',
      finalTranslations: {},
    }
    expect(textVisibleToLearner(text, 'ru', 'en')).toBe(false)
  })
})

describe('renderSentence reverse_scaffold', () => {
  it('shows bridge ru for unknown and ja for known', () => {
    const text = buildSeedCatalog().texts.find((t) => t.id === 'text-yesterday-bread-ja')!
    const sentence = text.sentences[0]!
    const bridge = buildOccurrenceBridgeMap(text.finalTranslations.ru)
    const words = buildSeedCatalog().words
    const wordsById = new Map(words.map((w) => [w.id, w]))
    const segments = renderSentence(sentence, {
      wordsById,
      knownWordIds: new Set(['word-kinou-ja']),
      batchWordIds: new Set(),
      readingMode: 'reverse_scaffold',
      bridgeByOccurrenceId: bridge,
    })
    const kinou = segments.find((s) => s.wordId === 'word-kinou-ja')
    expect(kinou?.text).toBe('昨日')
    const mise = segments.find((s) => s.wordId === 'word-mise-ja')
    expect(mise?.text).toBe('магазине')
  })
})
