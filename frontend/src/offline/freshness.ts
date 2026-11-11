import type { KeyValueStorage } from './types.ts'

export interface Freshness {
  /** For example "as of 01:30 (4 min ago)". */
  label: string
  stale: boolean
  ageMinutes: number
}

/** How old a piece of data is, in words a ward can read. Times are in the device's local time. */
export function freshness(fetchedAt: string | Date, now: Date = new Date(), staleAfterMinutes = 5): Freshness {
  const at = typeof fetchedAt === 'string' ? new Date(fetchedAt) : fetchedAt
  if (Number.isNaN(at.getTime())) return { label: 'as of an unknown time', stale: true, ageMinutes: Number.POSITIVE_INFINITY }
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000))
  const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  const ago = ageMinutes < 1 ? 'just now' : `${ageMinutes} min ago`
  return { label: `as of ${clock} (${ago})`, stale: ageMinutes >= staleAfterMinutes, ageMinutes }
}

export interface Cached<T> {
  value: T
  fetchedAt: string
}

/** Keep the last good answer, so a screen can show it (marked with its age) while offline. */
export function writeCache<T>(storage: KeyValueStorage, key: string, value: T, now: Date = new Date()): Cached<T> {
  const entry: Cached<T> = { value, fetchedAt: now.toISOString() }
  try {
    storage.setItem(key, JSON.stringify(entry))
  } catch {
    // Storage full or blocked: the caller still has the entry in hand.
  }
  return entry
}

export function readCache<T>(storage: KeyValueStorage, key: string): Cached<T> | null {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached<T>
    return parsed && typeof parsed.fetchedAt === 'string' ? parsed : null
  } catch {
    return null
  }
}
