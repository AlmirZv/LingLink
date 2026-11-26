import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

import type { LanguageCode, User } from '@/types/db'
import type { SupportedUiLocale } from '@/constants/languages'
import { isSupportedUiLocale } from '@/constants/languages'
import { readStoredUiLocale, setUiLocale } from '@/i18n'
import { DEMO_CONTRIBUTOR_ID, DEMO_USER_ID } from '@/services/mock/constants'

const STORAGE_KEY = 'linglink.session.v1'

interface SessionDraft {
  onboardingComplete: boolean
  interfaceLanguage: SupportedUiLocale | null
  activeLearningLanguage: LanguageCode | null
  user: Pick<User, 'id' | 'displayName' | 'interfaceLanguage' | 'learningLanguages'> | null
}

function defaultDraft(): SessionDraft {
  return {
    onboardingComplete: false,
    interfaceLanguage: null,
    activeLearningLanguage: null,
    user: null,
  }
}

function loadDraft(): SessionDraft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultDraft()
    const parsed = JSON.parse(raw) as SessionDraft
    return { ...defaultDraft(), ...parsed }
  } catch {
    return defaultDraft()
  }
}

function saveDraft(draft: SessionDraft): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
}

export const useSessionStore = defineStore('session', () => {
  const draft = ref(loadDraft())

  const onboardingComplete = computed(() => draft.value.onboardingComplete)
  const interfaceLanguage = computed(() => draft.value.interfaceLanguage)
  const activeLearningLanguage = computed(() => draft.value.activeLearningLanguage)
  const user = computed(() => draft.value.user)
  const isAuthenticated = computed(() => draft.value.user !== null)

  function persist(): void {
    saveDraft(draft.value)
  }

  function setInterfaceLanguage(code: SupportedUiLocale): void {
    draft.value.interfaceLanguage = code
    if (draft.value.user) {
      draft.value.user = { ...draft.value.user, interfaceLanguage: code }
    }
    setUiLocale(code)
    persist()
  }

  function setDisplayName(displayName: string): void {
    if (!draft.value.user) return
    draft.value.user = { ...draft.value.user, displayName }
    persist()
  }

  function setActiveLearningLanguage(code: LanguageCode): void {
    draft.value.activeLearningLanguage = code
    persist()
  }

  function applyAuthenticatedUser(user: NonNullable<SessionDraft['user']>): void {
    draft.value.user = user
    draft.value.onboardingComplete = true
    if (user.learningLanguages[0]) {
      draft.value.activeLearningLanguage = user.learningLanguages[0]!
    }
    if (user.interfaceLanguage && isSupportedUiLocale(user.interfaceLanguage)) {
      draft.value.interfaceLanguage = user.interfaceLanguage
      setUiLocale(user.interfaceLanguage)
    }
    persist()
  }

  function completeMockAuth(displayName = 'Demo Reader'): void {
    const ui = draft.value.interfaceLanguage ?? 'en'
    const learning = draft.value.activeLearningLanguage ?? 'ja'

    applyAuthenticatedUser({
      id: DEMO_USER_ID,
      displayName,
      interfaceLanguage: ui,
      learningLanguages: [learning],
    })
  }

  function hydrateFromStorage(): void {
    draft.value = loadDraft()
    const chosen = readStoredUiLocale()
    if (chosen && chosen !== draft.value.interfaceLanguage) {
      draft.value.interfaceLanguage = chosen
      if (draft.value.user) {
        draft.value.user = { ...draft.value.user, interfaceLanguage: chosen }
      }
      persist()
    }
    if (draft.value.interfaceLanguage && isSupportedUiLocale(draft.value.interfaceLanguage)) {
      setUiLocale(draft.value.interfaceLanguage)
    }
  }

  function clearAuthenticatedUser(): void {
    if (!draft.value.user) return
    draft.value.user = null
    persist()
  }

  function resetSession(): void {
    draft.value = defaultDraft()
    persist()
  }

  function switchMockPersona(persona: 'reader' | 'contributor'): void {
    if (!draft.value.user) return
    if (persona === 'contributor') {
      draft.value.user = {
        ...draft.value.user,
        id: DEMO_CONTRIBUTOR_ID,
        displayName: 'Community Contributor',
      }
    } else {
      draft.value.user = {
        ...draft.value.user,
        id: DEMO_USER_ID,
        displayName: 'Demo Reader',
      }
    }
    persist()
  }

  return {
    onboardingComplete,
    interfaceLanguage,
    activeLearningLanguage,
    user,
    isAuthenticated,
    setInterfaceLanguage,
    setDisplayName,
    setActiveLearningLanguage,
    completeMockAuth,
    applyAuthenticatedUser,
    hydrateFromStorage,
    clearAuthenticatedUser,
    resetSession,
    switchMockPersona,
  }
})
