import type { KeyValueStorage } from './types.ts'

/** Storage that lives only as long as the page. Used in tests and as a fallback. */
export function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

/** localStorage, or an in-memory copy when the browser blocks it (private window, blocked site data). */
export function browserStorage(): KeyValueStorage {
  try {
    const probe = '__gh_probe__'
    globalThis.localStorage.setItem(probe, '1')
    globalThis.localStorage.removeItem(probe)
    return globalThis.localStorage
  } catch {
    return memoryStorage()
  }
}
