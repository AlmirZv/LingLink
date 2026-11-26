<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useRepositories } from '@/composables/useRepositories'
import { signInWithApple, signInWithEmail, signInWithGoogle } from '@/services/firebase/authService'
import { isFirebaseConfigured } from '@/services/firebase/initFirebase'
import { useSessionStore } from '@/stores/session'
import AppLogo from '@/components/ui/AppLogo.vue'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelCard from '@/components/ui/PixelCard.vue'
import PixelInput from '@/components/ui/PixelInput.vue'
import type { User } from '@/types/db'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()
const repos = useRepositories()

const authError = ref<string | null>(null)
const busy = ref(false)
const emailOpen = ref(false)
const email = ref('')
const password = ref('')

const firebaseAuth = isFirebaseConfigured() && import.meta.env.VITE_REPOSITORY_MODE === 'firebase'
const showApple = Capacitor.getPlatform() !== 'android'

function authPrefs() {
  return {
    interfaceLanguage: session.interfaceLanguage,
    learningLanguage: session.activeLearningLanguage,
  }
}

function enter(user: Pick<User, 'id' | 'displayName' | 'interfaceLanguage' | 'learningLanguages'>) {
  session.applyAuthenticatedUser(user)
  void router.push({ name: 'texts' })
}

async function run(action: () => Promise<void>) {
  authError.value = null
  busy.value = true
  try {
    await action()
  } catch (e) {
    authError.value = e instanceof Error ? e.message : 'Sign-in failed'
  } finally {
    busy.value = false
  }
}

function continueWithGoogle() {
  void run(async () => {
    if (!firebaseAuth) {
      session.completeMockAuth('админ')
      void router.push({ name: 'texts' })
      return
    }
    const user = await signInWithGoogle(repos, authPrefs())
    enter(user)
  })
}

function continueWithApple() {
  void run(async () => {
    if (!firebaseAuth) {
      session.completeMockAuth('админ')
      void router.push({ name: 'texts' })
      return
    }
    const user = await signInWithApple(repos, authPrefs())
    enter(user)
  })
}

function continueWithEmail() {
  if (!emailOpen.value) {
    emailOpen.value = true
    return
  }
  void run(async () => {
    if (!firebaseAuth) {
      session.completeMockAuth('админ')
      void router.push({ name: 'texts' })
      return
    }
    const user = await signInWithEmail(repos, email.value.trim(), password.value, authPrefs())
    enter(user)
  })
}
</script>

<template>
  <div class="onboarding-page app-container">
    <PixelCard :title="t('app.name')" :subtitle="t('app.tagline')">
      <AppLogo class="logo" />
      <p v-if="authError" class="error">{{ authError }}</p>
      <div class="auth-actions">
        <PixelButton block :disabled="busy" @click="continueWithGoogle">
          {{ t('auth.continueGoogle') }}
        </PixelButton>
        <PixelButton v-if="showApple" variant="secondary" block :disabled="busy" @click="continueWithApple">
          {{ t('auth.continueApple') }}
        </PixelButton>
        <PixelButton variant="ghost" block :disabled="busy" @click="continueWithEmail">
          {{ t('auth.continueEmail') }}
        </PixelButton>
        <template v-if="emailOpen">
          <PixelInput v-model="email" type="email" :label="t('auth.email')" :disabled="busy" />
          <PixelInput v-model="password" type="password" :label="t('auth.password')" :disabled="busy" />
          <PixelButton block :disabled="busy || !email.trim() || password.length < 6" @click="continueWithEmail">
            {{ t('auth.submitEmail') }}
          </PixelButton>
        </template>
      </div>
    </PixelCard>
  </div>
</template>

<style scoped>
.onboarding-page {
  padding-top: calc(2rem + var(--safe-top));
  padding-bottom: 2rem;
}

.logo {
  margin: 0 auto 1rem;
}

.auth-actions {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.error {
  margin: 0 0 0.65rem;
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
}
</style>
