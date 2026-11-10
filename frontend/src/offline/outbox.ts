import type { Description, KeyValueStorage, OutboxItem, RaiseRequestPayload, Sender } from './types.ts'

export interface OutboxDeps {
  storage: KeyValueStorage
  send: Sender
  now?: () => Date
  storageKey?: string
  /**
   * Who is logged in (for example the username). Required, so a hook-up cannot forget it. Each item
   * remembers who raised it, and is only shown to, retried for, and sent under the login of that
   * same user. Without it, anyone who logs in on the device would send the previous user's
   * requests under their own login. Pass `() => null` only if the app has no logins.
   */
  owner: () => string | null
  /** How long delivered or refused items stay on the device. Default 1 hour. Unsent items are never dropped. */
  keepResolvedMs?: number
  /** Called after every attempt: true when the server itself replied (even with an error), false when nothing came back or only a gateway answered (502, 503, 504). */
  onReachability?: (reachable: boolean) => void
}

const DEFAULT_KEY = 'gh_outbox_v1'
const ID_PATTERN = /^[A-Za-z0-9._:-]{8,64}$/

/** A random id that passes the backend's client_request_id check (8 to 64 of A-Z a-z 0-9 . _ : -). */
export function defaultNewId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

/** The readable part of an error body: {"detail": "..."} or {"field": ["message"]}. */
export function detailFrom(body: unknown): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    if (typeof record.detail === 'string') return record.detail
    const parts = Object.entries(record).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(' ') : String(value)}`)
    if (parts.length > 0) return parts.join('; ')
  }
  return ''
}

/**
 * Replies that come from a gateway or proxy in front of the server, not from the server itself.
 * They mean the server could not be reached, so they must not count as "the server answered".
 */
export const GATEWAY_ERRORS: readonly number[] = [502, 503, 504]

/** What a reply means for the outbox. Anything that might succeed on a later try stays queued. */
export function classify(status: number, body: unknown): { state: 'delivered' | 'queued' | 'rejected'; error?: string } {
  const detail = detailFrom(body)
  if (status === 200 || status === 201) return { state: 'delivered' }
  if (status === 401) return { state: 'queued', error: detail || 'Your login has expired. Log in again, then retry.' }
  if (status === 429) return { state: 'queued', error: detail || 'Too many requests. Wait a moment, then retry.' }
  if (GATEWAY_ERRORS.includes(status)) return { state: 'queued', error: detail || `The server could not be reached (${status}).` }
  if (status >= 500) return { state: 'queued', error: detail || `The server had a problem (${status}).` }
  return { state: 'rejected', error: detail || `The server refused this request (${status}).` }
}

export function describeItem(item: OutboxItem): Description {
  const p = item.payload
  const what = `${p.units_requested} unit(s) ${p.component} for a ${p.patient_blood_group} patient`
  switch (item.state) {
    case 'sending':
      return { headline: 'Sending', detail: `${what}. Not confirmed yet.`, tone: 'warn', canRetry: false }
    case 'delivered': {
      const reply = (item.response ?? {}) as { id?: number; status?: string }
      const number = reply.id ? ` #${reply.id}` : ''
      if (reply.status === 'HandledManually') {
        return {
          headline: `Request${number} raised, but no stock was found`,
          detail: `${what}. Handle this one by phone.`,
          tone: 'warn',
          canRetry: false,
        }
      }
      return { headline: `Request${number} raised`, detail: `${what}. Received by the system.`, tone: 'ok', canRetry: false }
    }
    case 'queued':
      return {
        headline: 'NOT SENT',
        detail: `${what}. This request has not reached the blood bank. Call them now. ${item.lastError ?? ''}`.trim(),
        tone: 'bad',
        canRetry: true,
      }
    case 'rejected':
      return {
        headline: 'REFUSED',
        detail: `${what}. ${item.lastError ?? 'The server refused this request.'} Check the details and raise it again, or call the blood bank.`,
        tone: 'bad',
        canRetry: false,
      }
  }
}

/** Once a request is settled, the clinical note is no longer needed on the device. */
function withoutNote<T>(value: T): T {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'clinical_note' in value) {
    const { clinical_note: _dropped, ...rest } = value as Record<string, unknown>
    return rest as T
  }
  return value
}

const sameNeed = (a: RaiseRequestPayload, b: RaiseRequestPayload): boolean =>
  a.patient_blood_group === b.patient_blood_group &&
  a.component === b.component &&
  a.units_requested === b.units_requested &&
  a.urgency === b.urgency

/**
 * A queue of requests that have not been confirmed by the server yet.
 *
 * The rules that keep it safe for blood requests:
 * - Each request is written to storage BEFORE the first attempt, so a closed tab never loses it.
 * - Each request has one id (sent as client_request_id) and every retry reuses it. The backend
 *   answers a repeated id with the original request, so a retry can never raise a second one.
 *   submit() requires that id from the caller, one per form, so tapping Submit again for the same
 *   form while it is NOT SENT cannot queue a second copy.
 * - A failure is shown as NOT SENT. The outbox never reports success the server did not give.
 * - An item belongs to the user who raised it (see `owner`).
 * - Only raising a request is queued. Decisions, authorisations and releases are not: they depend
 *   on the live state of the request and the held units, so they must reach the server to count.
 *
 * One page at a time: the queue is kept in memory and written to storage on every change.
 */
export function createOutbox(deps: OutboxDeps) {
  const key = deps.storageKey ?? DEFAULT_KEY
  const now = deps.now ?? (() => new Date())
  const keepResolvedMs = deps.keepResolvedMs ?? 3_600_000
  const pending = new Map<string, Promise<OutboxItem>>()
  const listeners = new Set<() => void>()
  let changes = 0

  const mine = (i: OutboxItem): boolean => (i.owner ?? null) === deps.owner()
  const settled = (i: OutboxItem): boolean => i.state === 'delivered' || i.state === 'rejected'

  /** Forget settled items older than keepResolvedMs. Unsent items are never dropped. */
  function pruned(list: OutboxItem[]): OutboxItem[] {
    const cutoff = now().getTime() - keepResolvedMs
    return list.filter((i) => !settled(i) || new Date(i.updatedAt).getTime() > cutoff)
  }

  function load(): OutboxItem[] {
    try {
      const raw = deps.storage.getItem(key)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      if (!Array.isArray(parsed)) return []
      // An attempt that was in flight when the page closed has an unknown result.
      // Treat it as not sent. Retrying is safe because the id is reused.
      return pruned((parsed as OutboxItem[]).map((i) => (i.state === 'sending' ? { ...i, state: 'queued' as const } : i)))
    } catch {
      return []
    }
  }

  let items: OutboxItem[] = load()

  function save(): void {
    items = pruned(items)
    try {
      deps.storage.setItem(key, JSON.stringify(items))
    } catch {
      // Storage full or blocked. The queue still lives in memory for this session.
    }
    changes++
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // A broken listener must not break the queue.
      }
    }
  }

  function update(id: string, patch: Partial<OutboxItem>): OutboxItem {
    let updated: OutboxItem | undefined
    const stamp = now().toISOString()
    items = items.map((i) => (i.id === id ? (updated = { ...i, ...patch, updatedAt: stamp }) : i))
    if (!updated) throw new Error(`Unknown outbox item ${id}`)
    save()
    return updated
  }

  async function attempt(id: string): Promise<OutboxItem> {
    const item = items.find((i) => i.id === id)
    if (!item) throw new Error(`Unknown outbox item ${id}`)
    // Already settled by another path (a manual Retry, an earlier flush): never send again or change its state.
    if (settled(item)) return item
    update(id, { state: 'sending', attempts: item.attempts + 1, lastError: undefined, lastStatus: undefined })
    try {
      const { status, body } = await deps.send({ ...item.payload, client_request_id: id })
      deps.onReachability?.(!GATEWAY_ERRORS.includes(status))
      const verdict = classify(status, body)
      if (verdict.state === 'queued') {
        return update(id, { state: 'queued', lastStatus: status, lastError: verdict.error })
      }
      return update(id, {
        state: verdict.state,
        lastStatus: status,
        lastError: verdict.error,
        payload: withoutNote(item.payload),
        response: verdict.state === 'delivered' ? withoutNote(body) : undefined,
      })
    } catch {
      deps.onReachability?.(false)
      return update(id, { state: 'queued', lastStatus: undefined, lastError: 'No connection to the server.' })
    }
  }

  /** One attempt at a time per item, however many callers ask. */
  function run(id: string): Promise<OutboxItem> {
    const existing = pending.get(id)
    if (existing) return existing
    const promise = attempt(id).finally(() => pending.delete(id))
    pending.set(id, promise)
    return promise
  }

  return {
    /**
     * Queue a request and try to send it. Resolves with its final state: delivered, queued (NOT SENT) or rejected.
     *
     * `options.id` is required: one id per FORM, made when the form opens and renewed after it
     * succeeds. Tapping Submit again for the same form (a double tap, or a retry while NOT SENT)
     * returns the same item, so it can never raise a second request. A different form, even with
     * identical contents, is a different request: it may be another patient.
     */
    async submit(payload: RaiseRequestPayload, options: { id: string }): Promise<OutboxItem> {
      if (!ID_PATTERN.test(options.id)) {
        throw new Error('id must be 8 to 64 characters of letters, digits, . _ : or -')
      }
      const existing = items.find((i) => i.id === options.id && mine(i))
      if (existing) return run(existing.id)
      const stamp = now().toISOString()
      const item: OutboxItem = {
        id: options.id,
        payload,
        state: 'queued',
        attempts: 0,
        createdAt: stamp,
        updatedAt: stamp,
        owner: deps.owner(),
      }
      items = [...items, item]
      save()
      return run(item.id)
    },

    /** Try one queued item again, with the same id. Delivered and refused items are returned unchanged. */
    retry(id: string): Promise<OutboxItem> {
      const item = items.find((i) => i.id === id && mine(i))
      if (!item) return Promise.reject(new Error(`Unknown outbox item ${id}`))
      return run(id)
    },

    /** Try every queued item again, oldest first. Call it when the connection returns. */
    async flush(): Promise<OutboxItem[]> {
      const results: OutboxItem[] = []
      for (const queued of items.filter((i) => i.state === 'queued' && mine(i))) {
        const current = items.find((i) => i.id === queued.id)
        if (!current || current.state !== 'queued') continue // removed, or handled by another path meanwhile
        results.push(await run(current.id))
      }
      return results
    },

    /**
     * Be told when anything in the queue changes, including a background retry delivering a request.
     * Returns a function that stops the notifications. With React:
     * `useSyncExternalStore(outbox.subscribe, outbox.version)`, then read `outbox.list()` while rendering.
     */
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    /** A number that goes up on every change. Use it as the snapshot for useSyncExternalStore. */
    version(): number {
      return changes
    },

    /**
     * This user's requests that were delivered but that the screen has not been told about yet, each
     * returned exactly once. A request delivered by a background retry while the user was on another
     * tab, or before a reload, still comes back here, so the screen can say "Request #N raised"
     * instead of the NOT SENT banner just vanishing.
     */
    takeDelivered(): OutboxItem[] {
      const fresh = items.filter((i) => mine(i) && i.state === 'delivered' && !i.acknowledged)
      if (fresh.length === 0) return []
      const ids = new Set(fresh.map((i) => i.id))
      items = items.map((i) => (ids.has(i.id) ? { ...i, acknowledged: true } : i))
      save()
      return fresh.map((i) => ({ ...i }))
    },

    /** This user's items, oldest first. */
    list(): OutboxItem[] {
      return items.filter(mine).map((i) => ({ ...i }))
    },

    /** This user's requests that have not reached the server. Warn before logging out if it is above zero. */
    unsentCount(): number {
      return items.filter((i) => mine(i) && (i.state === 'queued' || i.state === 'sending')).length
    },

    /** This user's unsent requests that ask for the same thing. Check before submit() to warn "you already have one". */
    unsentLike(payload: RaiseRequestPayload): OutboxItem[] {
      return items.filter((i) => mine(i) && (i.state === 'queued' || i.state === 'sending') && sameNeed(i.payload, payload)).map((i) => ({ ...i }))
    },

    /** Drop one of this user's items. Not allowed while it is being sent. */
    remove(id: string): boolean {
      const item = items.find((i) => i.id === id && mine(i))
      if (!item || pending.has(id)) return false
      items = items.filter((i) => i.id !== id)
      save()
      return true
    },

    /** Forget this user's delivered and refused items now. */
    clearResolved(): void {
      items = items.filter((i) => !(mine(i) && settled(i)))
      save()
    },
  }
}

export type Outbox = ReturnType<typeof createOutbox>
