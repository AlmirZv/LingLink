// @vitest-environment node
import { describe, expect, it, beforeEach } from 'vitest'

import { filterTexts, progressCategory } from '@/domain/text/catalogFilters'
import { resetTokenIdCounterForTests, tokenizeSentence } from '@/domain/text/tokenizer'
import { resetSentenceIdCounterForTests, splitIntoSentences } from '@/domain/text/sentenceSplitter'
import {
  collectWordAndConstructionIds,
  computeTranslationProgress,
  weightedTranslationProgress,
} from '@/services/textDenormalize'
import type { LearningText } from '@/types/db'
import { buildSeedCatalog } from '@/services/mock/seed'

describe('tokenizer', () => {
  beforeEach(() => resetTokenIdCounterForTests())

  it('splits Russian words on spaces', () => {
    const tokens = tokenizeSentence({ id: 's1', position: 0, text: 'Утро в городе' }, 'ru')
    expect(tokens.filter((t) => t.type === 'word').map((t) => t.text)).toEqual(['Утро', 'в', 'городе'])
  })

  it('splits Japanese on particles and script changes without breaking okurigana', () => {
    const words = (text: string) =>
      tokenizeSentence({ id: 's1', position: 0, text }, 'ja')
        .filter((token) => token.type === 'word')
        .map((token) => token.text)

    expect(words('朝、街へ行った。')).toEqual(['朝', '街', 'へ', '行った'])
    expect(words('その本')).toEqual(['その', '本'])
    expect(words('これは本です')).toEqual(['これ', 'は', '本', 'です'])
    expect(words('コーヒーを飲んだ')).toEqual(['コーヒー', 'を', '飲んだ'])
    expect(words('食べました')).toEqual(['食べ', 'ました'])
    expect(words('きのう朝')).toEqual(['きのう', '朝'])
    expect(words('東京の街')).toEqual(['東京', 'の', '街'])
  })

  it('groups Chinese into pairs and peels particles', () => {
    const words = (text: string) =>
      tokenizeSentence({ id: 's1', position: 0, text }, 'zh')
        .filter((token) => token.type === 'word')
        .map((token) => token.text)
    expect(words('我去学校')).toEqual(['我去', '学校'])
    expect(words('吃了饭')).toEqual(['吃', '了', '饭'])
  })

  it('peels Korean particles off a Hangul word', () => {
    const words = (text: string) =>
      tokenizeSentence({ id: 's1', position: 0, text }, 'ko')
        .filter((token) => token.type === 'word')
        .map((token) => token.text)
    expect(words('학교에 갔다')).toEqual(['학교', '에', '갔다'])
    expect(words('나는')).toEqual(['나', '는'])
  })

  it('keeps Arabic words on spaces and punctuation', () => {
    const tokens = tokenizeSentence({ id: 's1', position: 0, text: 'ذهبت إلى المدرسة.' }, 'ar')
    expect(tokens.filter((t) => t.type === 'word').map((t) => t.text)).toEqual(['ذهبت', 'إلى', 'المدرسة'])
  })
})

describe('sentenceSplitter', () => {
  beforeEach(() => resetSentenceIdCounterForTests())

  it('splits on sentence boundaries', () => {
    const parts = splitIntoSentences('Первое. Второе!')
    expect(parts.length).toBeGreaterThanOrEqual(2)
  })

  it('splits Arabic on ؟', () => {
    const parts = splitIntoSentences('كيف حالك؟ أنا بخير.')
    expect(parts.map((part) => part.text)).toEqual(['كيف حالك؟', 'أنا بخير.'])
  })
})

describe('computeTranslationProgress', () => {
  it('gives 90% for every word translation and the last 10% for final sentences', () => {
    expect(weightedTranslationProgress(1, 0)).toBeCloseTo(0.9)
    expect(weightedTranslationProgress(1, 1)).toBeCloseTo(1)
    expect(weightedTranslationProgress(0.5, 0)).toBeCloseTo(0.45)
  })

  it('returns fraction of occurrences with selected translation', () => {
    const text = buildSeedCatalog().texts[0]!
    const progress = computeTranslationProgress(text)
    expect(progress).toBeGreaterThan(0)
    expect(progress).toBeLessThanOrEqual(0.9)
  })

  it('counts a saved construction as the translation of the words it covers', () => {
    const text = {
      language: 'ru',
      sentences: [
        {
          id: 's',
          position: 0,
          text: 'будь осторожен',
          words: [
            { id: 'a', position: 0, text: 'будь', translations: [] },
            { id: 'b', position: 1, text: 'осторожен', translations: [] },
          ],
          constructions: [
            {
              constructionId: 'gc-careful',
              startPosition: 0,
              endPosition: 1,
              text: 'будь осторожен',
              translations: [],
            },
          ],
        },
      ],
      finalTranslations: {},
    } as unknown as LearningText
    expect(computeTranslationProgress(text)).toBeCloseTo(0.9)
  })

  it('collects word ids from occurrences', () => {
    const text = buildSeedCatalog().texts[0]!
    const ids = collectWordAndConstructionIds(text)
    expect(ids.wordIds.length).toBeGreaterThan(0)
  })
})

describe('catalogFilters', () => {
  it('filters by progress category', () => {
    const texts = buildSeedCatalog().texts
    const progress = buildSeedCatalog().textProgress[0]!
    const map = new Map([[progress.textId, progress]])
    const filtered = filterTexts(
      texts,
      { level: 'all', topicId: 'all', progress: 'in_progress', knownWords: 'all' },
      { progressByTextId: map, globalKnownWordIds: new Set() },
    )
    expect(filtered.some((t) => t.id === progress.textId)).toBe(true)
    expect(progressCategory(progress)).toBe('in_progress')
  })
})
