import type { EmergencyRequest, OptionsResponse, Dispatch, AuditEvent, Role } from '../types'

// Demo users seeded in backend
export const DEMO_CREDENTIALS = {
  clinician: { username: 'clinician@goldenhour.health', password: 'demo2026', facility_id: 'HSP-002', role: 'clinician' as Role, title: 'Ward Clinician (HSP-002)' },
  officer: { username: 'officer@goldenhour.health', password: 'demo2026', facility_id: 'RBTC-NBO', role: 'blood_bank_officer' as Role, title: 'Blood Bank Officer (RBTC Nairobi)' },
  backup_officer: { username: 'backup.officer@goldenhour.health', password: 'demo2026', facility_id: 'RBTC-NBO', role: 'blood_bank_officer' as Role, title: 'Backup Officer (Escalation)' },
  moh: { username: 'moh@goldenhour.health', password: 'demo2026', facility_id: '', role: 'moh_officer' as Role, title: 'Ministry of Health Authorising Officer' },
  lab: { username: 'lab@goldenhour.health', password: 'demo2026', facility_id: 'RBTC-NBO', role: 'lab_officer' as Role, title: 'Supplying Lab Officer (RBTC Nairobi)' },
}

class ApiClient {
  private token: string | null = null

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

    try {
      const response = await fetch(path, { ...options, headers })
      if (!response.ok) {
        let errorDetail = `Request failed: ${response.status} ${response.statusText}`
        try {
          const errJson = await response.json()
          if (errJson.detail) errorDetail = errJson.detail
          else if (typeof errJson === 'object') errorDetail = JSON.stringify(errJson)
        } catch {
          // ignore json parse error
        }
        throw new Error(errorDetail)
      }
      return (await response.json()) as T
    } catch (err: unknown) {
      console.warn(`API call to ${path} encountered error:`, err)
      throw err
    }
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
  }): Promise<EmergencyRequest> {
    return this.request<EmergencyRequest>('/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getRequestOptions(id: number): Promise<OptionsResponse> {
    return this.request<OptionsResponse>(`/requests/${id}/options`)
  }

  async getRequests(params?: { status?: string }): Promise<{ results: EmergencyRequest[] } | EmergencyRequest[]> {
    const qs = params?.status ? `?status=${encodeURIComponent(params.status)}` : ''
    return this.request<{ results: EmergencyRequest[] } | EmergencyRequest[]>(`/requests${qs}`)
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
  ): Promise<Dispatch> {
    return this.request<Dispatch>(`/dispatches/${dispatchId}/release`, {
      method: 'POST',
      body: JSON.stringify({ action, transport_mode: transportMode, reason }),
    })
  }

  async updateDispatchStatus(
    dispatchId: number,
    status: 'in_transit' | 'received',
    coolboxMaxTempC?: number
  ): Promise<{ status: string; warning?: string }> {
    return this.request<{ status: string; warning?: string }>(`/dispatches/${dispatchId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, coolbox_max_temp_c: coolboxMaxTempC }),
    })
  }

  async getAudit(requestId: number): Promise<{ request_id: number; events: AuditEvent[] }> {
    return this.request<{ request_id: number; events: AuditEvent[] }>(`/audit?request_id=${requestId}`)
  }
}

export const api = new ApiClient()
