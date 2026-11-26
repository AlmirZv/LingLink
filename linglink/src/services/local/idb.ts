const DB_NAME = 'linglink.local.v1'
const STORE = 'kv'

let opening: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
  return opening
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result as T | undefined)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return undefined
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    // Private mode / quota: keep going with memory only.
  }
}
