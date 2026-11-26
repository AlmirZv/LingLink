import { computed, ref } from 'vue'

import { useRepositories } from '@/composables/useRepositories'
import { forgetWordMastery } from '@/services/forgetWordMastery'
import { useSessionStore } from '@/stores/session'
import type { ID, UserWordProgress } from '@/types/db'

export function useWordProgress() {
  const repos = useRepositories()
  const session = useSessionStore()
  const items = ref<UserWordProgress[]>([])
  const loading = ref(false)

  const userId = computed(() => session.user?.id ?? null)

  async function refresh() {
    if (!userId.value) {
      items.value = []
      return
    }
    loading.value = true
    try {
      items.value = await repos.progress.listWordProgress(userId.value)
    } finally {
      loading.value = false
    }
  }

  async function getLevel(wordId: ID): Promise<number> {
    if (!userId.value) return 0
    const row = await repos.progress.getWordProgress(userId.value, wordId)
    return row?.level ?? 0
  }

  async function setLevel(wordId: ID, level: number): Promise<UserWordProgress | null> {
    if (!userId.value) return null
    const mvpLevel = level >= 1 ? 1 : 0
    const saved = await repos.progress.setWordLevel(userId.value, wordId, mvpLevel)
    const idx = items.value.findIndex((p) => p.wordId === wordId)
    if (idx >= 0) {
      items.value[idx] = saved
    } else {
      items.value.push(saved)
    }
    return saved
  }

  async function distinctTextCount(wordId: ID): Promise<number> {
    if (!userId.value) return 0
    return repos.wordTextHistory.countDistinctTexts(userId.value, wordId)
  }

  async function forgetWord(wordId: ID): Promise<void> {
    if (!userId.value) return
    await forgetWordMastery(repos, userId.value, wordId)
    const idx = items.value.findIndex((p) => p.wordId === wordId)
    if (idx >= 0) {
      items.value[idx] = { ...items.value[idx]!, level: 0, updatedAt: new Date().toISOString() }
    }
  }

  return {
    items,
    loading,
    userId,
    refresh,
    getLevel,
    setLevel,
    distinctTextCount,
    forgetWord,
  }
}
