<script setup lang="ts">
const model = defineModel<boolean>({ default: false })

defineProps<{
  label: string
  disabled?: boolean
}>()
</script>

<template>
  <label class="pixel-checkbox" :class="{ 'pixel-checkbox--disabled': disabled }">
    <input v-model="model" type="checkbox" class="pixel-checkbox__input" :disabled="disabled" />
    <span class="pixel-checkbox__box pixel-box" aria-hidden="true" />
    <span class="pixel-checkbox__label">{{ label }}</span>
  </label>
</template>

<style scoped>
.pixel-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  cursor: pointer;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
}

.pixel-checkbox--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pixel-checkbox__input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.pixel-checkbox__box {
  flex-shrink: 0;
  width: 1.15rem;
  height: 1.15rem;
  margin-top: 0.15rem;
  background: var(--pixel-bg);
  border-radius: 0.3rem;
  box-shadow: none;
}

.pixel-checkbox__input:checked + .pixel-checkbox__box {
  background: var(--pixel-accent);
  box-shadow: inset 0 0 0 2px var(--pixel-bg);
}

.pixel-checkbox__label {
  flex: 1;
}
</style>
