import { ref } from 'vue'

import { useRepositories } from '@/composables/useRepositories'
import { wordMatchesQuery } from '@/domain/words/characterReading'
import type { LearningText } from '@/types/db'

export type TextSearchField = 'word' | 'construction' | 'topic' | 'title'

const SEARCH_FIELDS: TextSearchField[] = ['word', 'construction', 'topic', 'title']

export function isTextSearchField(value: unknown): value is TextSearchField {
  return typeof value === 'string' && (SEARCH_FIELDS as string[]).includes(value)
}

function includesIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

function collectLinkedWordIds(text: LearningText): string[] {
  const ids = new Set<string>()
  for (const id of text.wordIds) ids.add(id)
  for (const sentence of text.sentences) {
    for (const word of sentence.words) {
      if (word.wordId) ids.add(word.wordId)
      for (const proposal of word.translations) {
        if (proposal.translationWordId) ids.add(proposal.translationWordId)
      }
    }
  }
  for (const final of Object.values(text.finalTranslations)) {
    for (const word of final.words) {
      if (word.wordId) ids.add(word.wordId)
    }
  }
  return [...ids]
}

export function textMatchesWordQuery(text: LearningText, query: string): boolean {
  const needle = query.trim()
  if (!needle) return false
  for (const sentence of text.sentences) {
    if (includesIgnoreCase(sentence.text, needle)) return true
    for (const word of sentence.words) {
      if (includesIgnoreCase(word.text, needle)) return true
    }
  }
  for (const final of Object.values(text.finalTranslations)) {
    if (includesIgnoreCase(final.text, needle)) return true
    for (const word of final.words) {
      if (includesIgnoreCase(word.text, needle)) return true
    }
  }
  return false
}

export function useTextSearch() {
  const repos = useRepositories()
  const loading = ref(false)

  async function search(query: string, field: TextSearchField): Promise<LearningText[]> {
    const q = query.trim()
    if (!q) return []

    loading.value = true
    try {
      const catalog = await repos.texts.listPublished()

      if (field === 'title') {
        return catalog.filter((text) => includesIgnoreCase(text.title, q))
      }

      if (field === 'word') {
        const linkedIds = [...new Set(catalog.flatMap(collectLinkedWordIds))]
        const dictHits = new Set(
          (await repos.words.listByIds(linkedIds))
            .filter((word) => wordMatchesQuery(word, q))
            .map((word) => word.id),
        )
        return catalog.filter((text) => {
          if (textMatchesWordQuery(text, q)) return true
          return collectLinkedWordIds(text).some((id) => dictHits.has(id))
        })
      }

      if (field === 'construction') {
        return catalog.filter((text) =>
          text.sentences.some((sentence) =>
            sentence.constructions.some((item) => includesIgnoreCase(item.text, q)),
          ),
        )
      }

      const topics = await repos.topics.list()
      const topicIds = new Set(
        topics.filter((topic) => includesIgnoreCase(topic.name, q)).map((topic) => topic.id),
      )
      if (!topicIds.size) return []
      return catalog.filter((text) => text.topics.some((id) => topicIds.has(id)))
    } finally {
      loading.value = false
    }
  }

  return { loading, search }
}
