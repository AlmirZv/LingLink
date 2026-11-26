import { computed, onMounted, ref, shallowRef, watch } from 'vue'

import { useLanguageContext } from '@/composables/useLanguageContext'
import {
  filterWordGroups,
  groupWordEntries,
  placeKnownGroupsLast,
  WORD_MASTERY_TARGET,
  type UserWordEntry,
  type WordListTab,
} from '@/domain/words/vocabularyFilters'
import { useRepositories } from '@/composables/useRepositories'
import { localDataRevision } from '@/services/local/cachedRepositories'
import { useSessionStore } from '@/stores/session'
import type { Word } from '@/types/db'

export function useUserVocabulary() {
  const repos = useRepositories()
  const session = useSessionStore()
  const { learningLanguage, translationTargetForText } = useLanguageContext()

  const entries = shallowRef<UserWordEntry[]>([])
  const wordsById = shallowRef<Map<string, Word>>(new Map())
  const loading = ref(false)
  const tab = ref<WordListTab>('all')
  const searchQuery = ref('')
  const knowingIds = ref<ReadonlySet<string>>(new Set())

  const groups = computed(() =>
    placeKnownGroupsLast(
      groupWordEntries(
        entries.value,
        translationTargetForText(learningLanguage.value),
        wordsById.value,
      ),
    ),
  )
  const filtered = computed(() => filterWordGroups(groups.value, tab.value, searchQuery.value))

  async function load() {
    const uid = session.user?.id
    if (entries.value.length === 0) loading.value = true
    try {
      const [allWords, progressRows, history] = await Promise.all([
        repos.words.listAll(),
        uid ? repos.progress.listWordProgress(uid) : Promise.resolve([]),
        uid ? repos.wordTextHistory.listForUser(uid) : Promise.resolve([]),
      ])

      const progressByWord = new Map(progressRows.map((row) => [row.wordId, row]))
      const textsByWord = new Map<string, Set<string>>()
      for (const row of history) {
        const texts = textsByWord.get(row.wordId) ?? new Set<string>()
        texts.add(row.textId)
        textsByWord.set(row.wordId, texts)
      }

      const words = allWords.filter((word) => word.language === learningLanguage.value)
      wordsById.value = new Map(allWords.map((word) => [word.id, word]))

      const built: UserWordEntry[] = words.map((word) => ({
        word,
        level: progressByWord.get(word.id)?.level ?? 0,
        textsMastered: textsByWord.get(word.id)?.size ?? 0,
      }))

      const language = learningLanguage.value
      built.sort((a, b) => {
        const aTouched = progressByWord.has(a.word.id) || textsByWord.has(a.word.id)
        const bTouched = progressByWord.has(b.word.id) || textsByWord.has(b.word.id)
        if (aTouched !== bTouched) return aTouched ? -1 : 1
        if (aTouched) {
          const aAt = progressByWord.get(a.word.id)?.updatedAt ?? ''
          const bAt = progressByWord.get(b.word.id)?.updatedAt ?? ''
          if (aAt !== bAt) return String(bAt).localeCompare(String(aAt))
        }
        return a.word.word.localeCompare(b.word.word, language)
      })
      entries.value = built
    } finally {
      loading.value = false
    }
  }

  async function markKnown(wordIds: string[]) {
    const uid = session.user?.id
    if (!uid || wordIds.length === 0) return
    knowingIds.value = new Set([...knowingIds.value, ...wordIds])
    try {
      const saved = await Promise.all(
        wordIds.map((wordId) => repos.progress.setWordLevel(uid, wordId, WORD_MASTERY_TARGET)),
      )
      const levels = new Map(saved.map((row) => [row.wordId, row.level]))
      entries.value = entries.value.map((entry) =>
        levels.has(entry.word.id) ? { ...entry, level: levels.get(entry.word.id)! } : entry,
      )
    } finally {
      const next = new Set(knowingIds.value)
      for (const id of wordIds) next.delete(id)
      knowingIds.value = next
    }
  }

  onMounted(() => {
    void load()
  })

  watch(learningLanguage, () => {
    void load()
  })

  watch(localDataRevision, () => {
    void load()
  })

  return {
    entries,
    filtered,
    wordsById,
    loading,
    tab,
    searchQuery,
    knowingIds,
    reload: load,
    markKnown,
  }
}
