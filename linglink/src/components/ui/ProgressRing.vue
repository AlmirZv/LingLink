<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    max?: number
    label: string
    kind?: 'translation' | 'progress'
  }>(),
  { max: 100, kind: 'progress' },
)

const percent = computed(() => {
  if (props.max <= 0) return 0
  return Math.round(Math.min(100, Math.max(0, (props.value / props.max) * 100)))
})

const dash = computed(() => `${percent.value} 100`)
</script>

<template>
  <div class="ring" role="progressbar" :aria-label="`${label}: ${percent}%`" :aria-valuenow="percent" :aria-valuemax="100">
    <svg class="ring__svg" viewBox="0 0 36 36" aria-hidden="true">
      <circle class="ring__track" cx="18" cy="18" r="15.9155" fill="none" />
      <circle class="ring__fill" cx="18" cy="18" r="15.9155" fill="none" :stroke-dasharray="dash" />
    </svg>
    <svg class="ring__glyph" viewBox="0 0 16 16" aria-hidden="true">
      <g v-if="kind === 'translation'" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
        <path d="M1.8 3.2h6.2v5H5.4L2.2 10.2V3.2z" />
        <path d="M8.2 6.4h6v4.6h-2.4L9.2 13.4V6.4z" />
      </g>
      <g v-else fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
        <circle cx="8" cy="5.4" r="2.2" />
        <path d="M3.2 13.2c.6-2.5 2.3-3.7 4.8-3.7s4.2 1.2 4.8 3.7" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.ring {
  position: relative;
  width: 0.9rem;
  height: 0.9rem;
  flex: 0 0 auto;
  color: var(--pixel-text);
}

.ring__svg {
  width: 100%;
  height: 100%;
  display: block;
  transform: rotate(-90deg);
}

.ring__track,
.ring__fill {
  stroke-width: 2.4;
}

.ring__track {
  stroke: var(--pixel-border);
}

.ring__fill {
  stroke: currentColor;
  stroke-linecap: round;
}

.ring__glyph {
  position: absolute;
  inset: 18%;
  width: 64%;
  height: 64%;
  display: block;
}
</style>
