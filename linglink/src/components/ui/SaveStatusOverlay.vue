<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  phase: 'idle' | 'saving' | 'done'
  message?: string
}>()

const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <div v-if="phase !== 'idle'" class="overlay" role="status" aria-live="polite">
      <div class="panel pixel-box">
        <div class="icon" :class="{ 'icon--spin': phase === 'saving' }" aria-hidden="true">
          <svg v-if="phase === 'saving'" class="disk" viewBox="0 0 16 16">
            <path
              d="M3 2.2h8.2L13.8 5v8.8H3V2.2z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linejoin="round"
            />
            <path d="M5 2.2h6v3.2H5z" fill="currentColor" />
            <path d="M4.4 9.2h7.2v4.6H4.4z" fill="none" stroke="currentColor" stroke-width="1.3" />
          </svg>
          <svg v-else class="check" viewBox="0 0 16 16">
            <path
              d="M3.2 8.2L6.4 11.4 12.8 4.6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
          </svg>
          <span v-if="phase === 'saving'" class="spinner" />
        </div>
        <p class="label">{{ props.message ?? (phase === 'saving' ? t('common.saving') : t('learning.done')) }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: color-mix(in srgb, var(--pixel-bg) 72%, transparent);
}

.panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  min-width: 9rem;
  padding: 1.35rem 1.4rem 1.15rem;
}

.icon {
  position: relative;
  width: 2.6rem;
  height: 2.6rem;
  color: var(--pixel-text);
}

.disk,
.check {
  position: absolute;
  inset: 0.35rem;
  width: 1.9rem;
  height: 1.9rem;
  display: block;
}

.check {
  color: var(--pixel-success);
}

.spinner {
  position: absolute;
  inset: 0;
  border: 2px solid var(--pixel-surface);
  border-top-color: var(--pixel-accent);
  border-radius: 50%;
  animation: save-spin 0.7s linear infinite;
}

.label {
  margin: 0;
  font-size: var(--pixel-font-size-xs);
  text-align: center;
}

@keyframes save-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
    border-color: var(--pixel-accent);
  }
}
</style>
