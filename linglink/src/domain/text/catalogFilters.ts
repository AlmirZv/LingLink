import type { ID, LearningText, TextLevel, UserTextProgress } from '@/types/db'

export type ProgressFilter = 'all' | 'not_started' | 'in_progress' | 'completed'

export type KnownWordsFilter = 'all' | '0-25' | '25-50' | '50-75' | '75-100'

export interface TextCatalogFilters {
  level: TextLevel | 'all'
  topicId: ID | 'all'
  progress: ProgressFilter
  knownWords: KnownWordsFilter
}

export const DEFAULT_CATALOG_FILTERS: TextCatalogFilters = {
  level: 'all',
  topicId: 'all',
  progress: 'all',
  knownWords: 'all',
}

export function knownWordsRatio(knownCount: number, totalUnique: number): number {
  if (totalUnique <= 0) return 0
  return knownCount / totalUnique
}

export function matchesKnownWordsBucket(ratio: number, bucket: KnownWordsFilter): boolean {
  if (bucket === 'all') return true
  const pct = ratio * 100
  switch (bucket) {
    case '0-25':
      return pct < 25
    case '25-50':
      return pct >= 25 && pct < 50
    case '50-75':
      return pct >= 50 && pct < 75
    case '75-100':
      return pct >= 75
    default:
      return true
  }
}

export function progressCategory(userProgress: UserTextProgress | undefined): ProgressFilter {
  if (!userProgress || userProgress.progress <= 0) return 'not_started'
  if (userProgress.progress >= 1) return 'completed'
  return 'in_progress'
}

export function filterTexts(
  texts: LearningText[],
  filters: TextCatalogFilters,
  context: {
    progressByTextId: Map<ID, UserTextProgress>
    globalKnownWordIds: Set<ID>
  },
): LearningText[] {
  return texts.filter((text) => {
    if (filters.level !== 'all' && text.level !== filters.level) return false
    if (filters.topicId !== 'all' && !text.topics.includes(filters.topicId)) return false

    const userProgress = context.progressByTextId.get(text.id)
    const category = progressCategory(userProgress)
    if (filters.progress !== 'all' && category !== filters.progress) return false

    const knownInText = text.wordIds.filter((id) => context.globalKnownWordIds.has(id)).length
    const ratio = knownWordsRatio(knownInText, text.wordIds.length || text.uniqueWordCount)
    if (!matchesKnownWordsBucket(ratio, filters.knownWords)) return false

    return true
  })
}
