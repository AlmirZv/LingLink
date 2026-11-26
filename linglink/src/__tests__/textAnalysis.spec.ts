// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'

import { analyzeText } from '@/domain/text/textAnalysisService'
import { resetSentenceIdCounterForTests } from '@/domain/text/sentenceSplitter'
import { resetTokenIdCounterForTests } from '@/domain/text/tokenizer'
import { buildSeedCatalog } from '@/services/mock/seed'
import type { AnalysisWordLookup } from '@/types/analysis'
function buildLookup(): AnalysisWordLookup {
  const seed = buildSeedCatalog()
  const words = seed.words
  const constructions = seed.constructions

  return {
    async findWord(language, normalized) {
      return (
        words.find(
          (w) =>
            w.language === language &&
            (w.language === 'ru' || w.language === 'en'
              ? w.word.toLocaleLowerCase('ru') === normalized
              : w.word === normalized),
        ) ?? null
      )
    },
    async getWordById(id) {
      return words.find((w) => w.id === id) ?? null
    },
    async getConstructionById(id) {
      return constructions.find((c) => c.id === id) ?? null
    },
  }
}

describe('text analysis pipeline', () => {
  beforeEach(() => {
    resetSentenceIdCounterForTests()
    resetTokenIdCounterForTests()
  })

  it('analyzes Russian sample with known and unknown words', async () => {
    const lookup = buildLookup()
    const text = `Вчера я пошел в магазин.
Там я купил хлеб и молоко.`

    const result = await analyzeText({ text, language: 'ru' }, lookup)

    expect(result.statistics.sentenceCount).toBe(2)
    expect(result.statistics.uniqueWordCount).toBeGreaterThan(3)
    expect(result.words.some((w) => w.normalized === 'магазин' && w.known)).toBe(true)
    expect(result.words.some((w) => w.normalized === 'молоко' && !w.known)).toBe(true)
  })

  it('analyzes Japanese sample and finds construction via word chain', async () => {
    const lookup = buildLookup()
    const text = '昨日、店でパンを買った。'

    const result = await analyzeText({ text, language: 'ja' }, lookup)

    expect(result.words.some((w) => w.text === '昨日' && w.known)).toBe(true)
    expect(result.constructions.some((c) => c.constructionId === 'gc-kinou')).toBe(true)
    expect(result.statistics.constructionCount).toBeGreaterThanOrEqual(1)
  })
})
