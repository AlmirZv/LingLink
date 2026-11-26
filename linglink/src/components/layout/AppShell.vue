<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LibrarySearchDialog from '@/components/texts/LibrarySearchDialog.vue'
import BottomNav from '@/components/layout/BottomNav.vue'
import CornerActions from '@/components/layout/CornerActions.vue'
import { isTextSearchField, type TextSearchField } from '@/composables/useTextSearch'
import { pageHeaderBack } from '@/composables/usePageHeader'

const route = useRoute()
const router = useRouter()

const searchOpen = ref(false)

const showSearch = computed(() => route.meta.showSearch === true)
const showAdd = computed(() => route.meta.showAddText === true)

const searchQuery = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const searchField = computed<TextSearchField | undefined>(() =>
  isTextSearchField(route.query.by) ? route.query.by : undefined,
)

const cornerCount = computed(() => {
  let count = 0
  if (pageHeaderBack.value) count += 1
  if (showSearch.value) count += 1
  if (showAdd.value) count += 1
  return count
})

function openSearch() {
  searchOpen.value = true
}

function applySearch(payload: { query: string; field: TextSearchField }) {
  searchOpen.value = false
  const nextQuery = { ...route.query, q: payload.query, by: payload.field }
  if (route.name === 'texts') {
    void router.replace({ query: nextQuery })
    return
  }
  void router.push({ name: 'texts', query: { q: payload.query, by: payload.field } })
}

function openAddText() {
  void router.push({ name: 'add-text' })
}
</script>

<template>
  <div class="app-shell" :style="{ '--corner-count': String(cornerCount) }">
    <LibrarySearchDialog
      :open="searchOpen"
      :initial-query="searchQuery"
      :initial-field="searchField"
      @close="searchOpen = false"
      @search="applySearch"
    />
    <main class="app-shell__main app-container">
      <RouterView />
    </main>
    <CornerActions
      :show-search="showSearch"
      :show-add="showAdd"
      :on-back="pageHeaderBack"
      @search="openSearch"
      @add="openAddText"
    />
    <BottomNav />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100dvh;
  max-width: 100%;
  overflow-x: hidden;
  padding-bottom: calc(
    var(--bottom-nav-height) + var(--safe-bottom) + 1rem + var(--corner-count, 0) * 3.1rem
  );
}

.app-shell__main {
  padding-top: calc(1rem + var(--safe-top));
  padding-bottom: 1rem;
}
</style>
