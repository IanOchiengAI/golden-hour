import { useEffect, useRef, useState } from 'react'

/** Current time, ticking every second (for countdowns). */
export function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/**
 * Run `fn` now, every `ms` while the tab is visible, and when the window regains focus,
 * so each role sees the status the previous role just set without a manual reload.
 */
export function usePolling(fn: () => void, ms = 10000, deps: unknown[] = []) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    ref.current()
    const tick = () => {
      if (document.visibilityState === 'visible') ref.current()
    }
    const id = window.setInterval(tick, ms)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps])
}

/** The supplying site of the latest dispatch, so the Lab role opens at the right site. */
export const lastDispatchSite = {
  get: (): string | null => localStorage.getItem('gh_last_dispatch_site'),
  set: (facilityId?: string | null) => {
    if (facilityId) localStorage.setItem('gh_last_dispatch_site', facilityId)
  },
}
