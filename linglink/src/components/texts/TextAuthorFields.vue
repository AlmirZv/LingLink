<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { CONTENT_LANGUAGE_OPTIONS } from '@/constants/languages'
import { TEXT_LEVELS } from '@/constants/textLevels'
import PixelInput from '@/components/ui/PixelInput.vue'
import PixelSelect from '@/components/ui/PixelSelect.vue'
import SeriesField from '@/components/texts/SeriesField.vue'

const title = defineModel<string>('title', { default: '' })
const language = defineModel<string>('language', { default: 'ru' })
const level = defineModel<string>('level', { default: 'beginner' })
const seriesId = defineModel<string>('seriesId', { default: '' })
const body = defineModel<string>('body', { default: '' })
const topicsRaw = defineModel<string>('topicsRaw', { default: '' })

const { t } = useI18n()
const seriesField = ref<{ flush: () => Promise<string> } | null>(null)

const languageOptions = CONTENT_LANGUAGE_OPTIONS.map((item) => ({
  value: item.code,
  label: `${item.flag} ${item.nativeName}`,
}))

const levelOptions = computed(() =>
  TEXT_LEVELS.map((value) => ({
    value,
    label: t(`texts.level.${value}`),
  })),
)

async function flushSeries(): Promise<string> {
  const field = seriesField.value
  if (field?.flush) return field.flush()
  return seriesId.value
}

defineExpose({ flushSeries })
</script>

<template>
  <PixelInput v-model="title" :label="t('analysis.titleLabel')" />
  <PixelSelect
    class="field-gap"
    v-model="language"
    :label="t('analysis.sourceLanguage')"
    :options="languageOptions"
  />
  <PixelSelect class="field-gap" v-model="level" :label="t('texts.filters.level')" :options="levelOptions" />
  <SeriesField ref="seriesField" v-model="seriesId" class="field-gap" />
  <label class="body-field">
    <span class="body-field__label">{{ t('analysis.bodyLabel') }}</span>
    <textarea v-model="body" class="body-field__area pixel-box" rows="8" />
  </label>
  <PixelInput
    class="field-gap"
    v-model="topicsRaw"
    :label="t('analysis.topicsLabel')"
    :placeholder="t('analysis.topicsPlaceholder')"
  />
</template>

<style scoped>
.field-gap {
  margin-top: 0.65rem;
}

.body-field {
  display: block;
  margin-top: 0.65rem;
}

.body-field__label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 0.4rem;
  color: var(--pixel-text-muted);
}

.body-field__area {
  width: 100%;
  font-family: inherit;
  font-size: var(--pixel-font-size-xs);
  padding: 0.65rem;
  color: var(--pixel-text);
  background: var(--pixel-bg);
  resize: vertical;
}
</style>
