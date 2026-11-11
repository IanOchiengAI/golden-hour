// Shapes shared by the offline helpers. No React, no network and no browser globals in this file.

/** What the clinician typed. The same fields POST /requests takes. */
export interface RaiseRequestPayload {
  patient_blood_group: string
  component: string
  units_requested: number
  urgency: string
  clinical_note?: string
}

/**
 * sending    an attempt is in flight.
 * queued     NOT SENT. The server did not accept it: no connection, server error, rate limit or
 *            expired login. Safe to retry, because every retry reuses the same client_request_id.
 * delivered  The server accepted it (201, or 200 when it recognised a retry).
 * rejected   The server refused it for good (bad input, not allowed, conflict). Do not retry.
 */
export type OutboxState = 'sending' | 'queued' | 'delivered' | 'rejected'

export interface OutboxItem {
  /** Sent to the server as client_request_id. Created once and reused on every retry. */
  id: string
  payload: RaiseRequestPayload
  state: OutboxState
  attempts: number
  createdAt: string
  updatedAt: string
  /** Who raised it. Only that user sees it or sends it. */
  owner?: string | null
  /** Set once the screen has been handed this delivered request (see takeDelivered). */
  acknowledged?: boolean
  lastStatus?: number
  lastError?: string
  /** The server's reply once delivered: the request, with its real id and status. */
  response?: unknown
}

export interface SendResult {
  status: number
  body: unknown
}

/**
 * Sends one request. Resolves with the HTTP status for ANY reply from the server, including
 * errors. Throws only when no reply arrived at all (no connection, timeout).
 */
export type Sender = (body: RaiseRequestPayload & { client_request_id: string }) => Promise<SendResult>

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Plain-language text for the screen. */
export interface Description {
  headline: string
  detail: string
  tone: 'ok' | 'warn' | 'bad'
  canRetry: boolean
}
