// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'

import { buildDraftLearningText } from '@/domain/text/buildDraftFromAnalysis'
import { analyzeText } from '@/domain/text/textAnalysisService'
import { resetSentenceIdCounterForTests } from '@/domain/text/sentenceSplitter'
import { resetTokenIdCounterForTests } from '@/domain/text/tokenizer'
import { buildSeedCatalog } from '@/services/mock/seed'
import type { AnalysisWordLookup } from '@/types/analysis'

function lookupFromSeed(): AnalysisWordLookup {
  const seed = buildSeedCatalog()
  return {
    async findWord(language, normalized) {
      return (
        seed.words.find(
          (w) =>
            w.language === language &&
            (w.language === 'ru' ? w.word.toLocaleLowerCase('ru') === normalized : w.word === normalized),
        ) ?? null
      )
    },
    async getWordById(id) {
      return seed.words.find((w) => w.id === id) ?? null
    },
    async getConstructionById(id) {
      return seed.constructions.find((c) => c.id === id) ?? null
    },
  }
}

describe('buildDraftLearningText', () => {
  beforeEach(() => {
    resetSentenceIdCounterForTests()
    resetTokenIdCounterForTests()
  })

  it('does not assign wordId to unknown tokens', async () => {
    const analysis = await analyzeText(
      { text: 'Новое слово xyz.', language: 'ru' },
      lookupFromSeed(),
    )
    const draft = buildDraftLearningText({
      analysis,
      title: 'Test',
      level: 'beginner',
      topics: [],
      authorId: 'user-demo',
      targetLanguage: 'ja',
      knownTranslationWordIds: new Map(),
    })

    const unknownOcc = draft.sentences.flatMap((s) => s.words).find((w) => w.text === 'xyz')
    expect(unknownOcc?.wordId).toBeUndefined()
    expect(draft.status).toBe('draft')
  })
})
