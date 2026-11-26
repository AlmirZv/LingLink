<script setup lang="ts">
import TextIconButton from '@/components/texts/TextIconButton.vue'
import PixelInput from '@/components/ui/PixelInput.vue'
import type { TranslationChoice } from '@/services/translationChoices'

defineProps<{
  label: string
  items: string[]
  options: TranslationChoice[]
  expanded: boolean
  adding: boolean
  addLabel: string
  expandLabel: string
  collapseLabel: string
  likeLabel: string
  dislikeLabel: string
  emptyLabel: string
  placeholder: string
  banLabel?: string
}>()

const draft = defineModel<string>('draft', { default: '' })

const emit = defineEmits<{
  toggle: []
  plus: []
  vote: [id: string, value: 1 | -1]
}>()
</script>

<template>
  <section class="field">
    <div class="field__row">
      <p class="field__summary">
        <span class="field__label">{{ label }}</span>
        {{ items.length ? items.join(', ') : emptyLabel }}
      </p>
      <button
        type="button"
        class="icon"
        :aria-label="expanded ? collapseLabel : expandLabel"
        :title="expanded ? collapseLabel : expandLabel"
        @click="emit('toggle')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            :d="expanded ? 'M3.5 10.2L8 5.8l4.5 4.4' : 'M3.5 5.8L8 10.2l4.5-4.4'"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        class="icon"
        :aria-label="addLabel"
        :title="addLabel"
        :disabled="Boolean(banLabel)"
        @click="emit('plus')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.4" />
        </svg>
      </button>
    </div>
    <p v-if="banLabel" class="note">{{ banLabel }}</p>
    <div v-if="expanded" class="choices">
      <div v-for="option in options" :key="option.id" class="choice">
        <p class="choice__label">{{ option.label }}</p>
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
    <PixelInput v-if="adding" v-model="draft" class="add" :label="addLabel" :placeholder="placeholder" :disabled="Boolean(banLabel)" />
  </section>
</template>

<style scoped>
.field {
  margin-top: 0.85rem;
}

.field__row {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
}

.field__summary {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
}

.field__label {
  display: block;
  margin-bottom: 0.15rem;
  color: var(--pixel-text-muted);
}

.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  flex: none;
  border: 1px solid var(--pixel-border);
  border-radius: 50%;
  background: var(--pixel-bg);
  color: var(--pixel-text-muted);
  box-shadow: none;
  cursor: pointer;
}

.icon svg {
  width: 1rem;
  height: 1rem;
}

.icon:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.choices {
  margin-top: 0.45rem;
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
  margin: 0;
  padding: 0.65rem 0.75rem;
  font-size: var(--pixel-font-size-xs);
  text-align: left;
  color: var(--pixel-text);
  background: var(--pixel-bg);
  border: 1px solid var(--pixel-border);
  border-radius: var(--pixel-radius-sm);
}

.choice__votes {
  display: flex;
  gap: 0.3rem;
  flex: none;
}

.add {
  margin-top: 0.45rem;
}

.note {
  margin: 0.35rem 0 0;
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
}
</style>
