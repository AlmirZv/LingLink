import { computed, ref, shallowRef, watch } from 'vue'

import { buildUserTextProgressUpdate } from '@/domain/learning/computeProgress'
import { hasMoreWordsToLearn, selectNextWordBatch } from '@/domain/learning/selectNextWordBatch'
import { collectConstructionIds, collectWordSummaries } from '@/domain/learning/textVocabulary'
import { useRepositories } from '@/composables/useRepositories'
import { localDataRevision } from '@/services/local/cachedRepositories'
import { useSessionStore } from '@/stores/session'
import type { ID, LearningText, UserTextProgress } from '@/types/db'

const BATCH_STORAGE_KEY = 'linglink.activeBatch.v1'

function loadBatch(textId: ID): ID[] {
  try {
    const raw = sessionStorage.getItem(BATCH_STORAGE_KEY)
    if (!raw) return []
    const map = JSON.parse(raw) as Record<ID, ID[]>
    return map[textId] ?? []
  } catch {
    return []
  }
}

function saveBatch(textId: ID, wordIds: ID[]) {
  try {
    const raw = sessionStorage.getItem(BATCH_STORAGE_KEY)
    const map = raw ? (JSON.parse(raw) as Record<ID, ID[]>) : {}
    map[textId] = wordIds
    sessionStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

function clearBatch(textId: ID) {
  saveBatch(textId, [])
}

export function useTextLearning(text: () => LearningText | null) {
  const repos = useRepositories()
  const session = useSessionStore()
  const userProgress = shallowRef<UserTextProgress | null>(null)
  const globalKnown = ref<Set<ID>>(new Set())
  const currentBatch = ref<ID[]>([])
  const loading = ref(false)

  const userId = computed(() => session.user?.id ?? null)

  async function refreshProgress() {
    const t = text()
    const uid = userId.value
    if (!t || !uid) return
    loading.value = true
    try {
      userProgress.value = await repos.progress.getTextProgress(uid, t.id)
      const rows = await repos.progress.listWordProgress(uid)
      globalKnown.value = new Set(rows.filter((r) => r.level >= 1).map((r) => r.wordId))
      currentBatch.value = loadBatch(t.id)
    } finally {
      loading.value = false
    }
  }

  function excludedWordIds(): Set<ID> {
    const excluded = new Set(globalKnown.value)
    if (userProgress.value) {
      for (const id of userProgress.value.learnedWordIds) excluded.add(id)
    }
    return excluded
  }

  function ensureBatch() {
    const t = text()
    if (!t) return []
    if (currentBatch.value.length) return currentBatch.value
    const batch = selectNextWordBatch(t, excludedWordIds()).map((w) => w.wordId)
    currentBatch.value = batch
    saveBatch(t.id, batch)
    return batch
  }

  async function initProgressFromPrepare(markedWordIds: ID[], markedConstructionIds: ID[]) {
    const t = text()
    const uid = userId.value
    if (!t || !uid) return

    const base: UserTextProgress = userProgress.value ?? {
      userId: uid,
      textId: t.id,
      learnedWordIds: [],
      learnedConstructionIds: [],
      currentStep: 0,
      progress: 0,
      updatedAt: '',
    }

    const learnedWordIds = [...new Set([...base.learnedWordIds, ...markedWordIds])]
    const learnedConstructionIds = [...new Set([...base.learnedConstructionIds, ...markedConstructionIds])]

    for (const wordId of markedWordIds) {
      await repos.progress.setWordLevel(uid, wordId, 1)
    }

    const updated = buildUserTextProgressUpdate(t, base, {
      learnedWordIds,
      learnedConstructionIds,
    })
    await repos.progress.upsertTextProgress(updated)
    userProgress.value = updated
    await refreshProgress()
  }

  async function completeRound() {
    const t = text()
    const uid = userId.value
    if (!t || !uid || !currentBatch.value.length) return

    const base: UserTextProgress = userProgress.value ?? {
      userId: uid,
      textId: t.id,
      learnedWordIds: [],
      learnedConstructionIds: [],
      currentStep: 0,
      progress: 0,
      updatedAt: '',
    }

    const learnedWordIds = [...new Set([...base.learnedWordIds, ...currentBatch.value])]
    for (const wordId of currentBatch.value) {
      await repos.progress.setWordLevel(uid, wordId, 1)
      await repos.wordTextHistory.record({ userId: uid, wordId, textId: t.id, learnedAt: new Date().toISOString() })
    }

    const updated = buildUserTextProgressUpdate(t, base, {
      learnedWordIds,
      currentStep: base.currentStep + 1,
    })
    await repos.progress.upsertTextProgress(updated)
    userProgress.value = updated
    clearBatch(t.id)
    currentBatch.value = []

    await refreshProgress()
  }

  const knownWordIds = computed(() => {
    const set = new Set(globalKnown.value)
    if (userProgress.value) {
      for (const id of userProgress.value.learnedWordIds) set.add(id)
    }
    return set
  })

  const batchWordIds = computed(() => new Set(currentBatch.value))

  const moreWordsRemaining = computed(() => {
    const t = text()
    if (!t) return false
    return hasMoreWordsToLearn(t, excludedWordIds())
  })

  const vocabulary = computed(() => (text() ? collectWordSummaries(text()!) : []))
  const constructionIds = computed(() => (text() ? collectConstructionIds(text()!) : []))

  watch(localDataRevision, () => {
    void refreshProgress()
  })

  return {
    userProgress,
    globalKnown,
    currentBatch,
    loading,
    knownWordIds,
    batchWordIds,
    moreWordsRemaining,
    vocabulary,
    constructionIds,
    refreshProgress,
    ensureBatch,
    initProgressFromPrepare,
    completeRound,
    excludedWordIds,
  }
}
