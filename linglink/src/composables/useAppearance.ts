import { ref } from 'vue'

export type AppTheme = 'dark' | 'light'

export const APPEARANCE_STORAGE_KEY = 'linglink.theme.v1'

const THEME_COLORS: Record<AppTheme, string> = {
  dark: '#141311',
  light: '#f4f0e6',
}

function isAppTheme(value: string | null): value is AppTheme {
  return value === 'dark' || value === 'light'
}

export function readStoredTheme(): AppTheme {
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    return isAppTheme(stored) ? stored : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme: AppTheme): void {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', THEME_COLORS[theme])
}

const theme = ref<AppTheme>(readStoredTheme())

export function hydrateAppearance(): void {
  theme.value = readStoredTheme()
  applyTheme(theme.value)
}

export function useAppearance() {
  function setTheme(next: AppTheme): void {
    theme.value = next
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, next)
    } catch {
      /* Private mode can block storage; the page still switches. */
    }
    applyTheme(next)
  }

  return { theme, setTheme }
}
