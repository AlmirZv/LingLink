<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import WordDetailPanel from '@/components/words/WordDetailPanel.vue'
import WordEditView from '@/views/WordEditView.vue'
import WordListItem from '@/components/words/WordListItem.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelDialog from '@/components/ui/PixelDialog.vue'
import PixelInput from '@/components/ui/PixelInput.vue'
import { formatWordLabel } from '@/domain/words/characterReading'
import { useUserVocabulary } from '@/composables/useUserVocabulary'
import type { WordListTab } from '@/domain/words/vocabularyFilters'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { filtered, loading, tab, searchQuery, knowingIds, wordsById, markKnown } = useUserVocabulary()
const draftQuery = ref(searchQuery.value)

function runSearch() {
  searchQuery.value = draftQuery.value.trim()
}

const selectedWordId = ref<string | null>(null)
const editingWord = ref(false)

watch(
  () => route.query.open,
  (open) => {
    if (typeof open === 'string' && open) {
      selectedWordId.value = open
      editingWord.value = false
    }
  },
  { immediate: true },
)

const tabs = computed(() =>
  (['all', 'learning', 'known', 'unknown'] as WordListTab[]).map((id) => ({
    id,
    label: t(`words.tabs.${id}`),
  })),
)

const selectedWordLabel = computed(() => {
  if (!selectedWordId.value) return ''
  const word = wordsById.value.get(selectedWordId.value)
  return word ? formatWordLabel(word) : selectedWordId.value
})

function openWord(wordId: string) {
  editingWord.value = false
  selectedWordId.value = wordId
}

function closeWord() {
  const wordId = selectedWordId.value
  editingWord.value = false
  selectedWordId.value = null
  const clearOpen = typeof route.query.open === 'string'
  void (async () => {
    if (clearOpen) await router.replace({ name: 'words' })
    await nextTick()
    const row = wordId ? document.getElementById(`word-${wordId}`) : null
    if (!row) return
    const rect = row.getBoundingClientRect()
    const visible = rect.top >= 0 && rect.bottom <= window.innerHeight
    if (!visible) row.scrollIntoView({ block: 'center' })
  })()
}
</script>

<template>
  <div class="words-view">
    <div class="tabs" role="tablist">
      <button
        v-for="item in tabs"
        :key="item.id"
        type="button"
        class="tab pixel-box"
        :class="{ 'tab--active': tab === item.id }"
        @click="tab = item.id"
      >
        {{ item.label }}
      </button>
    </div>

    <form class="search-row" @submit.prevent="runSearch">
      <PixelInput
        v-model="draftQuery"
        class="search-row__field"
        type="search"
        :placeholder="t('words.searchLabel')"
      />
      <PixelButton type="submit" class="search-row__btn">{{ t('common.search') }}</PixelButton>
    </form>

    <p v-if="loading" class="pixel-text-muted">{{ t('common.loading') }}</p>
    <p v-else-if="!filtered.length" class="pixel-text-muted">{{ t('words.empty') }}</p>
    <ul v-else class="word-list">
      <li v-for="group in filtered" :id="`word-${group.id}`" :key="group.id">
        <WordListItem
          :group="group"
          :knowing-ids="knowingIds"
          @select="openWord"
          @know="markKnown"
        />
      </li>
    </ul>

    <PixelDialog
      :open="selectedWordId !== null"
      :title="selectedWordLabel"
      placement="center"
      hide-title
      @close="closeWord"
    >
      <WordDetailPanel
        v-if="selectedWordId && !editingWord"
        embedded
        :word-id="selectedWordId"
        @edit="editingWord = true"
      />
      <WordEditView v-else-if="selectedWordId" :word-id="selectedWordId" @back="editingWord = false" />
    </PixelDialog>
  </div>
</template>

<style scoped>
.words-view {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tabs {
  display: flex;
  gap: 0.35rem;
}

.tab {
  flex: 1;
  min-width: 0;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.55rem 0.2rem;
  cursor: pointer;
  color: var(--pixel-text-muted);
  background: var(--pixel-bg);
  box-shadow: none;
  white-space: nowrap;
}

.search-row {
  display: flex;
  align-items: stretch;
  gap: 0.45rem;
}

.search-row__field {
  flex: 1;
  min-width: 0;
}

.search-row__field :deep(.pixel-field__input) {
  height: 2.7rem;
  box-sizing: border-box;
  background: var(--pixel-bg-elevated);
}

.search-row__btn {
  flex-shrink: 0;
  height: 2.7rem;
  padding: 0 1rem;
  display: inline-flex;
  align-items: center;
}

.tab--active {
  color: var(--pixel-text);
  background: var(--pixel-bg-elevated);
  border-color: color-mix(in srgb, var(--pixel-accent) 45%, var(--pixel-border));
}

.word-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
