import { onMounted, ref, shallowRef, watch } from 'vue'

import { useLanguageContext } from '@/composables/useLanguageContext'
import { useRepositories } from '@/composables/useRepositories'
import { textVisibleToLearner } from '@/domain/learning/readingLanguageModel'
import { resolveRepositoryMode } from '@/services/createRepositories'
import { getFirebaseAuth } from '@/services/firebase/initFirebase'
import { localCacheReady, localDataRevision } from '@/services/local/cachedRepositories'
import { computeTranslationProgress } from '@/services/textDenormalize'
import { restorePublishedDrafts } from '@/services/textAuthoringService'
import { useSessionStore } from '@/stores/session'
import type { ID, LearningText, UserTextProgress } from '@/types/db'

export interface ContinueLearningItem {
  text: LearningText
  progress: UserTextProgress
}

function pickContinueItem(
  texts: LearningText[],
  progressRows: UserTextProgress[],
): ContinueLearningItem | null {
  const byTextId = new Map(texts.map((t) => [t.id, t]))
  const inProgress = progressRows
    .filter((p) => p.progress > 0 && p.progress < 1)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))

  const row = inProgress[0] ?? progressRows.find((p) => p.progress > 0 && p.progress < 1)
  if (!row) return null
  const text = byTextId.get(row.textId)
  if (!text) return null

  return { text, progress: row }
}

function scoreRecommended(text: LearningText, userProgress: number, preferredTopics: Set<ID>): number {
  let score = computeTranslationProgress(text) * 40
  score += (1 - userProgress) * 30
  for (const topic of text.topics) {
    if (preferredTopics.has(topic)) score += 15
  }
  score += Math.min(text.views, 10)
  return score
}

export function useHomeDashboard() {
  const repos = useRepositories()
  const session = useSessionStore()
  const { knownLanguage, learningLanguage } = useLanguageContext()

  const continueItem = shallowRef<ContinueLearningItem | null>(null)
  const recommended = shallowRef<LearningText[]>([])
  const progressByTextId = shallowRef<Map<ID, number>>(new Map())
  const loading = ref(false)

  async function load() {
    const uid = session.user?.id
    const showSpinner = recommended.value.length === 0 && !continueItem.value
    if (showSpinner) loading.value = true
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
      const texts = (await repos.texts.listPublished()).filter((text) =>
        textVisibleToLearner(text, knownLanguage.value, learningLanguage.value),
      )
      const progressRows = uid ? await repos.progress.listTextProgress(uid) : []
      const progressByText = new Map(progressRows.map((p) => [p.textId, p]))
      progressByTextId.value = new Map(progressRows.map((row) => [row.textId, row.progress]))

      continueItem.value = pickContinueItem(texts, progressRows)

      const preferredTopics = new Set<ID>()
      if (continueItem.value) {
        for (const t of continueItem.value.text.topics) preferredTopics.add(t)
      }

      recommended.value = texts
        .filter((t) => (progressByText.get(t.id)?.progress ?? 0) < 1)
        .map((t) => ({
          text: t,
          score: scoreRecommended(t, progressByText.get(t.id)?.progress ?? 0, preferredTopics),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => x.text)
    } finally {
      loading.value = recommended.value.length === 0 && !continueItem.value && !localCacheReady.value
    }
  }

  onMounted(() => {
    void load()
  })

  watch([localDataRevision, localCacheReady], () => {
    void load()
  })

  return { continueItem, recommended, progressByTextId, loading, reload: load }
}
