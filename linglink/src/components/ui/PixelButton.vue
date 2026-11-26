<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    block?: boolean
    square?: boolean
  }>(),
  {
    variant: 'primary',
    type: 'button',
    disabled: false,
    block: false,
    square: false,
  },
)
</script>

<template>
  <button
    class="pixel-btn"
    :class="[`pixel-btn--${variant}`, { 'pixel-btn--block': block, 'pixel-btn--square': square }]"
    :type="type"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.pixel-btn {
  font-size: var(--pixel-font-size-xs);
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.3;
  padding: 0.82rem 1.2rem;
  cursor: pointer;
  touch-action: manipulation;
  border: var(--pixel-border-width) solid transparent;
  border-radius: var(--pixel-radius-pill);
  box-shadow: none;
}

.pixel-btn--block {
  display: block;
  width: 100%;
}

.pixel-btn--square {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  width: auto;
  min-width: 2.6rem;
  aspect-ratio: 1;
  padding: 0;
}

.pixel-btn--primary {
  background: var(--pixel-accent);
  color: var(--pixel-on-accent);
}

.pixel-btn--secondary {
  background: var(--pixel-surface);
  color: var(--pixel-text);
}

.pixel-btn--ghost {
  background: transparent;
  color: var(--pixel-text);
  border-color: var(--pixel-border);
}

.pixel-btn--danger {
  background: transparent;
  color: var(--pixel-danger);
  border-color: color-mix(in srgb, var(--pixel-danger) 35%, transparent);
}

.pixel-btn:not(:disabled):active {
  filter: var(--pixel-press-filter);
}

.pixel-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}
</style>
