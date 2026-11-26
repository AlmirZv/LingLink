<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useRepositories } from '@/composables/useRepositories'
import { restorePublishedDrafts } from '@/services/textAuthoringService'
import { useSessionStore } from '@/stores/session'
import type { LearningText } from '@/types/db'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelCard from '@/components/ui/PixelCard.vue'

const { t } = useI18n()
const router = useRouter()
const repos = useRepositories()
const session = useSessionStore()

const texts = ref<LearningText[]>([])
const loading = ref(true)

onMounted(async () => {
  const uid = session.user?.id
  if (!uid) {
    loading.value = false
    return
  }
  try {
    await restorePublishedDrafts(repos, uid)
  } catch {
    // Own drafts are still listed below even if restore cannot run.
  }
  texts.value = await repos.texts.listByAuthor(uid)
  loading.value = false
})

function openText(text: LearningText) {
  if (text.status === 'draft') {
    void router.push({ name: 'text-translate', params: { id: text.id } })
  } else {
    void router.push({ name: 'text-preview', params: { id: text.id }, query: { from: 'me' } })
  }
}
</script>

<template>
  <PixelCard :title="t('me.myTexts')">
    <p v-if="loading" class="pixel-text-muted">{{ t('common.loading') }}</p>
    <p v-else-if="!texts.length" class="pixel-text-muted">{{ t('me.noTexts') }}</p>
    <ul v-else class="list">
      <li v-for="text in texts" :key="text.id">
        <button type="button" class="row" @click="openText(text)">
          <span>{{ text.title }}</span>
          <span class="status">{{ text.status }}</span>
        </button>
      </li>
    </ul>
    <PixelButton class="back" variant="secondary" block @click="router.push({ name: 'me' })">
      {{ t('me.backToProfile') }}
    </PixelButton>
  </PixelCard>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
}

.row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border: none;
  border-bottom: 1px solid var(--pixel-border);
  background: transparent;
  font-family: inherit;
  font-size: var(--pixel-font-size-xs);
  color: var(--pixel-text);
  cursor: pointer;
  text-align: left;
}

.status {
  color: var(--pixel-text-muted);
  text-transform: uppercase;
  font-size: 0.5rem;
}

.back {
  margin-top: 0.5rem;
}
</style>
