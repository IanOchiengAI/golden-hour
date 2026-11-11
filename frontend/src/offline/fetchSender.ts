import type { Sender } from './types.ts'

export interface FetchSenderOptions {
  /** The login token, or null when logged out. */
  getToken: () => string | null
  baseUrl?: string
  /** Give up waiting after this long. Default 15 seconds, which suits a slow 2G link. */
  timeoutMs?: number
  /** For tests. Defaults to the browser's fetch. */
  fetchFn?: (input: string, init: RequestInit) => Promise<Response>
}

/**
 * A Sender for POST /requests that reports the HTTP status for every reply, so the outbox can tell
 * "the server refused this" from "nothing came back". Uses fetch directly, so the app's own API
 * client does not need to change.
 */
export function createFetchSender(options: FetchSenderOptions): Sender {
  const doFetch = options.fetchFn ?? ((input: string, init: RequestInit) => fetch(input, init))
  return async (body) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = options.getToken()
    if (token) headers.Authorization = `Token ${token}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000)
    try {
      const response = await doFetch(`${options.baseUrl ?? ''}/requests`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      let parsed: unknown = null
      try {
        parsed = await response.json()
      } catch {
        parsed = null
      }
      return { status: response.status, body: parsed }
    } finally {
      clearTimeout(timer)
    }
  }
}
