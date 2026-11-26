<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import AppLogo from '@/components/ui/AppLogo.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelCard from '@/components/ui/PixelCard.vue'
import { reportClientError } from '@/reportClientError'

const { t } = useI18n()
const router = useRouter()
const failure = ref('')
let lastStart = 0

function describe(value: unknown): string {
  if (value && typeof value === 'object') {
    const record = value as {
      message?: unknown
      type?: unknown
      from?: { fullPath?: string }
      to?: { fullPath?: string }
    }
    const parts = [
      record.type != null ? `type ${String(record.type)}` : '',
      record.from?.fullPath ? `from ${record.from.fullPath}` : '',
      record.to?.fullPath ? `to ${record.to.fullPath}` : '',
      typeof record.message === 'string' ? record.message : '',
    ].filter(Boolean)
    if (parts.length) return parts.join(' · ')
  }
  if (value instanceof Error && value.message) return value.message
  return String(value)
}

function continueOnboarding() {
  const now = Date.now()
  if (now - lastStart < 800) return
  lastStart = now
  failure.value = ''
  if (!router) {
    const text = 'router missing'
    failure.value = text
    reportClientError(text)
    return
  }
  void router
    .push({ name: 'onboarding-ui-language' })
    .then((result) => {
      if (!result) return
      const text = describe(result)
      failure.value = text
      reportClientError(text)
    })
    .catch((error: unknown) => {
      const text = describe(error)
      failure.value = text
      reportClientError(error)
    })
}
</script>

<template>
  <div class="onboarding-page app-container">
    <PixelCard :title="t('onboarding.welcomeTitle')" :subtitle="t('app.tagline')">
      <AppLogo class="logo" />
      <p v-if="failure" class="failure">{{ failure }}</p>
      <PixelButton block @click="continueOnboarding">{{ t('common.continue') }}</PixelButton>
    </PixelCard>
  </div>
</template>

<style scoped>
.onboarding-page {
  padding-top: calc(2rem + var(--safe-top));
  padding-bottom: 2rem;
}

.logo {
  margin: 0 auto 1.25rem;
}

.failure {
  margin: 0 0 0.75rem;
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
  line-height: 1.4;
}
</style>
