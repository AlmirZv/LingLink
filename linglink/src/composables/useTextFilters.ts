import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { TEXT_LEVELS } from '@/constants/textLevels'
import {
  DEFAULT_CATALOG_FILTERS,
  filterTexts,
  type KnownWordsFilter,
  type ProgressFilter,
  type TextCatalogFilters,
} from '@/domain/text/catalogFilters'
import type { ID, LearningText, TextLevel, UserTextProgress } from '@/types/db'

function parseLevel(value: unknown): TextLevel | 'all' {
  const levels: TextLevel[] = TEXT_LEVELS
  return typeof value === 'string' && (levels as string[]).includes(value) ? (value as TextLevel) : 'all'
}

function parseProgress(value: unknown): ProgressFilter {
  const allowed: ProgressFilter[] = ['all', 'not_started', 'in_progress', 'completed']
  return typeof value === 'string' && allowed.includes(value as ProgressFilter)
    ? (value as ProgressFilter)
    : 'all'
}

function parseKnown(value: unknown): KnownWordsFilter {
  const allowed: KnownWordsFilter[] = ['all', '0-25', '25-50', '50-75', '75-100']
  return typeof value === 'string' && allowed.includes(value as KnownWordsFilter)
    ? (value as KnownWordsFilter)
    : 'all'
}

function filtersFromRoute(query: Record<string, unknown>): TextCatalogFilters {
  return {
    level: parseLevel(query.level),
    topicId: typeof query.topic === 'string' && query.topic ? query.topic : 'all',
    progress: parseProgress(query.progress),
    knownWords: parseKnown(query.known),
  }
}

export function useTextFilters() {
  const route = useRoute()
  const router = useRouter()

  const filters = computed(() => filtersFromRoute(route.query))

  function applyFilters(next: Partial<TextCatalogFilters>) {
    const merged = { ...filters.value, ...next }
    void router.replace({
      query: {
        ...route.query,
        level: merged.level === 'all' ? undefined : merged.level,
        topic: merged.topicId === 'all' ? undefined : merged.topicId,
        progress: merged.progress === 'all' ? undefined : merged.progress,
        known: merged.knownWords === 'all' ? undefined : merged.knownWords,
      },
    })
  }

  function resetFilters() {
    const { word } = route.query
    void router.replace({ query: typeof word === 'string' && word ? { word } : {} })
  }

  function applyToTexts(
    texts: LearningText[],
    progressByTextId: Map<ID, UserTextProgress>,
    globalKnownWordIds: Set<ID>,
  ): LearningText[] {
    return filterTexts(texts, filters.value, { progressByTextId, globalKnownWordIds })
  }

  return {
    filters,
    defaultFilters: DEFAULT_CATALOG_FILTERS,
    applyFilters,
    resetFilters,
    applyToTexts,
  }
}
