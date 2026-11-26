import { sameAppearances } from '@/domain/words/textAppearances'
import type { GrammarConstruction, LearningText, TextSeries, Topic, Word } from '@/types/db'

import { buildSeedCatalog } from './seed'

export const MOCK_CATALOG_STORAGE_KEY = 'linglink.mock.catalog.v1'

const seed = buildSeedCatalog()
const seedWords = new Map(seed.words.map((word) => [word.id, word]))
const seedTexts = new Map(seed.texts.map((text) => [text.id, text]))
const SEED_TEXT_IDS = new Set(seed.texts.map((t) => t.id))
const SEED_TOPIC_IDS = new Set(seed.topics.map((t) => t.id))
const SEED_CONSTRUCTION_IDS = new Set(seed.constructions.map((c) => c.id))

function textSignature(text: LearningText): string {
  return JSON.stringify({
    title: text.title,
    status: text.status,
    views: text.views,
    favoritesCount: text.favoritesCount,
    dislikesCount: text.dislikesCount ?? 0,
    editCount: text.editCount ?? 0,
    commentsCount: text.commentsCount ?? 0,
    sentences: text.sentences,
    finalTranslations: text.finalTranslations,
  })
}

function textDivergedFromSeed(text: LearningText): boolean {
  const original = seedTexts.get(text.id)
  if (!original) return true
  return textSignature(text) !== textSignature(original)
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

/** Seed cards stay out of storage until a merge or edit changes them. */
function wordDivergedFromSeed(word: Word): boolean {
  const original = seedWords.get(word.id)
  if (!original) return true
  if (word.type !== original.type) return true
  if ((word.character ?? '') !== (original.character ?? '')) return true
  if ((word.furigana ?? '') !== (original.furigana ?? '')) return true
  if ((word.multilingualDictionary ?? '') !== (original.multilingualDictionary ?? '')) return true
  if (!sameIds(word.rootWords, original.rootWords)) return true
  if (!sameIds(word.grammarConstructions, original.grammarConstructions)) return true
  if (!sameAppearances(word.textAppearances, original.textAppearances)) return true
  const languages = new Set([...Object.keys(word.translations), ...Object.keys(original.translations)])
  for (const language of languages) {
    if (!sameIds(word.translations[language] ?? [], original.translations[language] ?? [])) return true
  }
  return false
}

export interface PersistedCatalog {
  texts: LearningText[]
  words: Word[]
  topics: Topic[]
  constructions: GrammarConstruction[]
  series: TextSeries[]
}

export function loadPersistedCatalog(): PersistedCatalog {
  try {
    const raw = localStorage.getItem(MOCK_CATALOG_STORAGE_KEY)
    if (!raw) return { texts: [], words: [], topics: [], constructions: [], series: [] }
    const parsed = JSON.parse(raw) as Partial<PersistedCatalog>
    return {
      texts: Array.isArray(parsed.texts) ? parsed.texts : [],
      words: Array.isArray(parsed.words) ? parsed.words : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      constructions: Array.isArray(parsed.constructions) ? parsed.constructions : [],
      series: Array.isArray(parsed.series) ? parsed.series : [],
    }
  } catch {
    return { texts: [], words: [], topics: [], constructions: [], series: [] }
  }
}

export function savePersistedCatalog(
  texts: LearningText[],
  words: Word[],
  topics: Topic[],
  constructions: GrammarConstruction[],
  series: TextSeries[] = [],
): void {
  const payload: PersistedCatalog = {
    texts: texts.filter((text) => textDivergedFromSeed(text)),
    words: words.filter((word) => wordDivergedFromSeed(word)),
    topics: topics.filter((t) => !SEED_TOPIC_IDS.has(t.id)),
    constructions: constructions.filter((c) => !SEED_CONSTRUCTION_IDS.has(c.id)),
    series,
  }
  localStorage.setItem(MOCK_CATALOG_STORAGE_KEY, JSON.stringify(payload))
}

export function isSeedTextId(id: string): boolean {
  return SEED_TEXT_IDS.has(id)
}
