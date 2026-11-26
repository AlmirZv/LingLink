<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { CONTENT_LANGUAGE_OPTIONS } from '@/constants/languages'
import type { LanguageCode } from '@/types/db'
import { useSessionStore } from '@/stores/session'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelCard from '@/components/ui/PixelCard.vue'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()

const selected = ref<LanguageCode>(
  session.activeLearningLanguage ?? CONTENT_LANGUAGE_OPTIONS.find((l) => l.code === 'ja')?.code ?? 'ja',
)

function select(code: LanguageCode) {
  selected.value = code
  session.setActiveLearningLanguage(code)
}

function next() {
  session.setActiveLearningLanguage(selected.value)
  void router.push({ name: 'auth' })
}
</script>

<template>
  <div class="onboarding-page app-container">
    <PixelCard :title="t('onboarding.learningLanguage')">
      <ul class="lang-list">
        <li v-for="lang in CONTENT_LANGUAGE_OPTIONS" :key="lang.code">
          <button
            type="button"
            class="lang-option pixel-box"
            :class="{ 'lang-option--active': selected === lang.code }"
            @click="select(lang.code)"
          >
            <span class="lang-option__flag">{{ lang.flag }}</span>
            <span>{{ lang.nativeName }}</span>
          </button>
        </li>
      </ul>
      <PixelButton class="next-btn" block @click="next">{{ t('common.continue') }}</PixelButton>
    </PixelCard>
  </div>
</template>

<style scoped>
.onboarding-page {
  padding-top: calc(2rem + var(--safe-top));
  padding-bottom: 2rem;
}

.lang-list {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.lang-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  font-family: inherit;
  font-size: var(--pixel-font-size-xs);
  color: var(--pixel-text);
  background: var(--pixel-bg);
  cursor: pointer;
  text-align: left;
}

.lang-option--active {
  background: color-mix(in srgb, var(--pixel-success) 20%, var(--pixel-bg));
  border-color: var(--pixel-success);
}

.lang-option__flag {
  font-size: 1.25rem;
  line-height: 1;
}

.next-btn {
  margin-top: 0.5rem;
}
</style>
