export type Role = 'clinician' | 'blood_bank_officer' | 'moh_officer' | 'lab_officer'

export interface User {
  username: string
  role: Role
  facility_id?: string
  facility_name?: string
  token: string
  /** signed in with a test account (enables quick role switching) */
  demo?: boolean
}

export type BloodGroup = 'O-' | 'O+' | 'A-' | 'A+' | 'B-' | 'B+' | 'AB-' | 'AB+' | 'unknown'
export type BloodComponent = 'RBC' | 'PLT' | 'FFP'
export type Urgency = 'life_threatening' | 'urgent' | 'routine'

export type RequestStatus =
  | 'Raised'
  | 'Matching'
  | 'UnitsHeld'
  | 'AwaitingDecision'
  | 'Escalated'
  | 'AwaitingAuthorisation'
  | 'SentToSupplier'
  | 'Dispatched'
  | 'InTransit'
  | 'Received'
  | 'HandledManually'
  | 'DraftFromCall'

export interface EmergencyRequest {
  id: number
  requesting_facility_id: string
  requesting_facility_name?: string
  patient_blood_group: BloodGroup
  component: BloodComponent
  units_requested: number
  urgency: Urgency
  clinical_note?: string
  status: RequestStatus
  compatible_groups: string[]
  warnings?: string[]
  eta_method?: 'model' | 'fallback'
  created_at: string
  updated_at?: string
  held_option_id?: number | null
  dispatch_id?: number | null
  dispatch_status?: Dispatch['status'] | null
  dispatch?: Dispatch | null
  authorisation_route?: 'standing' | 'per_transfer' | ''
  status_changed_at?: string
  due_at?: string | null
  held_option?: {
    id: number
    rank: number
    facility_id: string
    facility_name: string
    eta: EtaRange
    is_partial: boolean
  } | null
}

export interface EtaRange {
  low_min: number
  mid_min: number
  high_min: number
}

export interface DispatchOption {
  id: number
  rank: number
  facility_id: string
  facility_name: string
  eta: EtaRange
  method: 'model' | 'fallback'
  reason: string
  warnings?: string[]
  units_available: number
  is_partial: boolean
  unit_ids: string[]
  blood_groups: string[]
  is_held: boolean
}

export interface OptionsResponse {
  request: EmergencyRequest
  method: 'model' | 'fallback'
  ai_offline: boolean
  data_as_of: string
  held_option_id: number | null
  options: DispatchOption[]
}

/** Response of POST /dispatches/{id}/release and /status. */
export interface DispatchActionResponse {
  dispatch: Dispatch
  request_status: RequestStatus
  warnings: string[]
}

export interface Dispatch {
  id: number
  request_id: number
  status: 'AwaitingRelease' | 'Released' | 'Declined' | 'Cancelled' | 'InTransit' | 'Received'
  from_facility_id: string
  to_facility_id: string
  to_facility_name?: string
  component: BloodComponent
  units_requested: number
  unit_ids: string[]
  blood_groups: (string | null)[]
  urgency: Urgency
  transport_mode?: 'vehicle' | 'motorbike' | 'public_service_vehicle' | ''
  released_at?: string | null
  in_transit_at?: string | null
  received_at?: string | null
  coolbox_max_temp_c?: number | null
  created_at: string
}

export interface AuditEvent {
  id?: number
  time: string
  actor: string
  role: Role | ''
  action: string
  object: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  reason?: string
}
