<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

let lockedScrollY = 0
let scrollLocked = false

const props = withDefaults(
  defineProps<{
    title: string
    open: boolean
    placement?: 'bottom' | 'center'
    highlightTitle?: boolean
    hideTitle?: boolean
    hideClose?: boolean
  }>(),
  { placement: 'bottom', highlightTitle: false, hideTitle: false, hideClose: false },
)

const emit = defineEmits<{
  close: []
}>()

function unlockPageScroll() {
  if (!scrollLocked) return
  scrollLocked = false
  document.body.style.overflow = ''
  window.scrollTo(0, lockedScrollY)
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      lockedScrollY = window.scrollY
      scrollLocked = true
      document.body.style.overflow = 'hidden'
      return
    }
    unlockPageScroll()
  },
  { immediate: true },
)

onBeforeUnmount(unlockPageScroll)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="backdrop"
      :class="placement === 'center' ? 'backdrop--center' : 'backdrop--bottom'"
      role="presentation"
      @click.self="emit('close')"
    >
      <div class="panel pixel-border" role="dialog" aria-modal="true" :aria-label="title">
        <header class="header" :class="{ 'header--close-only': hideTitle && !$slots['header-end'] && hideClose }">
          <h2 v-if="!hideTitle" class="title" :class="{ 'title--highlight': highlightTitle }">{{ title }}</h2>
          <slot name="header-end">
            <button v-if="!hideClose" type="button" class="close pixel-text-muted" @click="emit('close')">
              ×
            </button>
          </slot>
        </header>
        <div class="body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  padding: 1rem;
  background: rgb(20 19 17 / 42%);
}

.backdrop--bottom {
  align-items: flex-end;
}

.backdrop--center {
  align-items: center;
  overflow: hidden;
}

.backdrop--center .panel {
  max-width: min(36rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
}

.panel {
  width: 100%;
  max-width: 28rem;
  max-height: min(85vh, 32rem);
  overflow: auto;
  background: var(--pixel-bg-elevated);
  padding: 1rem 1.1rem 1.15rem;
  border-radius: var(--pixel-radius);
  box-shadow: var(--pixel-elev-shadow);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.header > :last-child {
  margin-left: auto;
  flex: 0 0 auto;
}

.header--close-only {
  justify-content: flex-end;
  margin-bottom: 0.35rem;
}

.title {
  margin: 0;
  font-size: var(--pixel-font-size-md);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.3;
}

.title--highlight {
  color: var(--pixel-accent);
  font-size: var(--pixel-font-size-md);
  line-height: 1.5;
}

.close {
  border: none;
  background: transparent;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.25rem;
}
</style>
