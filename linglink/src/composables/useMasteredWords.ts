import { onMounted, shallowRef, watch } from 'vue'

import { masteryCount, WORD_MASTERY_TARGET } from '@/domain/words/vocabularyFilters'
import { useRepositories } from '@/composables/useRepositories'
import { localDataRevision } from '@/services/local/cachedRepositories'
import { useSessionStore } from '@/stores/session'
import type { ID, Word } from '@/types/db'

const masteredWordIds = shallowRef<Set<ID>>(new Set())
const masteryByWordId = shallowRef<Map<ID, number>>(new Map())
const wordsById = shallowRef<Map<ID, Word>>(new Map())
const ready = shallowRef(false)
let inflight: Promise<void> | null = null

async function loadMasteredWords(
  repos: ReturnType<typeof useRepositories>,
  userId: string | undefined,
): Promise<void> {
  const [words, progressRows, history] = await Promise.all([
    repos.words.listAll(),
    userId ? repos.progress.listWordProgress(userId) : Promise.resolve([]),
    userId ? repos.wordTextHistory.listForUser(userId) : Promise.resolve([]),
  ])
  wordsById.value = new Map(words.map((word) => [word.id, word]))

  const textsByWord = new Map<ID, Set<ID>>()
  for (const row of history) {
    const texts = textsByWord.get(row.wordId) ?? new Set<ID>()
    texts.add(row.textId)
    textsByWord.set(row.wordId, texts)
  }
  const progressByWord = new Map(progressRows.map((row) => [row.wordId, row.level]))
  const mastered = new Set<ID>()
  const mastery = new Map<ID, number>()
  const wordIds = new Set<ID>([...progressByWord.keys(), ...textsByWord.keys()])
  for (const wordId of wordIds) {
    if (!wordsById.value.has(wordId)) continue
    const count = masteryCount({
      level: progressByWord.get(wordId) ?? 0,
      textsMastered: textsByWord.get(wordId)?.size ?? 0,
    })
    mastery.set(wordId, count)
    if (count >= WORD_MASTERY_TARGET) mastered.add(wordId)
  }
  masteryByWordId.value = mastery
  masteredWordIds.value = mastered
  ready.value = true
}

export function useMasteredWords() {
  const repos = useRepositories()
  const session = useSessionStore()

  function reload() {
    const run = (inflight ?? Promise.resolve()).then(() => loadMasteredWords(repos, session.user?.id))
    inflight = run.finally(() => {
      if (inflight === run) inflight = null
    })
    return inflight
  }

  onMounted(() => {
    void reload()
  })

  watch(
    () => session.user?.id,
    () => {
      void reload()
    },
  )

  watch(localDataRevision, () => {
    void reload()
  })

  return { masteredWordIds, masteryByWordId, wordsById, ready, reload }
}
