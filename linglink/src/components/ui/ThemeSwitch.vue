<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useAppearance } from '@/composables/useAppearance'

const { t } = useI18n()
const { theme, setTheme } = useAppearance()

function toggle() {
  setTheme(theme.value === 'dark' ? 'light' : 'dark')
}
</script>

<template>
  <button
    type="button"
    class="theme-switch"
    role="switch"
    :aria-checked="theme === 'dark'"
    :aria-label="t('settings.theme')"
    :title="theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')"
    @click="toggle"
  >
    <span class="theme-switch__track" aria-hidden="true">
      <span class="theme-switch__thumb" />
    </span>
  </button>
</template>

<style scoped>
.theme-switch {
  flex: 0 0 auto;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.theme-switch__track {
  display: block;
  width: 2.55rem;
  height: 1.45rem;
  padding: 0.14rem;
  border-radius: 999px;
  background: var(--pixel-surface);
  box-sizing: border-box;
}

.theme-switch[aria-checked='true'] .theme-switch__track {
  background: var(--pixel-accent);
}

.theme-switch__thumb {
  display: block;
  width: 1.17rem;
  height: 1.17rem;
  border-radius: 50%;
  background: var(--pixel-bg-elevated);
  box-shadow: 0 1px 3px rgb(0 0 0 / 18%);
  transform: translateX(0);
  transition: transform 0.16s ease;
}

.theme-switch[aria-checked='true'] .theme-switch__thumb {
  transform: translateX(1.1rem);
  background: var(--pixel-on-accent);
}
</style>
