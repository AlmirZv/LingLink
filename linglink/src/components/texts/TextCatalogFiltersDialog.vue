<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import PixelDialog from '@/components/ui/PixelDialog.vue'
import PixelSelect from '@/components/ui/PixelSelect.vue'
import { TEXT_LEVELS } from '@/constants/textLevels'
import { useTextFilters } from '@/composables/useTextFilters'
import { useTexts } from '@/composables/useTexts'
import type { KnownWordsFilter, ProgressFilter } from '@/domain/text/catalogFilters'
import type { TextLevel } from '@/types/db'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const { filters, applyFilters, resetFilters } = useTextFilters()
const { topicsById } = useTexts()

const topicOptions = computed(() => [
  { value: 'all', label: t('texts.filters.allTopics') },
  ...[...topicsById.value.values()].map((topic) => ({ value: topic.id, label: topic.name })),
])

const levelOptions = computed(() => [
  { value: 'all', label: t('texts.filters.allLevels') },
  ...TEXT_LEVELS.map((level) => ({
    value: level,
    label: t(`texts.level.${level}`),
  })),
])

const progressOptions = computed(() =>
  (['all', 'not_started', 'in_progress', 'completed'] as ProgressFilter[]).map((value) => ({
    value,
    label: t(`texts.filters.progress.${value}`),
  })),
)

const knownOptions = computed(() =>
  (['all', '0-25', '25-50', '50-75', '75-100'] as KnownWordsFilter[]).map((value) => ({
    value,
    label: t(`texts.filters.known.${value}`),
  })),
)

function onReset() {
  resetFilters()
}
</script>

<template>
  <PixelDialog :open="open" :title="t('texts.filters.title')" @close="emit('close')">
    <PixelSelect
      :label="t('texts.filters.level')"
      :options="levelOptions"
      :model-value="filters.level"
      @update:model-value="applyFilters({ level: $event as TextLevel | 'all' })"
    />
    <PixelSelect
      class="field-gap"
      :label="t('texts.filters.topic')"
      :options="topicOptions"
      :model-value="filters.topicId"
      @update:model-value="applyFilters({ topicId: $event })"
    />
    <PixelSelect
      class="field-gap"
      :label="t('texts.filters.progressLabel')"
      :options="progressOptions"
      :model-value="filters.progress"
      @update:model-value="applyFilters({ progress: $event as ProgressFilter })"
    />
    <PixelSelect
      class="field-gap"
      :label="t('texts.filters.knownLabel')"
      :options="knownOptions"
      :model-value="filters.knownWords"
      @update:model-value="applyFilters({ knownWords: $event as KnownWordsFilter })"
    />
    <button type="button" class="reset-link pixel-text-muted" @click="onReset">
      {{ t('texts.filters.reset') }}
    </button>
  </PixelDialog>
</template>

<style scoped>
.field-gap {
  margin-top: 0.65rem;
}

.reset-link {
  margin-top: 1rem;
  padding: 0;
  border: none;
  background: transparent;
  font: inherit;
  font-size: var(--pixel-font-size-xs);
  cursor: pointer;
  text-decoration: underline;
}
</style>
