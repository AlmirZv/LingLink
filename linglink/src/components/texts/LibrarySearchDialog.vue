<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import PixelButton from '@/components/ui/PixelButton.vue'
import PixelDialog from '@/components/ui/PixelDialog.vue'
import PixelInput from '@/components/ui/PixelInput.vue'
import type { TextSearchField } from '@/composables/useTextSearch'

const props = defineProps<{
  open: boolean
  initialQuery?: string
  initialField?: TextSearchField
}>()

const emit = defineEmits<{
  close: []
  search: [{ query: string; field: TextSearchField }]
}>()

const { t } = useI18n()

const fields: TextSearchField[] = ['word', 'topic', 'title']
const field = ref<TextSearchField>('word')
const query = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    field.value = props.initialField && fields.includes(props.initialField) ? props.initialField : 'word'
    query.value = props.initialQuery ?? ''
  },
)

function submit() {
  const q = query.value.trim()
  if (!q) return
  emit('search', { query: q, field: field.value })
}
</script>

<template>
  <PixelDialog
    :open="open"
    placement="center"
    :title="t('common.search')"
    @close="emit('close')"
  >
    <div class="fields" role="radiogroup" :aria-label="t('common.search')">
      <button
        v-for="item in fields"
        :key="item"
        type="button"
        class="field"
        role="radio"
        :aria-checked="field === item"
        :class="{ 'field--on': field === item }"
        @click="field = item"
      >
        {{ t(`search.field.${item}`) }}
      </button>
    </div>
    <PixelInput
      v-model="query"
      class="query"
      type="search"
      :placeholder="t('search.placeholder')"
      @keyup.enter="submit"
    />
    <PixelButton class="submit" block :disabled="!query.trim()" @click="submit">
      {{ t('common.search') }}
    </PixelButton>
  </PixelDialog>
</template>

<style scoped>
.fields {
  display: flex;
  gap: 0.35rem;
}

.field {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0.5rem 0.25rem;
  border: 1px solid var(--pixel-border);
  border-radius: var(--pixel-radius-pill);
  background: var(--pixel-bg);
  color: var(--pixel-text);
  font: inherit;
  font-size: var(--pixel-font-size-xs);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.field--on {
  background: var(--pixel-accent);
  border-color: var(--pixel-accent);
  color: var(--pixel-on-accent);
}

.query {
  display: block;
  margin-top: 0.85rem;
}

.submit {
  margin-top: 0.75rem;
}
</style>
