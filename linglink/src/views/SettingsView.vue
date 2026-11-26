<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { CONTENT_LANGUAGE_OPTIONS, isSupportedUiLocale, MVP_LANGUAGE_OPTIONS } from '@/constants/languages'
import { useRepositories } from '@/composables/useRepositories'
import { resolveRepositoryMode } from '@/services/createRepositories'
import { signOutFirebase } from '@/services/firebase/authService'
import { DEMO_CONTRIBUTOR_ID } from '@/services/mock/constants'
import { useSessionStore } from '@/stores/session'
import PixelButton from '@/components/ui/PixelButton.vue'
import PixelInput from '@/components/ui/PixelInput.vue'
import PixelSelect from '@/components/ui/PixelSelect.vue'

const { t, locale } = useI18n()
const router = useRouter()
const session = useSessionStore()
const repos = useRepositories()

const nickname = ref(session.user?.displayName ?? '')
const savingName = ref(false)
const nameError = ref('')

const canSaveNickname = computed(() => {
  const next = nickname.value.trim()
  return next.length > 0 && next !== session.user?.displayName
})

const uiLocaleOptions = computed(() =>
  MVP_LANGUAGE_OPTIONS.map((l) => ({
    value: l.code,
    label: `${l.flag} ${l.nativeName}`,
  })),
)

const learningOptions = computed(() =>
  CONTENT_LANGUAGE_OPTIONS.map((l) => ({
    value: l.code,
    label: `${l.flag} ${l.nativeName}`,
  })),
)

const mockPersonaOptions = [
  { value: 'reader', label: 'Demo Reader' },
  { value: 'contributor', label: 'Community Contributor' },
]

const mockMode = resolveRepositoryMode() === 'mock'

const mockPersona = computed(() =>
  session.user?.id === DEMO_CONTRIBUTOR_ID ? 'contributor' : 'reader',
)

async function saveNickname() {
  const next = nickname.value.trim()
  const current = session.user
  if (!current || !next || next === current.displayName || savingName.value) return
  savingName.value = true
  nameError.value = ''
  try {
    const stored = await repos.users.getById(current.id)
    await repos.users.upsert({
      id: current.id,
      displayName: next,
      interfaceLanguage: stored?.interfaceLanguage ?? current.interfaceLanguage,
      learningLanguages: stored?.learningLanguages?.length
        ? stored.learningLanguages
        : current.learningLanguages,
      knownLanguages: stored?.knownLanguages ?? [],
      createdAt: stored?.createdAt ?? new Date().toISOString(),
    })
    session.setDisplayName(next)
    nickname.value = next
  } catch (error) {
    nameError.value = error instanceof Error ? error.message : t('common.loading')
  } finally {
    savingName.value = false
  }
}

async function persistLanguagePrefs(): Promise<void> {
  const current = session.user
  if (!current || resolveRepositoryMode() !== 'firebase') return
  try {
    const stored = await repos.users.getById(current.id)
    await repos.users.upsert({
      id: current.id,
      displayName: stored?.displayName?.trim() || current.displayName,
      interfaceLanguage: session.interfaceLanguage ?? stored?.interfaceLanguage ?? 'ru',
      learningLanguages: session.activeLearningLanguage
        ? [session.activeLearningLanguage]
        : stored?.learningLanguages?.length
          ? stored.learningLanguages
          : current.learningLanguages,
      knownLanguages: stored?.knownLanguages ?? [],
      createdAt: stored?.createdAt ?? new Date().toISOString(),
    })
  } catch {
    // The choice is already stored on the device. A failed profile write must not block the screen.
  }
}

function onUiLocaleChange(code: string) {
  if (!isSupportedUiLocale(code)) return
  session.setInterfaceLanguage(code)
  void persistLanguagePrefs()
}

function onLearningChange(code: string) {
  session.setActiveLearningLanguage(code)
  void persistLanguagePrefs()
}

function onMockPersonaChange(value: string) {
  session.switchMockPersona(value === 'contributor' ? 'contributor' : 'reader')
}

async function logout() {
  if (resolveRepositoryMode() === 'firebase') await signOutFirebase()
  session.resetSession()
  void router.push({ name: 'welcome' })
}
</script>

<template>
  <div class="settings">
    <PixelInput v-model="nickname" :label="t('settings.nickname')" :disabled="savingName">
      <template #suffix>
        <PixelButton
          class="save-nick"
          :class="{ 'save-nick--busy': savingName }"
          square
          :disabled="!canSaveNickname && !savingName"
          :aria-busy="savingName"
          :aria-label="savingName ? t('common.saving') : t('common.save')"
          @click="saveNickname"
        >
          <span v-if="savingName" class="save-nick__spin" aria-hidden="true" />
          <svg v-else class="save-nick__check" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3.2 8.2L6.4 11.4 12.8 4.6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </PixelButton>
      </template>
    </PixelInput>
    <p v-if="nameError" class="name-error">{{ nameError }}</p>
    <PixelSelect
      class="field-gap"
      :label="t('onboarding.uiLanguage')"
      :options="uiLocaleOptions"
      :model-value="locale"
      @update:model-value="onUiLocaleChange"
    />
    <PixelSelect
      class="field-gap"
      :label="t('onboarding.learningLanguage')"
      :options="learningOptions"
      :model-value="session.activeLearningLanguage ?? 'ja'"
      @update:model-value="onLearningChange"
    />
    <PixelSelect
      v-if="mockMode && session.user"
      class="field-gap"
      :label="t('settings.mockPersona')"
      :options="mockPersonaOptions"
      :model-value="mockPersona"
      @update:model-value="onMockPersonaChange"
    />
    <PixelButton class="field-gap" variant="secondary" block @click="logout">
      {{ t('settings.logoutAccount') }}
    </PixelButton>
  </div>
</template>

<style scoped>
.field-gap {
  margin-top: 0.75rem;
}

:deep(.save-nick--busy) {
  opacity: 1;
  cursor: wait;
}

.save-nick__check {
  width: 1.15rem;
  height: 1.15rem;
  display: block;
}

.save-nick__spin {
  width: 1rem;
  height: 1rem;
  border: 2px solid color-mix(in srgb, var(--pixel-on-accent) 32%, transparent);
  border-top-color: var(--pixel-on-accent);
  border-radius: 50%;
  animation: nick-spin 0.7s linear infinite;
}

.name-error {
  margin: 0.5rem 0 0;
  color: var(--pixel-danger);
  font-size: var(--pixel-font-size-xs);
}

@keyframes nick-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .save-nick__spin {
    animation: none;
    border-color: var(--pixel-on-accent);
  }
}
</style>
