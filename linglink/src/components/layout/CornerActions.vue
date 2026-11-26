<script setup lang="ts">
defineProps<{
  showSearch?: boolean
  showAdd?: boolean
  onBack?: (() => void) | null
}>()

const emit = defineEmits<{
  search: []
  add: []
}>()
</script>

<template>
  <div v-if="showSearch || showAdd || onBack" class="corner-actions">
    <button
      v-if="onBack"
      type="button"
      class="corner-actions__btn"
      :aria-label="$t('common.back')"
      @click="onBack()"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M9.5 3.2L4.5 8l5 4.8M5 8h7"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <button
      v-if="showSearch"
      type="button"
      class="corner-actions__btn"
      :aria-label="$t('common.search')"
      @click="emit('search')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4" />
        <path
          d="M10.2 10.2L13.4 13.4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
    </button>
    <button
      v-if="showAdd"
      type="button"
      class="corner-actions__btn"
      :aria-label="$t('common.addText')"
      @click="emit('add')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 3.4v9.2M3.4 8h9.2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.corner-actions {
  position: fixed;
  left: 50%;
  bottom: calc(var(--bottom-nav-height) + var(--safe-bottom) + 0.85rem);
  z-index: 19;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.55rem;
  width: 100%;
  max-width: var(--app-max-width);
  padding-right: max(1.1rem, env(safe-area-inset-right, 0px));
  transform: translateX(-50%);
  pointer-events: none;
}

.corner-actions__btn {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.55rem;
  height: 2.55rem;
  padding: 0;
  border: 1px solid var(--pixel-border);
  border-radius: 50%;
  background: var(--pixel-bg-elevated);
  color: var(--pixel-text);
  box-shadow: var(--pixel-elev-shadow);
  cursor: pointer;
}

.corner-actions__btn svg {
  width: 1.1rem;
  height: 1.1rem;
  display: block;
}
</style>
