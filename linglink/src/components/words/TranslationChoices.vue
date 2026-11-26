<script setup lang="ts">
import TextIconButton from '@/components/texts/TextIconButton.vue'
import { normalizeWordStress } from '@/constants/languages'
import type { TranslationChoice } from '@/services/translationChoices'

defineProps<{
  label: string
  options: TranslationChoice[]
  likeLabel: string
  dislikeLabel: string
}>()

const selected = defineModel<string>({ default: '' })

const emit = defineEmits<{
  vote: [id: string, value: 1 | -1]
}>()

function choose(id: string) {
  selected.value = id
}

function labelOf(option: TranslationChoice): string {
  const label = normalizeWordStress(option.label)
  return option.furigana ? `${label}（${option.furigana}）` : label
}
</script>

<template>
  <div class="choices">
    <p class="choices__label">{{ label }}</p>
    <div
      v-for="option in options"
      :key="option.id"
      class="choice"
      :class="{ 'choice--selected': option.id === selected }"
    >
      <button type="button" class="choice__label" @click="choose(option.id)">
        {{ labelOf(option) }}
      </button>
      <span v-if="option.human" class="choice__votes">
        <TextIconButton
          name="like"
          tone="like"
          :active="option.mine === 1"
          :count="option.up"
          :label="likeLabel"
          @click="emit('vote', option.id, 1)"
        />
        <TextIconButton
          name="dislike"
          tone="dislike"
          :active="option.mine === -1"
          :count="option.down"
          :label="dislikeLabel"
          @click="emit('vote', option.id, -1)"
        />
      </span>
    </div>
  </div>
</template>

<style scoped>
.choices__label {
  margin: 0 0 0.35rem;
  font-size: var(--pixel-font-size-xs);
  color: var(--pixel-text-muted);
}

.choice {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}

.choice__label {
  flex: 1;
  min-width: 0;
  font-family: 'Noto Sans', 'Segoe UI', sans-serif;
  font-size: var(--pixel-font-size-xs);
  text-align: left;
  padding: 0.65rem 0.75rem;
  color: var(--pixel-text);
  background: var(--pixel-bg);
  border: 1px solid var(--pixel-border);
  border-radius: var(--pixel-radius-sm);
  cursor: pointer;
}

.choice--selected .choice__label {
  border-color: var(--pixel-accent);
}

.choice__votes {
  display: flex;
  gap: 0.3rem;
  flex: none;
}
</style>
