import { onMounted, onUnmounted, ref } from 'vue'

import {
  applyAppConfig,
  fetchAppClientConfig,
  readStoredAppBlock,
  subscribeAppClientConfig,
} from '@/services/appGate'

export function useForceUpdate() {
  const blocked = ref(readStoredAppBlock())
  const downloadUrl = ref('')

  let stop: (() => void) | null = null

  function apply(config: Parameters<typeof applyAppConfig>[0]) {
    const next = applyAppConfig(config)
    blocked.value = next.blocked
    downloadUrl.value = next.downloadUrl
  }

  async function refresh() {
    try {
      apply(await fetchAppClientConfig())
    } catch {
      if (!readStoredAppBlock()) blocked.value = false
    }
  }

  function onVisible() {
    if (document.visibilityState !== 'visible') return
    void refresh()
  }

  onMounted(() => {
    stop = subscribeAppClientConfig(apply)
    document.addEventListener('visibilitychange', onVisible)
    void refresh()
  })

  onUnmounted(() => {
    stop?.()
    document.removeEventListener('visibilitychange', onVisible)
  })

  return { blocked, downloadUrl }
}
