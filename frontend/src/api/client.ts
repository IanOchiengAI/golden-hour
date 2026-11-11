import type {
  EmergencyRequest, OptionsResponse, Dispatch, DispatchActionResponse, AuditEvent, Role, RequestStatus,
} from '../types'

// Demo users seeded in backend (python manage.py seed_demo_users). All synthetic.
export const DEMO_CREDENTIALS = {
  clinician: { username: 'clinician@goldenhour.health', password: 'demo2026', role: 'clinician' as Role },
  officer: { username: 'officer@goldenhour.health', password: 'demo2026', role: 'blood_bank_officer' as Role },
  backup_officer: { username: 'backup.officer@goldenhour.health', password: 'demo2026', role: 'blood_bank_officer' as Role },
  moh: { username: 'moh@goldenhour.health', password: 'demo2026', role: 'moh_officer' as Role },
  lab: { username: 'lab@goldenhour.health', password: 'demo2026', role: 'lab_officer' as Role },
}

/** Lab officer login for a supplying site, e.g. HSP-001 → lab.hsp-001@goldenhour.health */
export const labUsername = (facilityId: string) => `lab.${facilityId.toLowerCase()}@goldenhour.health`

/** Turn a DRF error body into one readable line: {"reason": ["A reason is required."]} → "A reason is required." */
export function errorText(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  const b = body as Record<string, unknown>
  if (typeof b.detail === 'string') return b.detail
  const parts: string[] = []
  for (const [field, value] of Object.entries(b)) {
    const msgs = Array.isArray(value) ? value : [value]
    for (const m of msgs) {
      if (typeof m === 'string') parts.push(field === 'non_field_errors' ? m : `${field.replace(/_/g, ' ')}: ${m}`)
    }
  }
  return parts.length ? parts.join(' ') : fallback
}

const listOf = <T,>(res: { results: T[] } | T[]): T[] => (Array.isArray(res) ? res : res.results || [])

class ApiClient {
  private token: string | null = null
  /** Called when the server rejects the token (expired or revoked). */
  onUnauthorized: (() => void) | null = null

  setToken(token: string | null) {
    this.token = token
    if (token) {
      localStorage.setItem('gh_token', token)
    } else {
      localStorage.removeItem('gh_token')
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('gh_token')
    }
    return this.token
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {})
    headers.set('Content-Type', 'application/json')
    const token = this.getToken()
    if (token) {
      headers.set('Authorization', `Token ${token}`)
    }

    let response: Response
    try {
      response = await fetch(path, { ...options, headers })
    } catch {
      throw new Error('Cannot reach the server. Check the connection.')
    }
    if (response.status === 401 && path !== '/auth/login' && this.onUnauthorized) {
      this.onUnauthorized()
    }
    if (!response.ok) {
      let body: unknown = null
      try {
        body = await response.json()
      } catch {
        // not JSON (e.g. proxy error page)
      }
      const fallback = response.status >= 500 ? `Server error (${response.status}).` : `Request failed (${response.status}).`
      throw new Error(errorText(body, fallback))
    }
    return (await response.json()) as T
  }

  async login(username: string, password = 'demo2026') {
    const res = await this.request<{ token: string; username: string; role: Role; facility_id?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    this.setToken(res.token)
    return res
  }

  async createRequest(data: {
    patient_blood_group: string
    component: string
    units_requested: number
    urgency: string
    clinical_note?: string
    client_request_id?: string
  }): Promise<EmergencyRequest> {
    const payload = {
      ...data,
      client_request_id: data.client_request_id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`),
    }
    return this.request<EmergencyRequest>('/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async getRequestOptions(id: number): Promise<OptionsResponse> {
    return this.request<OptionsResponse>(`/requests/${id}/options`)
  }

  async getRequests(params?: { status?: RequestStatus[]; urgency?: string; limit?: number }): Promise<EmergencyRequest[]> {
    const query = new URLSearchParams()
    if (params?.status?.length) query.set('status', params.status.join(','))
    if (params?.urgency) query.set('urgency', params.urgency)
    if (params?.limit) query.set('limit', String(params.limit))
    const qs = query.toString() ? `?${query.toString()}` : ''
    return listOf(await this.request<{ results: EmergencyRequest[] } | EmergencyRequest[]>(`/requests${qs}`))
  }

  async getDispatches(params?: { status?: Dispatch['status'][]; limit?: number }): Promise<Dispatch[]> {
    const query = new URLSearchParams()
    if (params?.status?.length) query.set('status', params.status.join(','))
    if (params?.limit) query.set('limit', String(params.limit))
    const qs = query.toString() ? `?${query.toString()}` : ''
    return listOf(await this.request<{ results: Dispatch[] } | Dispatch[]>(`/dispatches${qs}`))
  }

  async getRequest(id: number): Promise<EmergencyRequest> {
    return this.request<EmergencyRequest>(`/requests/${id}`)
  }

  async submitDecision(
    requestId: number,
    action: 'accept' | 'change' | 'reject',
    optionId?: number,
    reason?: string
  ): Promise<EmergencyRequest> {
    return this.request<EmergencyRequest>(`/requests/${requestId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ action, option_id: optionId, reason }),
    })
  }

  async submitAuthorisation(
    requestId: number,
    action: 'approve' | 'reject' | 'stop' | 'review',
    reason?: string
  ): Promise<EmergencyRequest> {
    return this.request<EmergencyRequest>(`/requests/${requestId}/authorise`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    })
  }

  async releaseDispatch(
    dispatchId: number,
    action: 'confirm' | 'decline',
    transportMode?: 'vehicle' | 'motorbike' | 'public_service_vehicle',
    reason?: string
  ): Promise<DispatchActionResponse> {
    return this.request<DispatchActionResponse>(`/dispatches/${dispatchId}/release`, {
      method: 'POST',
      body: JSON.stringify({ action, transport_mode: transportMode, reason }),
    })
  }

  async updateDispatchStatus(
    dispatchId: number,
    status: 'in_transit' | 'received',
    coolboxMaxTempC?: number
  ): Promise<DispatchActionResponse> {
    return this.request<DispatchActionResponse>(`/dispatches/${dispatchId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, coolbox_max_temp_c: coolboxMaxTempC }),
    })
  }

  async getAudit(requestId: number): Promise<{ request_id: number; status: RequestStatus; events: AuditEvent[] }> {
    return this.request<{ request_id: number; status: RequestStatus; events: AuditEvent[] }>(`/audit?request_id=${requestId}`)
  }
}

export const api = new ApiClient()
