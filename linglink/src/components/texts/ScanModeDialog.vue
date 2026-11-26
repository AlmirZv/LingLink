<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import PixelButton from '@/components/ui/PixelButton.vue'
import PixelDialog from '@/components/ui/PixelDialog.vue'
import type { ScanMode } from '@/services/textScan'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  pick: [ScanMode]
}>()

const { t } = useI18n()
</script>

<template>
  <PixelDialog :open="open" placement="center" :title="t('analysis.scanModeTitle')" @close="emit('close')">
    <p class="hint pixel-text-muted">{{ t('analysis.scanModeHint') }}</p>
    <div class="actions">
      <PixelButton block @click="emit('pick', 'auto')">{{ t('analysis.scanModeAuto') }}</PixelButton>
      <p class="note pixel-text-muted">{{ t('analysis.scanModeAutoHint') }}</p>
      <PixelButton variant="secondary" block @click="emit('pick', 'manual')">
        {{ t('analysis.scanModeManual') }}
      </PixelButton>
    </div>
  </PixelDialog>
</template>

<style scoped>
.hint {
  margin: 0 0 0.85rem;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.45;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.note {
  margin: -0.15rem 0 0.35rem;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.4;
}
</style>
