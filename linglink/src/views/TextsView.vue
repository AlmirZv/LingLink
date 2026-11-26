<script setup lang="ts">

import { computed, onMounted, ref, watch } from 'vue'

import { useI18n } from 'vue-i18n'

import { useRoute } from 'vue-router'



import TextCard from '@/components/texts/TextCard.vue'

import { useLanguageContext } from '@/composables/useLanguageContext'
import { useRestoreLibraryReturn } from '@/composables/useLibraryReturn'

import { textVisibleToLearner } from '@/domain/learning/readingLanguageModel'

import { useRepositories } from '@/composables/useRepositories'

import { useTextFilters } from '@/composables/useTextFilters'

import { isTextSearchField, useTextSearch } from '@/composables/useTextSearch'

import { useTexts } from '@/composables/useTexts'

import { useSessionStore } from '@/stores/session'

import { localDataRevision } from '@/services/local/cachedRepositories'

import type { LearningText } from '@/types/db'



const route = useRoute()

const { t } = useI18n()

const { texts, loading, error } = useTexts()

useRestoreLibraryReturn(() => !loading.value)

const { knownLanguage, learningLanguage } = useLanguageContext()

const { applyToTexts } = useTextFilters()

const { loading: searchLoading, search } = useTextSearch()

const repos = useRepositories()

const session = useSessionStore()



const progressByTextId = ref<Map<string, number>>(new Map())

const fullProgressByTextId = ref<Map<string, import('@/types/db').UserTextProgress>>(new Map())

const globalKnownWordIds = ref<Set<string>>(new Set())



const wordFilterIds = computed(() => {
  const raw = route.query.word
  if (typeof raw !== 'string' || !raw) return []
  return raw.split(',').filter(Boolean)
})

const catalogQuery = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''))
const catalogField = computed(() => (isTextSearchField(route.query.by) ? route.query.by : null))
const catalogSearchActive = computed(() => Boolean(catalogQuery.value && catalogField.value))

const searchHits = ref<LearningText[] | null>(null)
let searchGen = 0

watch(
  [catalogQuery, catalogField],
  async ([query, field]) => {
    const gen = ++searchGen
    if (!query || !field) {
      searchHits.value = null
      return
    }
    const hits = await search(query, field)
    if (gen !== searchGen) return
    searchHits.value = hits
  },
  { immediate: true },
)

const filteredTexts = computed(() => {
  const visible = texts.value.filter((text) =>
    textVisibleToLearner(text, knownLanguage.value, learningLanguage.value),
  )
  let list = applyToTexts(visible, fullProgressByTextId.value, globalKnownWordIds.value)
  if (wordFilterIds.value.length) {
    list = list.filter((text) => wordFilterIds.value.some((id) => text.wordIds.includes(id)))
  }
  if (catalogSearchActive.value) {
    if (!searchHits.value) return []
    const ids = new Set(searchHits.value.map((text) => text.id))
    list = list.filter((text) => ids.has(text.id))
  }
  return list
})

const wordFilterLabel = ref<string | null>(null)

watch(
  wordFilterIds,
  async (ids) => {
    const id = ids[0]
    if (!id) {
      wordFilterLabel.value = null
      return
    }
    const word = await repos.words.getById(id)
    wordFilterLabel.value = word?.word ?? id
  },
  { immediate: true },
)



async function loadUserContext() {

  const uid = session.user?.id

  if (!uid) {

    progressByTextId.value = new Map()

    fullProgressByTextId.value = new Map()

    globalKnownWordIds.value = new Set()

    return

  }

  const [textRows, wordRows] = await Promise.all([

    repos.progress.listTextProgress(uid),

    repos.progress.listWordProgress(uid),

  ])

  progressByTextId.value = new Map(textRows.map((r) => [r.textId, r.progress]))

  fullProgressByTextId.value = new Map(textRows.map((r) => [r.textId, r]))

  globalKnownWordIds.value = new Set(wordRows.filter((w) => w.level >= 1).map((w) => w.wordId))

}



function onTextProgress(textId: string, value: number) {
  const next = new Map(progressByTextId.value)
  next.set(textId, value)
  progressByTextId.value = next
  const full = new Map(fullProgressByTextId.value)
  const prev = full.get(textId)
  if (!prev) return
  full.set(textId, {
    ...prev,
    progress: value,
    ...(value === 0 ? { learnedWordIds: [], learnedConstructionIds: [], currentStep: 0 } : {}),
  })
  fullProgressByTextId.value = full
}

onMounted(() => {

  void loadUserContext()

})



watch(

  () => session.user?.id,

  () => {

    void loadUserContext()

  },

)

watch(localDataRevision, () => {
  void loadUserContext()
})

</script>



<template>

  <div class="texts-view">

    <p v-if="wordFilterLabel" class="word-filter pixel-box">

      {{ t('texts.filteredByWord', { word: wordFilterLabel }) }}

    </p>



    <p v-if="loading || (catalogSearchActive && searchLoading)" class="pixel-text-muted">{{ t('common.loading') }}</p>

    <p v-else-if="error" class="error">{{ error }}</p>

    <p v-else-if="!filteredTexts.length" class="pixel-text-muted">
      {{ catalogSearchActive ? t('search.noResults') : t('texts.empty') }}
    </p>

    <ul v-else class="text-list">

      <li v-for="item in filteredTexts" :key="item.id">

        <TextCard
          :text="item"
          :user-progress="progressByTextId.get(item.id)"
          @progress="onTextProgress(item.id, $event)"
        />

      </li>

    </ul>

  </div>

</template>



<style scoped>

.texts-view {

  display: flex;

  flex-direction: column;

  gap: 0.75rem;

}



.word-filter {

  margin: 0;

  padding: 0.5rem 0.75rem;

  font-size: var(--pixel-font-size-xs);

  color: var(--pixel-accent);

}



.text-list {

  list-style: none;

  margin: 0;

  padding: 0;

  display: flex;

  flex-direction: column;

  gap: 0.9rem;

}



.error {

  margin: 0;

  color: var(--pixel-danger);

  font-size: var(--pixel-font-size-xs);

}

</style>

