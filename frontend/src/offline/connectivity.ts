export type ReachabilityState = 'unknown' | 'reachable' | 'unreachable'

/**
 * Whether the SERVER answers, judged from real calls. The browser's own online flag only says the
 * device has a network. It stays "online" when the API is down or the signal is too weak to use.
 * Record the result of every API call, then show state() instead of navigator.onLine.
 */
export function createReachability(now: () => Date = () => new Date()) {
  let lastOk: number | null = null
  let lastFail: number | null = null
  let changes = 0
  const listeners = new Set<() => void>()
  function announce(): void {
    changes++
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // A broken listener must not break the tracker.
      }
    }
  }
  const state = (): ReachabilityState => {
    if (lastOk === null && lastFail === null) return 'unknown'
    if (lastFail !== null && (lastOk === null || lastFail >= lastOk)) return 'unreachable'
    return 'reachable'
  }
  return {
    record(ok: boolean): void {
      const before = state()
      const t = now().getTime()
      if (ok) lastOk = t
      else lastFail = t
      if (state() !== before) announce() // only a real change is news
    },
    state,
    lastReachableAt(): Date | null {
      return lastOk === null ? null : new Date(lastOk)
    },
    /** Be told when the state changes. With React: `useSyncExternalStore(reachability.subscribe, reachability.version)`. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    version(): number {
      return changes
    },
  }
}
