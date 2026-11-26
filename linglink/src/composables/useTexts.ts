import { onMounted, ref, shallowRef, watch } from 'vue'

import { useRepositories } from '@/composables/useRepositories'
import { resolveRepositoryMode } from '@/services/createRepositories'
import { localCacheReady, localDataRevision } from '@/services/local/cachedRepositories'
import { getFirebaseAuth } from '@/services/firebase/initFirebase'
import { restorePublishedDrafts } from '@/services/textAuthoringService'
import { useSessionStore } from '@/stores/session'
import type { LearningText, Topic } from '@/types/db'

export function useTexts() {
  const repos = useRepositories()
  const session = useSessionStore()
  const texts = shallowRef<LearningText[]>([])
  const topicsById = ref<Map<string, Topic>>(new Map())
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    const showSpinner = texts.value.length === 0
    if (showSpinner) loading.value = true
    error.value = null
    try {
      try {
        const seed =
          resolveRepositoryMode() === 'firebase' &&
          getFirebaseAuth().currentUser?.email === 'seed@import.linglink.app'
        if (seed) await restorePublishedDrafts(repos)
        else if (session.user?.id) await restorePublishedDrafts(repos, session.user.id)
      } catch {
        // Listing every draft needs the seed account; authors restore only their own rows.
      }
      const [catalog, topics] = await Promise.all([repos.texts.listPublished(), repos.topics.list()])
      texts.value = catalog
      topicsById.value = new Map(topics.map((t) => [t.id, t]))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load texts'
    } finally {
      loading.value = texts.value.length === 0 && !localCacheReady.value && !error.value
    }
  }

  onMounted(() => {
    void load()
  })

  watch([localDataRevision, localCacheReady], () => {
    void load()
  })

  return {
    texts,
    topicsById,
    loading,
    error,
    reload: load,
  }
}
