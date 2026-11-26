<script setup lang="ts">
const model = defineModel<string>({ default: '' })

withDefaults(
  defineProps<{
    label?: string
    placeholder?: string
    type?: 'text' | 'email' | 'password' | 'search'
    disabled?: boolean
    multiline?: boolean
    rows?: number
  }>(),
  { multiline: false, rows: 4 },
)
</script>

<template>
  <label class="pixel-field">
    <span v-if="label" class="pixel-field__label">{{ label }}</span>
    <span class="pixel-field__row" :class="{ 'pixel-field__row--multiline': multiline }">
      <textarea
        v-if="multiline"
        v-model="model"
        class="pixel-field__input pixel-field__input--area pixel-box"
        :placeholder="placeholder"
        :disabled="disabled"
        :rows="rows"
      />
      <input
        v-else
        v-model="model"
        class="pixel-field__input pixel-box"
        :type="type ?? 'text'"
        :placeholder="placeholder"
        :disabled="disabled"
      />
      <slot name="suffix" />
    </span>
  </label>
</template>

<style scoped>
.pixel-field {
  display: block;
}

.pixel-field__label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 0.4rem;
  color: var(--pixel-text-muted);
}

.pixel-field__row {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
}

.pixel-field__row--multiline {
  align-items: flex-start;
}

.pixel-field__input {
  flex: 1;
  min-width: 0;
  width: 100%;
  font-size: var(--pixel-font-size-xs);
  padding: 0.78rem 0.9rem;
  color: var(--pixel-text);
  background: var(--pixel-bg);
  border-radius: var(--pixel-radius-sm);
  box-shadow: none;
}

.pixel-field__input::placeholder {
  color: var(--pixel-text-muted);
  opacity: 0.7;
}

.pixel-field__input--area {
  min-height: 5.5rem;
  resize: vertical;
  line-height: 1.45;
}

.pixel-field__input:disabled {
  opacity: 0.5;
}
</style>
