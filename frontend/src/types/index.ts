export type Role = 'clinician' | 'blood_bank_officer' | 'moh_officer' | 'lab_officer'

export interface User {
  username: string
  role: Role
  facility_id?: string
  facility_name?: string
  token: string
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
  held_option_id?: number
  dispatch_id?: number
  authorisation_route?: 'standing' | 'per_transfer'
  decision_due_at?: string
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
  held_option_id: number
  options: DispatchOption[]
}

export interface Dispatch {
  id: number
  request_id: number
  status: 'AwaitingRelease' | 'Released' | 'Declined' | 'Cancelled' | 'InTransit' | 'Received'
  from_facility_id: string
  from_facility_name?: string
  to_facility_id: string
  to_facility_name?: string
  component: BloodComponent
  units_requested: number
  unit_ids: string[]
  blood_groups: string[]
  urgency: Urgency
  transport_mode?: 'vehicle' | 'motorbike' | 'public_service_vehicle'
  released_by?: string
  released_at?: string
  decline_reason?: string
  in_transit_at?: string
  received_at?: string
  received_by?: string
  coolbox_max_temp_c?: number
  created_at: string
}

export interface AuditEvent {
  id?: number
  time: string
  actor: string
  role: Role
  action: string
  object: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  reason?: string
}
