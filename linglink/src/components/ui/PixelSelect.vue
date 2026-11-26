<script setup lang="ts">
import { useId } from 'vue'

export interface PixelSelectOption {
  value: string
  label: string
  disabled?: boolean
}

const model = defineModel<string>({ default: '' })

const props = defineProps<{
  label?: string
  options: PixelSelectOption[]
  disabled?: boolean
  inline?: boolean
}>()

const selectId = useId()

function onNativeChange(event: Event): void {
  const select = event.target as HTMLSelectElement
  const next = select.options[select.selectedIndex]?.value ?? select.value
  if (next !== model.value) model.value = next
}
</script>

<template>
  <div class="pixel-field" :class="{ 'pixel-field--inline': props.inline }">
    <label v-if="label" class="pixel-field__label" :for="selectId">{{ label }}</label>
    <span class="pixel-field__row">
      <select
        :id="selectId"
        class="pixel-field__select pixel-box"
        :disabled="disabled"
        :value="model"
        @change="onNativeChange"
        @input="onNativeChange"
      >
        <option v-for="opt in options" :key="opt.value" :value="opt.value" :disabled="opt.disabled">
          {{ opt.label }}
        </option>
      </select>
      <slot name="suffix" />
    </span>
  </div>
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

.pixel-field--inline {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.pixel-field--inline .pixel-field__label {
  margin-bottom: 0;
  text-transform: none;
  letter-spacing: 0;
  white-space: nowrap;
  font-weight: 600;
}

.pixel-field--inline .pixel-field__row {
  flex: 1;
  min-width: 0;
}

.pixel-field__select {
  flex: 1;
  min-width: 0;
  width: 100%;
  font-size: var(--pixel-font-size-xs);
  padding: 0.78rem 2.2rem 0.78rem 0.9rem;
  color: var(--pixel-text);
  background: var(--pixel-bg);
  border-radius: var(--pixel-radius-sm);
  box-shadow: none;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--pixel-text) 50%),
    linear-gradient(135deg, var(--pixel-text) 50%, transparent 50%);
  background-position:
    calc(100% - 1.1rem) calc(50% + 2px),
    calc(100% - 0.78rem) calc(50% + 2px);
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
}
</style>
