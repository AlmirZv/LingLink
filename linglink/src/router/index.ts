import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'

import AppShell from '@/components/layout/AppShell.vue'
import { resolveRepositoryMode } from '@/services/createRepositories'
import { useSessionStore } from '@/stores/session'
import AuthView from '@/views/auth/AuthView.vue'
import LearningLanguageView from '@/views/onboarding/LearningLanguageView.vue'
import UiLanguageView from '@/views/onboarding/UiLanguageView.vue'
import WelcomeView from '@/views/onboarding/WelcomeView.vue'

const ONBOARDING_ROUTE_NAMES = new Set([
  'welcome',
  'onboarding-ui-language',
  'onboarding-learning-language',
  'auth',
])

const router = createRouter({
  // The phone WebView drops a normal /onboarding/... navigation and leaves Welcome in place.
  // A hash stays on index.html, so the same click can change the screen.
  history: import.meta.env.DEV
    ? createWebHistory(import.meta.env.BASE_URL)
    : createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/welcome',
      name: 'welcome',
      component: WelcomeView,
      meta: { titleKey: 'onboarding.welcomeTitle' },
    },
    {
      path: '/onboarding/ui-language',
      name: 'onboarding-ui-language',
      component: UiLanguageView,
      meta: { titleKey: 'onboarding.uiLanguage' },
    },
    {
      path: '/onboarding/learning-language',
      name: 'onboarding-learning-language',
      component: LearningLanguageView,
      meta: { titleKey: 'onboarding.learningLanguage' },
    },
    {
      path: '/auth',
      name: 'auth',
      component: AuthView,
      meta: { titleKey: 'app.name' },
    },
    {
      path: '/',
      component: AppShell,
      meta: { requiresOnboarding: true },
      children: [
        {
          path: '',
          name: 'texts',
          component: () => import('@/views/TextsView.vue'),
          meta: {
            titleKey: 'nav.library',
            showSearch: true,
            showAddText: true,
          },
        },
        {
          path: 'texts',
          redirect: '/',
        },
        {
          path: 'texts/:id/prepare',
          redirect: (to) => ({ name: 'text-preview', params: { id: to.params.id }, query: to.query }),
        },
        {
          path: 'texts/:id/batch',
          redirect: (to) => ({ name: 'text-preview', params: { id: to.params.id }, query: to.query }),
        },
        {
          path: 'texts/:id/read',
          redirect: (to) => ({ name: 'text-preview', params: { id: to.params.id }, query: to.query }),
        },
        {
          path: 'texts/:id/completed',
          redirect: (to) => ({ name: 'text-preview', params: { id: to.params.id }, query: to.query }),
        },
        {
          path: 'texts/:id/round-done',
          redirect: (to) => ({ name: 'text-preview', params: { id: to.params.id }, query: to.query }),
        },
        {
          path: 'texts/:id/translate',
          name: 'text-translate',
          component: () => import('@/views/TextTranslationView.vue'),
          meta: { titleKey: 'analysis.previewTitle' },
        },
        {
          path: 'texts/:id/community',
          name: 'text-community',
          component: () => import('@/views/TextCommunityView.vue'),
          meta: { titleKey: 'community.title' },
        },
        {
          path: 'texts/:id/source',
          name: 'text-source',
          component: () => import('@/views/TextSourceEditView.vue'),
          meta: { titleKey: 'texts.edit' },
        },
        {
          path: 'texts/:id/supplement',
          name: 'text-supplement',
          component: () => import('@/views/TextTranslationView.vue'),
          meta: { titleKey: 'texts.supplement' },
        },
        {
          path: 'texts/:id',
          name: 'text-preview',
          component: () => import('@/views/TextPreviewView.vue'),
          meta: { titleKey: 'nav.library' },
        },
        {
          path: 'words/:wordId/edit',
          name: 'word-edit',
          component: () => import('@/views/WordEditView.vue'),
          meta: { titleKey: 'words.editTitle' },
        },
        {
          path: 'words/:wordId',
          name: 'word-detail',
          component: () => import('@/views/WordDetailView.vue'),
          meta: { titleKey: 'nav.words' },
        },
        {
          path: 'words',
          name: 'words',
          component: () => import('@/views/WordsView.vue'),
          meta: { titleKey: 'nav.words' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { titleKey: 'me.settings' },
        },
        {
          path: 'add-text',
          name: 'add-text',
          component: () => import('@/views/AddTextView.vue'),
          meta: { titleKey: 'me.addText' },
        },
        {
          path: 'me',
          name: 'me',
          component: () => import('@/views/MeView.vue'),
          meta: { titleKey: 'nav.me' },
        },
        {
          path: 'me/my-texts',
          name: 'my-texts',
          component: () => import('@/views/MyTextsView.vue'),
          meta: { titleKey: 'me.myTexts' },
        },
        {
          path: 'me/:section',
          name: 'me-stub',
          component: () => import('@/views/MeStubView.vue'),
          meta: { titleKey: 'nav.me' },
        },
        {
          path: 'search',
          redirect: '/',
        },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const session = useSessionStore()

  const routeName = typeof to.name === 'string' ? to.name : ''
  const firebaseMode = resolveRepositoryMode() === 'firebase'

  if (firebaseMode && !session.isAuthenticated && !ONBOARDING_ROUTE_NAMES.has(routeName)) {
    return { name: session.onboardingComplete ? 'auth' : 'welcome' }
  }

  if (to.meta.requiresOnboarding && !session.onboardingComplete) {
    return { name: 'welcome' }
  }

  if (session.onboardingComplete && session.isAuthenticated && ONBOARDING_ROUTE_NAMES.has(routeName)) {
    return { name: 'texts' }
  }

  return true
})

export default router
