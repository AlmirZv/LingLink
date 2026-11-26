import { computed, onMounted, ref, shallowRef, watch } from 'vue'

import { resolveTranslationLabels } from '@/domain/words/resolveTranslation'
import { readableTextIds } from '@/domain/words/textAppearances'
import { groupedMastery, sameSurface } from '@/domain/words/vocabularyFilters'
import { useRepositories } from '@/composables/useRepositories'
import { useLanguageContext } from '@/composables/useLanguageContext'
import { useSessionStore } from '@/stores/session'
import type { ID, Word } from '@/types/db'

export function useWordDetail(wordId: () => string | undefined) {
  const repos = useRepositories()
  const session = useSessionStore()
  const { learningLanguage, translationTargetForText } = useLanguageContext()

  const word = shallowRef<Word | null>(null)
  const memberIds = ref<ID[]>([])
  const translationLabels = ref<{ id: ID; label: string }[]>([])
  const readableTexts = ref<ID[]>([])
  const rootLabels = ref<{ id: ID; label: string }[]>([])
  const constructionLabels = ref<{ id: ID; label: string }[]>([])
  const createdByName = ref('')
  const mastery = ref(0)
  const masteryTarget = ref(5)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const targetLanguage = computed(() => {
    const w = word.value
    if (!w) return learningLanguage.value
    return translationTargetForText(w.language)
  })

  async function load() {
    const id = wordId()
    if (!id) return
    loading.value = true
    error.value = null
    try {
      const loaded = await repos.words.getById(id)
      if (!loaded) {
        error.value = 'Word not found'
        word.value = null
        return
      }

      const allWords = await repos.words.listAll()
      const map = new Map(allWords.map((item) => [item.id, item]))
      const members = allWords.filter((item) => sameSurface(item, loaded))
      const display = members.find((item) => item.furigana) ?? loaded
      word.value = display
      memberIds.value = members.map((item) => item.id)

      const labels: { id: ID; label: string }[] = []
      for (const member of members) {
        for (const item of resolveTranslationLabels(member, targetLanguage.value, map)) {
          if (!labels.some((existing) => existing.id === item.id)) labels.push(item)
        }
      }
      translationLabels.value = labels
      rootLabels.value = display.rootWords.flatMap((rootId) => {
        const root = map.get(rootId)
        return root ? [{ id: root.id, label: root.word }] : []
      })
      constructionLabels.value = (
        await Promise.all(
          display.grammarConstructions.map(async (constructionId) => {
            const construction = await repos.constructions.getById(constructionId)
            return construction ? { id: construction.id, label: construction.construction } : null
          }),
        )
      ).filter((item): item is { id: ID; label: string } => item !== null)
      const author = await repos.users.getById(display.createdBy)
      createdByName.value = author?.displayName ?? display.createdBy

      readableTexts.value = readableTextIds(members)

      const uid = session.user?.id
      const progressRows = uid ? await repos.progress.listWordProgress(uid) : []
      const progressByWord = new Map(progressRows.map((row) => [row.wordId, row]))
      const entries = await Promise.all(
        members.map(async (member) => ({
          word: member,
          level: progressByWord.get(member.id)?.level ?? 0,
          textsMastered: uid ? await repos.wordTextHistory.countDistinctTexts(uid, member.id) : 0,
        })),
      )
      const score = groupedMastery(entries, targetLanguage.value)
      mastery.value = score.mastery
      masteryTarget.value = score.masteryTarget
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load word'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => void load())
  watch([wordId, targetLanguage], () => void load())

  return {
    word,
    memberIds,
    translationLabels,
    rootLabels,
    constructionLabels,
    createdByName,
    readableTexts,
    mastery,
    masteryTarget,
    loading,
    error,
    reload: load,
  }
}
