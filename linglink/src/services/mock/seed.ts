import type {
  GrammarConstruction,
  LearningText,
  TextRatings,
  TextSentence,
  TextWordOccurrence,
  Topic,
  User,
  UserTextProgress,
  UserWordProgress,
  Word,
  WordTranslationProposal,
} from '@/types/db'

import { DEMO_CONTRIBUTOR_ID, DEMO_USER_ID } from './constants'

const ts = '2026-01-01T00:00:00.000Z'

function ratingEmpty(): TextRatings {
  const empty = { average: 0, count: 0 }
  return {
    usefulness: { ...empty },
    interestingness: { ...empty },
    uniqueness: { ...empty },
    learningValue: { ...empty },
    totalVotes: 0,
  }
}

function proposal(id: string, translationWordId: string, addedBy = DEMO_USER_ID): WordTranslationProposal {
  return {
    id,
    translationWordId,
    addedBy,
    addedAt: ts,
    votes: { up: 3, down: 0 },
  }
}

function occ(
  id: string,
  sentenceId: string,
  position: number,
  text: string,
  wordId: string,
  occurrenceCount: number,
  translationWordId: string,
  proposalId: string,
  addedBy = DEMO_USER_ID,
): TextWordOccurrence {
  const translations = [proposal(proposalId, translationWordId, addedBy)]
  return {
    id,
    sentenceId,
    position,
    wordId,
    text,
    occurrenceCount,
    translations,
    selectedTranslationId: proposalId,
  }
}

export interface SeedCatalog {
  words: Word[]
  constructions: GrammarConstruction[]
  topics: Topic[]
  texts: LearningText[]
  users: User[]
  wordProgress: UserWordProgress[]
  textProgress: UserTextProgress[]
}

export function buildSeedCatalog(): SeedCatalog {
  const topics: Topic[] = [
    { id: 'topic-travel', name: 'Путешествия', language: 'ru', createdBy: DEMO_USER_ID, createdAt: ts },
    { id: 'topic-daily', name: 'Быт', language: 'ru', createdBy: DEMO_USER_ID, createdAt: ts },
  ]

  const words: Word[] = [
    {
      id: 'word-utro-ru',
      language: 'ru',
      word: 'утро',
      translations: { ja: ['word-asa-ja'] },
      type: 'noun',
      rootWords: [],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-gorod-ru',
      language: 'ru',
      word: 'город',
      translations: { ja: ['word-machi-ja'] },
      type: 'noun',
      rootWords: [],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-idti-ru',
      language: 'ru',
      word: 'идти',
      translations: { ja: ['word-iku-ja'] },
      type: 'verb',
      rootWords: ['word-shli-ru'],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-shli-ru',
      language: 'ru',
      word: 'шли',
      translations: { ja: ['word-itta-ja'] },
      type: 'verb',
      rootWords: ['word-idti-ru'],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-magazin-ru',
      language: 'ru',
      word: 'магазин',
      translations: { ja: ['word-mise-ja'] },
      type: 'noun',
      rootWords: [],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-hleb-ru',
      language: 'ru',
      word: 'хлеб',
      translations: { ja: ['word-pan-ja'] },
      type: 'noun',
      rootWords: [],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-asa-ja',
      language: 'ja',
      word: '朝',
      character: '朝',
      furigana: 'あさ',
      translations: { ru: ['word-utro-ru'] },
      type: 'noun',
      rootWords: [],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-machi-ja',
      language: 'ja',
      word: '街',
      character: '街',
      furigana: 'まち',
      translations: { ru: ['word-gorod-ru'] },
      type: 'noun',
      rootWords: [],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-iku-ja',
      language: 'ja',
      word: '行く',
      character: '行',
      furigana: 'いく',
      translations: { ru: ['word-idti-ru'] },
      type: 'verb',
      rootWords: [],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-itta-ja',
      language: 'ja',
      word: '行った',
      character: '行',
      furigana: 'いった',
      translations: { ru: ['word-shli-ru'] },
      type: 'verb',
      rootWords: ['word-iku-ja'],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-mise-ja',
      language: 'ja',
      word: '店',
      character: '店',
      furigana: 'みせ',
      translations: { ru: ['word-magazin-ru'] },
      type: 'noun',
      rootWords: [],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-pan-ja',
      language: 'ja',
      word: 'パン',
      translations: { ru: ['word-hleb-ru'] },
      type: 'noun',
      rootWords: [],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-kinou-ja',
      language: 'ja',
      word: '昨日',
      character: '昨日',
      furigana: 'きのう',
      translations: { ru: ['word-vchera-gloss-ru'] },
      type: 'adverb',
      rootWords: [],
      grammarConstructions: ['gc-kinou'],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-katta-ja',
      language: 'ja',
      word: '買った',
      character: '買',
      furigana: 'かった',
      translations: { ru: ['word-kupil-gloss-ru'] },
      type: 'verb',
      rootWords: [],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-vchera-gloss-ru',
      language: 'ru',
      word: 'вчера',
      translations: { ja: ['word-kinou-ja'] },
      type: 'adverb',
      rootWords: [],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'word-kupil-gloss-ru',
      language: 'ru',
      word: 'купил',
      translations: { ja: ['word-katta-ja'] },
      type: 'verb',
      rootWords: [],
      grammarConstructions: [],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
  ]

  const constructions: GrammarConstruction[] = [
    {
      id: 'gc-kinou',
      language: 'ja',
      construction: '昨日',
      forms: ['昨日'],
      translations: { ru: ['word-kinou-ja'] },
      type: 'expression',
      relatedWords: ['word-kinou-ja'],
      createdBy: DEMO_USER_ID,
      createdAt: ts,
      updatedAt: ts,
    },
  ]

  const s1Id = 'sent-t1-0'
  const s2Id = 'sent-t1-1'
  const sentencesT1: TextSentence[] = [
    {
      id: s1Id,
      position: 0,
      text: 'Ранним утром мы шли по городу.',
      words: [
        occ('occ-t1-utro', s1Id, 2, 'утром', 'word-utro-ru', 1, 'word-asa-ja', 'prop-t1-utro'),
        occ('occ-t1-shli', s1Id, 4, 'шли', 'word-shli-ru', 1, 'word-itta-ja', 'prop-t1-shli'),
        occ('occ-t1-gorod', s1Id, 6, 'городу', 'word-gorod-ru', 1, 'word-machi-ja', 'prop-t1-gorod'),
      ],
      constructions: [],
    },
    {
      id: s2Id,
      position: 1,
      text: 'Солнце только поднималось над крышами.',
      words: [],
      constructions: [],
    },
  ]

  const text1: LearningText = {
    id: 'text-morning-city',
    title: 'Утро в городе',
    language: 'ru',
    authorId: DEMO_USER_ID,
    coAuthorIds: [],
    topics: ['topic-daily'],
    level: 'beginner',
    wordIds: ['word-utro-ru', 'word-shli-ru', 'word-gorod-ru'],
    constructionIds: [],
    sentences: sentencesT1,
    finalTranslations: {},
    translationProgress: 0.85,
    uniqueWordCount: 3,
    sentenceCount: 2,
    status: 'published',
    ratings: ratingEmpty(),
    views: 12,
    favoritesCount: 1,
    editCount: 0,
    createdAt: ts,
    updatedAt: ts,
  }

  const s3Id = 'sent-t2-0'
  const sentencesT2: TextSentence[] = [
    {
      id: s3Id,
      position: 0,
      text: 'Вчера я пошёл в магазин за хлебом.',
      words: [
        occ('occ-t2-mag', s3Id, 4, 'магазин', 'word-magazin-ru', 1, 'word-mise-ja', 'prop-t2-mag'),
        occ('occ-t2-hleb', s3Id, 6, 'хлебом', 'word-hleb-ru', 1, 'word-pan-ja', 'prop-t2-hleb'),
      ],
      constructions: [],
    },
  ]

  const text2: LearningText = {
    id: 'text-bread-run',
    title: 'За хлебом',
    language: 'ru',
    authorId: DEMO_USER_ID,
    coAuthorIds: [],
    topics: ['topic-daily'],
    level: 'intermediate',
    wordIds: ['word-magazin-ru', 'word-hleb-ru', 'word-idti-ru'],
    constructionIds: [],
    sentences: sentencesT2,
    finalTranslations: {},
    translationProgress: 0.62,
    uniqueWordCount: 3,
    sentenceCount: 1,
    status: 'published',
    ratings: ratingEmpty(),
    views: 5,
    favoritesCount: 0,
    editCount: 0,
    createdAt: ts,
    updatedAt: ts,
  }

  const js1 = 'sent-t3-0'
  const sentencesT3: TextSentence[] = [
    {
      id: js1,
      position: 0,
      text: '昨日、店でパンを買った。',
      words: [
        occ('occ-t3-kinou', js1, 0, '昨日', 'word-kinou-ja', 1, 'word-vchera-gloss-ru', 'prop-t3-kinou'),
        occ('occ-t3-mise', js1, 2, '店', 'word-mise-ja', 1, 'word-magazin-ru', 'prop-t3-mise'),
        occ('occ-t3-pan', js1, 3, 'パン', 'word-pan-ja', 1, 'word-hleb-ru', 'prop-t3-pan'),
        occ('occ-t3-katta', js1, 5, '買った', 'word-katta-ja', 1, 'word-kupil-gloss-ru', 'prop-t3-katta'),
      ],
      constructions: [
        {
          startPosition: 0,
          endPosition: 0,
          constructionId: 'gc-kinou',
          text: '昨日',
          translations: [],
        },
      ],
    },
  ]

  const text3: LearningText = {
    id: 'text-yesterday-bread-ja',
    title: '昨日のパン',
    language: 'ja',
    authorId: DEMO_USER_ID,
    coAuthorIds: [],
    topics: ['topic-travel'],
    level: 'beginner',
    wordIds: ['word-kinou-ja', 'word-mise-ja', 'word-pan-ja', 'word-katta-ja'],
    constructionIds: ['gc-kinou'],
    sentences: sentencesT3,
    finalTranslations: {
      ru: {
        text: 'Вчера в магазине купил хлеб.',
        words: [
          { text: 'Вчера', sourceOccurrenceIds: ['occ-t3-kinou'] },
          { text: 'магазине', sourceOccurrenceIds: ['occ-t3-mise'] },
          { text: 'хлеб', sourceOccurrenceIds: ['occ-t3-pan'] },
          { text: 'купил', sourceOccurrenceIds: ['occ-t3-katta'] },
        ],
        addedBy: DEMO_USER_ID,
        addedAt: ts,
        alternatives: [],
      },
    },
    translationProgress: 0.4,
    uniqueWordCount: 4,
    sentenceCount: 1,
    status: 'published',
    ratings: ratingEmpty(),
    views: 2,
    favoritesCount: 0,
    editCount: 0,
    createdAt: ts,
    updatedAt: ts,
  }

  const walkId = 'sent-t4-0'
  const sentencesT4: TextSentence[] = [
    {
      id: walkId,
      position: 0,
      text: '朝、街へ行った。',
      words: [
        occ('occ-t4-asa', walkId, 0, '朝', 'word-asa-ja', 1, 'word-utro-ru', 'prop-t4-asa', DEMO_CONTRIBUTOR_ID),
        occ('occ-t4-machi', walkId, 1, '街', 'word-machi-ja', 1, 'word-gorod-ru', 'prop-t4-machi', DEMO_CONTRIBUTOR_ID),
        occ('occ-t4-itta', walkId, 2, '行った', 'word-itta-ja', 1, 'word-idti-ru', 'prop-t4-itta', DEMO_CONTRIBUTOR_ID),
      ],
      constructions: [],
    },
  ]

  const text4: LearningText = {
    id: 'text-morning-walk',
    title: 'Утренняя прогулка',
    language: 'ja',
    authorId: DEMO_CONTRIBUTOR_ID,
    coAuthorIds: [],
    topics: ['topic-daily'],
    level: 'beginner',
    wordIds: ['word-asa-ja', 'word-machi-ja', 'word-itta-ja'],
    constructionIds: [],
    sentences: sentencesT4,
    finalTranslations: {
      ru: {
        text: 'Утром пошёл в город.',
        words: [
          { text: 'Утром', sourceOccurrenceIds: ['occ-t4-asa'] },
          { text: 'пошёл', sourceOccurrenceIds: ['occ-t4-itta'] },
          { text: 'город', sourceOccurrenceIds: ['occ-t4-machi'] },
        ],
        addedBy: DEMO_CONTRIBUTOR_ID,
        addedAt: ts,
        alternatives: [],
      },
    },
    translationProgress: 1,
    uniqueWordCount: 3,
    sentenceCount: 1,
    status: 'published',
    ratings: ratingEmpty(),
    views: 8,
    favoritesCount: 3,
    editCount: 0,
    createdAt: ts,
    updatedAt: ts,
  }

  const users: User[] = [
    {
      id: DEMO_USER_ID,
      displayName: 'админ',
      interfaceLanguage: 'ru',
      learningLanguages: ['ja'],
      knownLanguages: ['ru'],
      createdAt: ts,
    },
    {
      id: DEMO_CONTRIBUTOR_ID,
      displayName: 'админ',
      interfaceLanguage: 'en',
      learningLanguages: ['ja'],
      knownLanguages: ['en', 'ru'],
      createdAt: ts,
    },
  ]

  const wordProgress: UserWordProgress[] = [
    { userId: DEMO_USER_ID, wordId: 'word-utro-ru', level: 1, updatedAt: ts },
    { userId: DEMO_USER_ID, wordId: 'word-gorod-ru', level: 1, updatedAt: ts },
  ]

  const textProgress: UserTextProgress[] = [
    {
      userId: DEMO_USER_ID,
      textId: 'text-morning-city',
      learnedWordIds: ['word-utro-ru'],
      learnedConstructionIds: [],
      currentStep: 1,
      progress: 0.33,
      updatedAt: ts,
    },
  ]

  return {
    words,
    constructions,
    topics,
    texts: [text1, text2, text3, text4],
    users,
    wordProgress,
    textProgress,
  }
}
