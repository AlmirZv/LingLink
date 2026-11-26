const KEY = 'linglink.lastError'

export function reportClientError(error: unknown): void {
  const text =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error)
  try {
    sessionStorage.setItem(KEY, text)
  } catch {
    // The webview can block storage. The on-screen banner still updates.
  }
  window.dispatchEvent(new CustomEvent('linglink-error', { detail: text }))
}

export function readClientError(): string {
  try {
    return sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function clearClientError(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent('linglink-error', { detail: '' }))
}
