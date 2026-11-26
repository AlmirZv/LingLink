// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { LIBRARY_SNIPPET_LENGTH, librarySnippet } from '@/domain/text/librarySnippet'
import type { GrammarConstruction, LearningText, TextWordOccurrence, Word } from '@/types/db'

function word(id: string, language: string, surface: string): Word {
  return {
    id,
    language,
    word: surface,
    translations: {},
    type: 'noun',
    rootWords: [],
    grammarConstructions: [],
    createdBy: 'user',
    createdAt: '',
    updatedAt: '',
  }
}

function occurrence(
  text: string,
  wordId: string,
  translationId: string,
  selected = true,
): TextWordOccurrence {
  return {
    id: `occ-${text}`,
    sentenceId: 's',
    position: 0,
    text,
    wordId,
    occurrenceCount: 1,
    translations: [
      {
        id: `prop-${text}`,
        translationWordId: translationId,
        addedBy: 'user',
        addedAt: '',
        votes: { up: 0, down: 0 },
      },
    ],
    selectedTranslationId: selected ? `prop-${text}` : undefined,
  }
}

function textOf(body: string, words: TextWordOccurrence[] = []): LearningText {
  return {
    id: 'text',
    sentences: [{ id: 's', position: 0, text: body, words, constructions: [] }],
  } as unknown as LearningText
}

function plain(pieces: { text: string }[]): string {
  return pieces.map((piece) => piece.text).join('')
}

describe('librarySnippet', () => {
  const shop = word('word-mise-ja', 'ja', '店')
  const words = new Map([
    ['word-mise-ja', shop],
    ['word-magazin-ru', word('word-magazin-ru', 'ru', 'магазин')],
  ])

  it('keeps the opening and adds an ellipsis when the text is longer', () => {
    const body = 'а'.repeat(LIBRARY_SNIPPET_LENGTH + 20)
    const snippet = plain(librarySnippet(textOf(body), new Map(), new Set(), 'ja'))
    expect(snippet).toBe(`${'а'.repeat(LIBRARY_SNIPPET_LENGTH)}...`)
  })

  it('keeps original learning-language text and marks words that have a gloss', () => {
    const shopJa = { ...shop, translations: { ru: ['word-magazin-ru'] } }
    const text = {
      ...textOf('昨日、店でパンを買った。', [occurrence('店', 'word-mise-ja', 'word-magazin-ru')]),
      language: 'ja' as const,
    }
    const pieces = librarySnippet(
      text,
      new Map([
        ['word-mise-ja', shopJa],
        ['word-magazin-ru', word('word-magazin-ru', 'ru', 'магазин')],
      ]),
      new Set(),
      'ja',
      new Map(),
      new Set(),
      'ru',
    )
    expect(plain(pieces)).toBe('昨日、店でパンを買った。')
    expect(pieces.find((piece) => piece.text === '店')?.translated).toBe(true)
    expect(pieces.find((piece) => piece.text.includes('昨日'))?.translated).toBe(false)
  })

  it('shows a short text without an ellipsis', () => {
    expect(plain(librarySnippet(textOf('昨日、店でパンを買った。'), words, new Set(), 'ja'))).toBe(
      '昨日、店でパンを買った。',
    )
  })

  it('replaces a mastered word with the selected learning-language translation', () => {
    const body = 'Вчера я пошёл в магазин за хлебом.'
    const pieces = librarySnippet(
      textOf(body, [occurrence('магазин', 'word-magazin-ru', 'word-mise-ja')]),
      words,
      new Set(['word-mise-ja']),
      'ja',
    )
    expect(plain(pieces).startsWith('Вчера я пошёл в 店 за хлебом.')).toBe(true)
    expect(pieces.find((piece) => piece.text === '店')?.translated).toBe(true)
    expect(pieces.find((piece) => piece.text.includes('Вчера'))?.translated).toBe(false)
  })

  it('still shows a mastered translation if no proposal is selected', () => {
    const body = 'Вчера я пошёл в магазин за хлебом.'
    const pieces = librarySnippet(
      textOf(body, [occurrence('магазин', 'word-magazin-ru', 'word-mise-ja', false)]),
      words,
      new Set(['word-mise-ja']),
      'ja',
    )
    expect(plain(pieces)).toContain('店')
    expect(pieces.find((piece) => piece.text === '店')?.translated).toBe(true)
  })

  it('leaves the original word when that translation is not mastered', () => {
    const body = 'Вчера я пошёл в магазин за хлебом.'
    const pieces = librarySnippet(
      textOf(body, [occurrence('магазин', 'word-magazin-ru', 'word-mise-ja')]),
      words,
      new Set(),
      'ja',
    )
    expect(plain(pieces).startsWith(body)).toBe(true)
    expect(pieces.every((piece) => !piece.translated)).toBe(true)
  })

  it('shows a construction phrase only when its words are fully mastered', () => {
    const construction: GrammarConstruction = {
      id: 'gc-careful',
      language: 'ru',
      construction: '気を付けて',
      forms: ['будь осторожен'],
      translations: {},
      type: 'expression',
      wordIds: ['bud-ru', 'care-ru'],
      relatedWords: ['bud-ru', 'care-ru'],
      createdBy: 'user',
      createdAt: '',
      updatedAt: '',
    }
    const text = {
      language: 'ru',
      sentences: [
        {
          id: 's',
          position: 0,
          text: 'будь осторожен.',
          words: [
            { id: 'a', sentenceId: 's', position: 0, text: 'будь', wordId: 'bud-ru', occurrenceCount: 1, translations: [] },
            {
              id: 'b',
              sentenceId: 's',
              position: 1,
              text: 'осторожен',
              wordId: 'care-ru',
              occurrenceCount: 1,
              translations: [],
            },
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
    } as unknown as LearningText
    const constructions = new Map([[construction.id, construction]])
    const words = new Map<string, Word>()
    expect(plain(librarySnippet(text, words, new Set(), 'ja', constructions, new Set()))).toBe('будь осторожен.')
    const shown = librarySnippet(text, words, new Set(), 'ja', constructions, new Set(['gc-careful']))
    expect(plain(shown)).toBe('気を付けて.')
    expect(shown.find((piece) => piece.text === '気を付けて')?.translated).toBe(true)
  })
})
