import { onMounted, ref, shallowRef, watch } from 'vue'

import { useRepositories } from '@/composables/useRepositories'
import type { LearningText, Topic, User, Word } from '@/types/db'

export function useTextDetail(textId: () => string | undefined) {
  const repos = useRepositories()
  const text = shallowRef<LearningText | null>(null)
  const author = shallowRef<User | null>(null)
  const topics = ref<Topic[]>([])
  const wordsInText = shallowRef<Word[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const id = textId()
    if (!id) return
    loading.value = true
    error.value = null
    try {
      const loaded = await repos.texts.getById(id)
      if (!loaded) {
        error.value = 'Text not found'
        text.value = null
        return
      }
      text.value = loaded
      author.value = (await repos.users.getById(loaded.authorId)) ?? null
      const topicRows = await Promise.all(loaded.topics.map((tid) => repos.topics.getById(tid)))
      topics.value = topicRows.filter((t): t is Topic => t !== null)
      wordsInText.value = await repos.words.listByIds(loaded.wordIds)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load text'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void load()
  })

  watch(textId, () => {
    void load()
  })

  return { text, author, topics, wordsInText, loading, error, reload: load }
}
