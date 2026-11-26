import { createApp } from 'vue'
import { createPinia } from 'pinia'

import { bindFirebaseAuth } from '@/services/firebase/authService'
import { createRepositories, resolveRepositoryMode } from '@/services/createRepositories'
import { REPOSITORIES_KEY } from '@/services/injection'
import { useSessionStore } from '@/stores/session'

import { localCacheReady, syncLocalCache } from '@/services/local/cachedRepositories'
import { clearClientError, reportClientError } from '@/reportClientError'

import App from './App.vue'
import { bindInstalledI18n, i18n } from './i18n'
import router from './router'

import '@/styles/pixel-theme.css'
import { hydrateAppearance } from '@/composables/useAppearance'

hydrateAppearance()

window.addEventListener('vite:preloadError', (event) => {
  reportClientError((event as Event & { payload?: unknown }).payload ?? 'preload')
  event.preventDefault()
})
window.addEventListener('error', (event) => {
  reportClientError(event.error ?? event.message)
})
window.addEventListener('unhandledrejection', (event) => {
  reportClientError(event.reason)
})
router.onError((error) => {
  reportClientError(error)
})
router.afterEach((to, _from, failure) => {
  if (!failure && to.name !== 'welcome') clearClientError()
})

bindInstalledI18n(i18n)

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(i18n)

const repos = createRepositories()
app.provide(REPOSITORIES_KEY, repos)

const session = useSessionStore(pinia)
session.hydrateFromStorage()

async function boot(): Promise<void> {
  clearClientError()
  if (resolveRepositoryMode() === 'firebase') {
    await bindFirebaseAuth(session, repos)
    app.mount('#app')
    void syncLocalCache(session.user?.id, 'boot').catch(() => undefined)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      void syncLocalCache(session.user?.id, 'resume').catch(() => undefined)
    })
    return
  }
  localCacheReady.value = true
  app.mount('#app')
}

void boot()
