import { useState } from 'react'
import { usePolling } from './usePolling'
import { api } from '../api/client'
import type { Dispatch, EmergencyRequest, RequestStatus } from '../types'

export interface Resource<T> {
  data: T
  loaded: boolean
  error: string | null
  reload: () => void
}

/** Fetch now and every `ms` (only while the tab is visible). */
export function usePolled<T>(fetcher: () => Promise<T>, initial: T, ms = 15000, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T>(initial)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reload = () => {
    fetcher()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoaded(true))
  }
  usePolling(reload, ms, deps)
  return { data, loaded, error, reload }
}

/**
 * Up to 200 most recent requests this user may see (the backend's list maximum).
 * Stats and tables are computed from these. A paged API is a backend next step.
 */
export const useRequests = (status?: RequestStatus[], ms = 15000) =>
  usePolled<EmergencyRequest[]>(() => api.getRequests({ status, limit: 200 }), [], ms, [status?.join(',')])

export const useDispatches = (status?: Dispatch['status'][], ms = 15000) =>
  usePolled<Dispatch[]>(() => api.getDispatches({ status, limit: 200 }), [], ms, [status?.join(',')])
