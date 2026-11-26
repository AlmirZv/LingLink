<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AppLogo from '@/components/ui/AppLogo.vue'

const { t } = useI18n()
const route = useRoute()

const tabs = [
  { name: 'texts', to: { name: 'texts' }, labelKey: 'nav.library' },
  { name: 'words', to: { name: 'words' }, labelKey: 'nav.words' },
  { name: 'me', to: { name: 'me' }, labelKey: 'nav.me' },
] as const

const LIBRARY_ROUTE_NAMES = new Set([
  'texts',
  'text-preview',
  'text-community',
  'text-supplement',
  'search',
])

const ME_ROUTE_NAMES = new Set(['me', 'settings', 'add-text', 'my-texts', 'me-stub', 'text-translate'])

function isTabActive(tabName: (typeof tabs)[number]['name']): boolean {
  const name = typeof route.name === 'string' ? route.name : ''
  switch (tabName) {
    case 'texts':
      return LIBRARY_ROUTE_NAMES.has(name) && route.query.from !== 'me'
    case 'words':
      return name === 'words' || name === 'word-detail' || name === 'word-edit'
    case 'me':
      return ME_ROUTE_NAMES.has(name) || (name === 'text-preview' && route.query.from === 'me')
    default:
      return false
  }
}
</script>

<template>
  <nav class="bottom-nav" aria-label="Main">
    <div class="bottom-nav__brand" aria-hidden="true">
      <AppLogo class="bottom-nav__logo" size="3.15rem" />
    </div>
    <RouterLink
      v-for="tab in tabs"
      :key="tab.name"
      :to="tab.to"
      class="bottom-nav__item"
      :class="{ 'bottom-nav__item--active': isTabActive(tab.name) }"
      active-class=""
      exact-active-class=""
    >
      <svg class="bottom-nav__icon" viewBox="0 0 16 16" aria-hidden="true">
        <g
          v-if="tab.name === 'texts'"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linejoin="round"
        >
          <path d="M3.2 3.2h9.6v9.6H3.2z" />
          <path d="M5.4 6.2h5.2M5.4 8.2h5.2M5.4 10.2h3.4" />
        </g>
        <g
          v-else-if="tab.name === 'words'"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linejoin="round"
          stroke-linecap="round"
        >
          <path d="M1.9 12.8L4.95 3.8h1.2L9.2 12.8" />
          <path d="M3.25 9.45h4.4" />
          <circle cx="12.35" cy="10.35" r="2.45" />
          <path d="M14.8 7.7v5.1" />
        </g>
        <g
          v-else
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linejoin="round"
        >
          <circle cx="8" cy="5.6" r="2.2" />
          <path d="M3.4 13c.6-2.4 2.2-3.6 4.6-3.6s4 1.2 4.6 3.6" />
        </g>
      </svg>
      <span class="bottom-nav__label">{{ t(tab.labelKey) }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: var(--app-max-width);
  display: grid;
  grid-template-columns: auto repeat(3, 1fr);
  padding-bottom: var(--safe-bottom);
  background: color-mix(in srgb, var(--pixel-bg-elevated) 92%, transparent);
  backdrop-filter: blur(18px);
  border-top: 1px solid var(--pixel-border);
  z-index: 20;
}

.bottom-nav__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  padding: 0.55rem 0.25rem;
  min-height: var(--bottom-nav-height);
  text-decoration: none;
  color: var(--pixel-text-muted);
  font-size: var(--pixel-font-size-xs);
}

.bottom-nav__item--active {
  color: var(--pixel-text);
}

.bottom-nav__icon {
  width: 1.2rem;
  height: 1.2rem;
  display: block;
  overflow: visible;
}

.bottom-nav__label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-align: center;
  line-height: 1.3;
}

.bottom-nav__brand {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: var(--bottom-nav-height);
  padding: 0.18rem 0.15rem 0.18rem 0.45rem;
  pointer-events: none;
  user-select: none;
}

.bottom-nav__brand :deep(.app-logo) {
  width: calc(var(--bottom-nav-height) - 1.15rem) !important;
  height: calc(var(--bottom-nav-height) - 1.15rem) !important;
}
</style>
