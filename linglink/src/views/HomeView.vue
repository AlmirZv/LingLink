<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import TextCard from '@/components/texts/TextCard.vue'
import { useHomeDashboard } from '@/composables/useHomeDashboard'
import { useRestoreLibraryReturn } from '@/composables/useLibraryReturn'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelCard from '@/components/ui/PixelCard.vue'

const { t } = useI18n()
const router = useRouter()
const { continueItem, recommended, progressByTextId, loading } = useHomeDashboard()

useRestoreLibraryReturn(() => !loading.value)

function onTextProgress(textId: string, value: number) {
  const next = new Map(progressByTextId.value)
  next.set(textId, value)
  progressByTextId.value = next
}

function resume() {
  if (!continueItem.value) return
  void router.push({
    name: 'text-preview',
    params: { id: continueItem.value.text.id },
  })
}
</script>

<template>
  <div class="home">
    <p v-if="loading" class="pixel-text-muted">{{ t('common.loading') }}</p>

    <PixelCard v-if="continueItem" :title="t('home.continueTitle')" :subtitle="continueItem.text.title">
      <p class="pixel-text-muted">
        {{ Math.round(continueItem.progress.progress * 100) }}% · {{ continueItem.text.level }}
      </p>
      <PixelButton block @click="resume">{{ t('home.continueCta') }}</PixelButton>
    </PixelCard>

    <section v-if="recommended.length" class="section">
      <h2 class="section-heading">{{ t('home.recommendedTitle') }}</h2>
      <ul class="rec-list">
        <li v-for="text in recommended" :key="text.id">
          <TextCard
            :text="text"
            :user-progress="progressByTextId.get(text.id)"
            @progress="onTextProgress(text.id, $event)"
          />
        </li>
      </ul>
    </section>

    <PixelCard v-if="!loading && !continueItem && !recommended.length" :title="t('nav.home')">
      <p class="pixel-text-muted">{{ t('home.empty') }}</p>
      <PixelButton block @click="() => router.push({ name: 'texts' })">{{ t('home.browseTexts') }}</PixelButton>
    </PixelCard>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.section-heading {
  margin: 0 0 0.5rem;
  font-size: var(--pixel-font-size-xs);
  font-weight: normal;
  color: var(--pixel-text-muted);
}

.rec-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
</style>
