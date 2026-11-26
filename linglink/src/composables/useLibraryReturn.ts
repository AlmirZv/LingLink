import { nextTick, ref, watch } from 'vue'
import { useRoute, type RouteLocationNormalizedLoaded, type RouteLocationRaw } from 'vue-router'

const STORAGE_KEY = 'linglink.libraryReturn.v1'

const CATALOG_ROUTE_NAMES = new Set(['texts', 'home', 'search', 'me-stub'])

export type LibraryReturnState = {
  name: string
  params?: Record<string, string>
  query?: Record<string, string | string[]>
  textId: string
}

function stringifyQuery(
  query: RouteLocationNormalizedLoaded['query'],
): Record<string, string | string[]> | undefined {
  const entries = Object.entries(query).filter(([, value]) => value !== undefined && value !== null)
  if (!entries.length) return undefined
  return Object.fromEntries(
    entries.map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : String(value)]),
  )
}

export function rememberLibraryReturn(textId: string, from: RouteLocationNormalizedLoaded) {
  const onCatalog = typeof from.name === 'string' && CATALOG_ROUTE_NAMES.has(from.name)
  const name = onCatalog ? String(from.name) : 'texts'
  const state: LibraryReturnState = {
    name,
    textId,
  }
  if (name === 'me-stub') {
    state.params = { section: String(from.params.section ?? 'saved') }
  }
  const query = onCatalog ? stringifyQuery(from.query) : undefined
  if (query) state.query = query
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function peekLibraryReturn(): LibraryReturnState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LibraryReturnState
  } catch {
    return null
  }
}

export function rememberLibraryExpand(textId: string) {
  const previous = peekLibraryReturn()
  const name =
    previous?.name && CATALOG_ROUTE_NAMES.has(previous.name) ? previous.name : 'texts'
  const state: LibraryReturnState = {
    name,
    textId,
  }
  if (previous?.params) state.params = previous.params
  if (previous?.query) state.query = previous.query
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function libraryReturnLocation(): RouteLocationRaw {
  const state = peekLibraryReturn()
  if (!state) return { name: 'texts' }
  return {
    name: state.name,
    params: state.params,
    query: state.query,
  }
}

const requestedLibraryTextId = ref<string | null>(null)

export function requestLibraryTextCard(textId: string) {
  rememberLibraryExpand(textId)
  requestedLibraryTextId.value = textId
}

export function watchLibraryTextCard(
  textId: () => string,
  onRequested: (open: boolean) => void,
) {
  watch(requestedLibraryTextId, (id) => {
    if (!id) return
    onRequested(id === textId())
  })
}

export function shouldExpandLibraryCard(textId: string): boolean {
  return peekLibraryReturn()?.textId === textId
}

export function libraryCardSelector(textId: string): string {
  return `[data-library-text-id="${CSS.escape(textId)}"]`
}

export function scrollToLibraryCard(textId: string): boolean {
  const el = document.querySelector(libraryCardSelector(textId))
  if (!(el instanceof HTMLElement)) return false
  const top = el.getBoundingClientRect().top + window.scrollY
  window.scrollTo(0, Math.max(0, top))
  return true
}

export function useRestoreLibraryReturn(ready: () => boolean) {
  const route = useRoute()
  let restored = false

  watch(
    () => [ready(), route.name, route.params.section] as const,
    () => {
      if (restored || !ready()) return
      const state = peekLibraryReturn()
      if (!state || state.name !== route.name) return
      if (state.name === 'me-stub' && String(route.params.section ?? '') !== String(state.params?.section ?? '')) {
        return
      }
      void nextTick(() => {
        if (!scrollToLibraryCard(state.textId)) return
        restored = true
        sessionStorage.removeItem(STORAGE_KEY)
      })
    },
    { flush: 'post', immediate: true },
  )
}
