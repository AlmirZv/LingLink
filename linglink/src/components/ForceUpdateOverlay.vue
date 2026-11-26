<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import PixelButton from '@/components/ui/PixelButton.vue'

defineProps<{
  open: boolean
  downloadUrl: string
}>()

const { t } = useI18n()

function openDownload(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="gate" role="alertdialog" aria-modal="true" :aria-label="t('update.title')">
      <div class="gate__panel pixel-border">
        <h2 class="gate__title">{{ t('update.title') }}</h2>
        <p class="gate__body">{{ t('update.body') }}</p>
        <PixelButton v-if="downloadUrl" block @click="openDownload(downloadUrl)">
          {{ t('update.download') }}
        </PixelButton>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gate {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: color-mix(in srgb, var(--pixel-bg) 88%, black);
}

.gate__panel {
  width: min(22rem, 100%);
  padding: 1.15rem 1.05rem 1.05rem;
  background: var(--pixel-surface);
}

.gate__title {
  margin: 0 0 0.65rem;
  font-size: 1.05rem;
  font-weight: 700;
}

.gate__body {
  margin: 0 0 0.9rem;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.45;
  color: var(--pixel-text);
}
</style>
