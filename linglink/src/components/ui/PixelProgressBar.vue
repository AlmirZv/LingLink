<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    max?: number
    label?: string
  }>(),
  { max: 100 },
)

const percent = computed(() => {
  if (props.max <= 0) return 0
  return Math.min(100, Math.max(0, (props.value / props.max) * 100))
})
</script>

<template>
  <div class="pixel-progress">
    <div v-if="label" class="pixel-progress__label">
      <span>{{ label }}</span>
      <span>{{ Math.round(percent) }}%</span>
    </div>
    <div class="pixel-progress__track pixel-box" role="progressbar" :aria-valuenow="value" :aria-valuemax="max">
      <div class="pixel-progress__fill" :style="{ width: `${percent}%` }" />
    </div>
  </div>
</template>

<style scoped>
.pixel-progress__label {
  display: flex;
  justify-content: space-between;
  font-size: var(--pixel-font-size-xs);
  margin-bottom: 0.35rem;
  color: var(--pixel-text-muted);
}

.pixel-progress__track {
  height: 0.45rem;
  padding: 0;
  background: var(--pixel-surface);
  box-shadow: none;
  overflow: hidden;
}

.pixel-progress__fill {
  height: 100%;
  background: var(--pixel-accent);
  border-radius: inherit;
  transition: width 0.35s ease;
}
</style>
