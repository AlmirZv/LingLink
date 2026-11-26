// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRepositories, resetRepositoriesForTests } from '@/services/createRepositories'
import { applyFinalLines, isDemotedPublishedText, publishDraftFromScan, restorePublishedDrafts } from '@/services/textAuthoringService'
import { scanFromLearningText } from '@/services/textScan'
import type { LearningText } from '@/types/db'

function stubStorage() {
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
}

describe('isDemotedPublishedText', () => {
  it('detects drafts that used to be in the library', () => {
    expect(isDemotedPublishedText({ status: 'draft', views: 2, sentences: [] } as unknown as LearningText)).toBe(true)
    expect(isDemotedPublishedText({ status: 'published', views: 2, sentences: [] } as unknown as LearningText)).toBe(
      false,
    )
    expect(
      isDemotedPublishedText({
        status: 'draft',
        views: 0,
        favoritesCount: 0,
        finalTranslations: { ja: { text: '朝', words: [] } },
        sentences: [],
      } as unknown as LearningText),
    ).toBe(true)
  })
})

describe('publishDraftFromScan', () => {
  beforeEach(stubStorage)

  it('keeps a published text in the library when the new natural lines are empty', async () => {
    const repos = createRepositories('mock')
    const existing = (await repos.texts.listPublished()).find((text) =>
      Object.values(text.finalTranslations).some((item) => item.text.trim()),
    )
    expect(existing).toBeTruthy()
    const targetLanguage = Object.keys(existing!.finalTranslations)[0]!
    const previous = existing!.finalTranslations[targetLanguage]!.text
    const scan = await scanFromLearningText(repos, existing!, targetLanguage)

    const stored = await publishDraftFromScan(repos, existing!, {
      analysis: scan.analysis,
      authorId: existing!.authorId,
      targetLanguage,
      finalLines: {},
    })

    expect(stored.status).toBe('published')
    expect(stored.finalTranslations[targetLanguage]?.text).toBe(previous)
    expect((await repos.texts.listPublished()).some((text) => text.id === existing!.id)).toBe(true)
  })
})

describe('restorePublishedDrafts', () => {
  beforeEach(stubStorage)

  it('returns demoted drafts to published and rebuilds wiped natural translations', async () => {
    const repos = createRepositories('mock')
    const source = (await repos.texts.listPublished()).find((text) =>
      text.sentences.some((sentence) => sentence.words.some((word) => word.selectedTranslationId)),
    )
    expect(source).toBeTruthy()
    await repos.texts.update({
      ...source!,
      status: 'draft',
      views: 0,
      favoritesCount: 0,
      dislikesCount: 0,
      editCount: 0,
      finalTranslations: {},
      translationProgress: 0.9,
    })

    expect((await repos.texts.listPublished()).some((text) => text.id === source!.id)).toBe(false)
    const restored = await restorePublishedDrafts(repos, source!.authorId)
    expect(restored).toBeGreaterThan(0)

    const again = await repos.texts.getById(source!.id)
    expect(again?.status).toBe('published')
    expect(Object.values(again?.finalTranslations ?? {}).some((item) => item.text.trim())).toBe(true)
  })
})

describe('applyFinalLines', () => {
  beforeEach(stubStorage)

  it('keeps the previous sentence when the new review omitted it', async () => {
    const repos = createRepositories('mock')
    const existing = (await repos.texts.listPublished()).find((text) =>
      Object.values(text.finalTranslations).some((item) => item.words.length > 0),
    )!
    const language = Object.keys(existing.finalTranslations)[0]!
    const previous = existing.finalTranslations[language]!.text
    const updated = applyFinalLines(existing, {}, language, existing.authorId)
    expect(updated.finalTranslations[language]?.text).toBe(previous)
  })
})
