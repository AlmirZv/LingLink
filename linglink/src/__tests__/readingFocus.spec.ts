// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  READING_BATCH_SIZE,
  currentReadingWindow,
  rankReadingWords,
  renderFinalReadingText,
  renderReadingText,
  revealedReadingWords,
} from '@/domain/text/readingFocus'
import type { GrammarConstruction, LearningText, TextWordOccurrence, Word } from '@/types/db'

function word(id: string, language: 'ja' | 'ru', surface: string): Word {
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
  translationId?: string,
  position = 0,
): TextWordOccurrence {
  return {
    id: `occ-${text}-${position}`,
    sentenceId: 's',
    position,
    wordId,
    text,
    occurrenceCount: 1,
    translations: translationId
      ? [
          {
            id: `prop-${text}-${position}`,
            translationWordId: translationId,
            addedBy: 'user',
            addedAt: '',
            votes: { up: 0, down: 0 },
          },
        ]
      : [],
    selectedTranslationId: translationId ? `prop-${text}-${position}` : undefined,
  }
}

function textOf(sentences: { text: string; words: TextWordOccurrence[] }[]): LearningText {
  return {
    id: 'text',
    sentences: sentences.map((sentence, position) => ({
      id: `s-${position}`,
      position,
      text: sentence.text,
      words: sentence.words,
      constructions: [],
    })),
  } as unknown as LearningText
}

describe('rankReadingWords', () => {
  const shop = word('shop-ja', 'ja', '店')
  const bread = word('bread-ja', 'ja', 'パン')
  const morning = word('morning-ja', 'ja', '朝')
  const words = new Map<string, Word>([
    ['shop-ja', shop],
    ['bread-ja', bread],
    ['morning-ja', morning],
    ['shop-ru', word('shop-ru', 'ru', 'магазин')],
    ['bread-ru', word('bread-ru', 'ru', 'хлеб')],
    ['morning-ru', word('morning-ru', 'ru', 'утро')],
  ])

  it('orders words that have a translation by how often they occur', () => {
    const text = textOf([
      {
        text: 'хлеб и магазин и хлеб',
        words: [
          occurrence('хлеб', 'bread-ru', 'bread-ja', 0),
          occurrence('магазин', 'shop-ru', 'shop-ja', 1),
          occurrence('хлеб', 'bread-ru', 'bread-ja', 2),
        ],
      },
    ])
    const ranked = rankReadingWords(text, words, new Set(), 'ja')
    expect(ranked.map((item) => item.learningWord.id)).toEqual(['bread-ja', 'shop-ja'])
    expect(ranked[0]).toMatchObject({ original: 'хлеб', count: 2 })
  })

  it('skips mastered words and words without a translation', () => {
    const text = textOf([
      {
        text: 'магазин хлеб утро',
        words: [
          occurrence('магазин', 'shop-ru', 'shop-ja', 0),
          occurrence('хлеб', 'bread-ru', undefined, 1),
          occurrence('утро', 'morning-ru', 'morning-ja', 2),
        ],
      },
    ])
    const ranked = rankReadingWords(text, words, new Set(['shop-ja']), 'ja')
    expect(ranked.map((item) => item.original)).toEqual(['утро'])
  })

  it('uses the source word when the text is already in the learning language', () => {
    const text = textOf([
      {
        text: '朝',
        words: [occurrence('朝', 'morning-ja', 'morning-ru', 0)],
      },
    ])
    const ranked = rankReadingWords(text, words, new Set(), 'ja')
    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.learningWord.word).toBe('朝')
    expect(ranked[0]?.original).toBe('朝')
  })

  it('pairs a learning-language word with the known-language gloss', () => {
    const text = textOf([
      {
        text: '朝',
        words: [occurrence('朝', 'morning-ja', 'morning-ru', 0)],
      },
    ])
    const forRussian = rankReadingWords(text, words, new Set(), 'ja', new Map(), new Set(), 'ru')
    expect(forRussian[0]?.learningWord.word).toBe('朝')
    expect(forRussian[0]?.original).toBe('утро')

    const forJapanese = rankReadingWords(text, words, new Set(), 'ru', new Map(), new Set(), 'ja')
    expect(forJapanese[0]?.learningWord.word).toBe('утро')
    expect(forJapanese[0]?.original).toBe('朝')
  })

  it('keeps the most frequent surface', () => {
    const text = textOf([
      {
        text: 'магазине магазин магазин утро',
        words: [
          occurrence('магазине', 'shop-ru', 'shop-ja', 0),
          occurrence('магазин', 'shop-ru', 'shop-ja', 1),
          occurrence('магазин', 'shop-ru', 'shop-ja', 2),
          occurrence('утро', 'morning-ru', 'morning-ja', 3),
        ],
      },
    ])
    const ranked = rankReadingWords(text, words, new Set(), 'ja')
    expect(ranked[0]).toMatchObject({ original: 'магазин', count: 3 })
    expect(ranked.map((item) => item.learningWord.id)).toEqual(['shop-ja', 'morning-ja'])
  })

  it('keeps a same-root family as one slot and lists every form', () => {
    const go = word('go-ja', 'ja', '行く')
    const went = word('went-ja', 'ja', '行った')
    const walk = word('walk-ru', 'ru', 'идти')
    const walked = word('walked-ru', 'ru', 'шли')
    walk.rootWords = ['walked-ru']
    walked.rootWords = ['walk-ru']
    const familyWords = new Map<string, Word>([
      ['go-ja', go],
      ['went-ja', went],
      ['walk-ru', walk],
      ['walked-ru', walked],
      ['shop-ja', shop],
      ['shop-ru', words.get('shop-ru')!],
    ])
    const text = textOf([
      {
        text: 'шли в магазин идти',
        words: [
          occurrence('шли', 'walked-ru', 'went-ja', 0),
          occurrence('магазин', 'shop-ru', 'shop-ja', 1),
          occurrence('идти', 'walk-ru', 'go-ja', 2),
        ],
      },
    ])
    const ranked = rankReadingWords(text, familyWords, new Set(), 'ja')
    expect(ranked).toHaveLength(2)
    expect(ranked[0]?.count).toBe(2)
    expect(ranked[0]?.members.map((member) => member.learningWord.id)).toEqual(['went-ja', 'go-ja'])
    expect(ranked[1]?.learningWord.id).toBe('shop-ja')
  })

  it('does not group words that are not linked', () => {
    const text = textOf([
      {
        text: 'магазин утро',
        words: [
          occurrence('магазин', 'shop-ru', 'shop-ja', 0),
          occurrence('утро', 'morning-ru', 'morning-ja', 1),
        ],
      },
    ])
    const ranked = rankReadingWords(text, words, new Set(), 'ja')
    expect(ranked).toHaveLength(2)
    expect(ranked.every((item) => item.members.length === 1)).toBe(true)
  })

  it('shows a grammatical construction as one slot', () => {
    const be = word('bud-ru', 'ru', 'будь')
    const careful = word('care-ru', 'ru', 'осторожен')
    be.grammarConstructions = ['gc-careful']
    careful.grammarConstructions = ['gc-careful']
    const construction: GrammarConstruction = {
      id: 'gc-careful',
      language: 'ru',
      construction: '気を付けて',
      furigana: 'きをつけて',
      forms: ['будь осторожен'],
      translations: {},
      type: 'expression',
      wordIds: ['bud-ru', 'care-ru'],
      relatedWords: ['bud-ru', 'care-ru'],
      createdBy: 'user',
      createdAt: '',
      updatedAt: '',
    }
    const text = textOf([
      {
        text: 'будь осторожен',
        words: [occurrence('будь', 'bud-ru', undefined, 0), occurrence('осторожен', 'care-ru', undefined, 1)],
      },
    ])
    const ranked = rankReadingWords(
      text,
      new Map([
        ['bud-ru', be],
        ['care-ru', careful],
      ]),
      new Set(),
      'ja',
      new Map([[construction.id, construction]]),
    )
    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.learningWord.word).toBe('気を付けて')
    expect(ranked[0]?.learningWord.furigana).toBe('きをつけて')
    expect(ranked[0]?.original).toBe('будь осторожен')
    expect(ranked[0]?.count).toBe(1)
  })

  it('does not treat a construction id stored as a word as already mastered', () => {
    const be = word('bud-ru', 'ru', 'будь')
    const careful = word('care-ru', 'ru', 'осторожен')
    be.grammarConstructions = ['gc-careful']
    careful.grammarConstructions = ['gc-careful']
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
    const text = textOf([
      {
        text: 'будь осторожен',
        words: [occurrence('будь', 'bud-ru', undefined, 0), occurrence('осторожен', 'care-ru', undefined, 1)],
      },
    ])
    const ranked = rankReadingWords(
      text,
      new Map([
        ['bud-ru', be],
        ['care-ru', careful],
      ]),
      new Set(['gc-careful']),
      'ja',
      new Map([[construction.id, construction]]),
    )
    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.learningWord.word).toBe('気を付けて')
  })

  it('breaks equal counts by the first appearance in the text', () => {
    const text = textOf([
      {
        text: 'утро магазин',
        words: [
          occurrence('утро', 'morning-ru', 'morning-ja', 0),
          occurrence('магазин', 'shop-ru', 'shop-ja', 1),
        ],
      },
    ])
    const ranked = rankReadingWords(text, words, new Set(), 'ja')
    expect(ranked.map((item) => item.original)).toEqual(['утро', 'магазин'])
  })
})

describe('reading windows', () => {
  const words = Array.from({ length: 7 }, (_, index) => {
    const learningWord = word(`w-${index}`, 'ja', `w${index}`)
    return {
      learningWord,
      original: `o${index}`,
      count: 7 - index,
      members: [{ learningWord, original: `o${index}` }],
    }
  })

  it('reveals the first five, then the next batch', () => {
    expect(READING_BATCH_SIZE).toBe(5)
    expect(currentReadingWindow(words, 5).map((item) => item.original)).toEqual([
      'o0',
      'o1',
      'o2',
      'o3',
      'o4',
    ])
    expect(revealedReadingWords(words, 10)).toHaveLength(7)
    expect(currentReadingWindow(words, 10).map((item) => item.original)).toEqual(['o5', 'o6'])
  })
})

describe('renderReadingText', () => {
  const shop = word('shop-ja', 'ja', '店')
  const bread = word('bread-ja', 'ja', 'パン')
  const words = new Map<string, Word>([
    ['shop-ja', shop],
    ['bread-ja', bread],
    ['shop-ru', word('shop-ru', 'ru', 'магазин')],
    ['bread-ru', word('bread-ru', 'ru', 'хлеб')],
  ])

  it('in an original learning-language text highlights only words that have a gloss', () => {
    const shopJa = { ...shop, translations: { ru: ['shop-ru'] } }
    const text = {
      ...textOf([
        {
          text: '店とパン',
          words: [occurrence('店', 'shop-ja', 'shop-ru', 0), occurrence('パン', 'bread-ja', undefined, 1)],
        },
      ]),
      language: 'ja' as const,
    }
    const pieces = renderReadingText(
      text,
      new Map([...words, ['shop-ja', shopJa]]),
      new Set(['shop-ja']),
      new Set(),
      'ja',
      new Map(),
      'ru',
    )
    expect(pieces.map((piece) => piece.text).join('')).toBe('店とパン')
    expect(pieces.find((piece) => piece.text === '店')?.kind).toBe('study')
    expect(pieces.find((piece) => piece.text === '店')?.hint?.translation).toBe('магазин')
    expect(pieces.find((piece) => piece.text === 'パン')?.kind).toBe('plain')
    expect(pieces.find((piece) => piece.text === 'パン')?.hint).toBeUndefined()
  })

  it('shows mastered words and the study batch in the learning language', () => {
    const text = textOf([
      {
        text: 'В магазин за хлебом и сыром.',
        words: [
          occurrence('магазин', 'shop-ru', 'shop-ja', 0),
          occurrence('хлебом', 'bread-ru', 'bread-ja', 1),
        ],
      },
    ])
    const pieces = renderReadingText(text, words, new Set(['shop-ja']), new Set(['bread-ja']), 'ja')
    expect(pieces.map((piece) => piece.text).join('')).toBe('В 店 за パン и сыром.')
    expect(pieces.find((piece) => piece.text === '店')?.kind).toBe('known')
    expect(pieces.find((piece) => piece.text === 'パン')?.kind).toBe('study')
  })

  it('replaces a revealed construction with its phrase', () => {
    const be = word('bud-ru', 'ru', 'будь')
    const careful = word('care-ru', 'ru', 'осторожен')
    be.grammarConstructions = ['gc-careful']
    careful.grammarConstructions = ['gc-careful']
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
    const text = textOf([
      {
        text: 'будь осторожен.',
        words: [occurrence('будь', 'bud-ru', undefined, 0), occurrence('осторожен', 'care-ru', undefined, 1)],
      },
    ])
    const words = new Map<string, Word>([
      ['bud-ru', be],
      ['care-ru', careful],
    ])
    const constructions = new Map([[construction.id, construction]])
    const hidden = renderReadingText(text, words, new Set(), new Set(), 'ja', constructions)
    expect(hidden.map((piece) => piece.text).join('')).toBe('будь осторожен.')
    const shown = renderReadingText(text, words, new Set(), new Set(['gc-careful']), 'ja', constructions)
    expect(shown.map((piece) => piece.text).join('')).toBe('気を付けて.')
    expect(shown.find((piece) => piece.text === '気を付けて')?.kind).toBe('study')
    expect(shown.find((piece) => piece.text === '気を付けて')?.hint).toEqual({ translation: 'будь осторожен' })
    const known = renderReadingText(
      text,
      words,
      new Set(['gc-careful']),
      new Set(),
      'ja',
      constructions,
      undefined,
      new Set(['gc-careful']),
    )
    expect(known.find((piece) => piece.text === '気を付けて')?.kind).toBe('known')
    const notKnown = renderReadingText(text, words, new Set(['gc-careful']), new Set(), 'ja', constructions)
    expect(notKnown.map((piece) => piece.text).join('')).toBe('будь осторожен.')
  })

  it('attaches the source gloss and furigana to a revealed word', () => {
    const shop = word('shop-ja', 'ja', '店')
    shop.furigana = 'みせ'
    const text = textOf([
      {
        text: 'В магазин.',
        words: [occurrence('магазин', 'shop-ru', 'shop-ja', 0)],
      },
    ])
    const pieces = renderReadingText(
      text,
      new Map<string, Word>([
        ['shop-ja', shop],
        ['shop-ru', word('shop-ru', 'ru', 'магазин')],
      ]),
      new Set(),
      new Set(['shop-ja']),
      'ja',
    )
    const revealed = pieces.find((piece) => piece.text === '店')
    expect(revealed?.hint).toEqual({ translation: 'магазин', furigana: 'みせ' })
  })
})

describe('renderFinalReadingText', () => {
  it('shows winning sentence finals instead of word substitutions', () => {
    const text = textOf([
      {
        text: 'В магазин за хлебом.',
        words: [
          occurrence('магазин', 'shop-ru', 'shop-ja', 0),
          occurrence('хлебом', 'bread-ru', 'bread-ja', 1),
        ],
      },
      {
        text: 'Утро.',
        words: [occurrence('Утро', 'morning-ru', 'morning-ja', 0)],
      },
    ])
    text.sentences[0]!.finalProposals = {
      ja: [
        {
          id: 'a',
          text: '店にパンを買いに行った。',
          addedBy: 'u1',
          addedAt: '2026-01-01T00:00:00.000Z',
          likedBy: ['x', 'y'],
          sentenceId: text.sentences[0]!.id,
        },
        {
          id: 'b',
          text: '店へ。',
          addedBy: 'u2',
          addedAt: '2026-01-01T00:00:00.000Z',
          likedBy: [],
          sentenceId: text.sentences[0]!.id,
        },
      ],
    }
    text.sentences[1]!.finalProposals = {
      ja: [
        {
          id: 'c',
          text: '朝。',
          addedBy: 'u1',
          addedAt: '2026-01-01T00:00:00.000Z',
          likedBy: [],
          sentenceId: text.sentences[1]!.id,
        },
      ],
    }
    expect(renderFinalReadingText(text, 'ja').map((piece) => piece.text).join('')).toBe(
      '店にパンを買いに行った。 朝。',
    )
  })
})
