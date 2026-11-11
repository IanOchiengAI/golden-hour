import React, { useMemo, useState } from 'react'
import type { EmergencyRequest, RequestStatus, Urgency } from '../types'
import { facilityName } from '../api/facilities'
import { useAuth } from '../context/AuthContext'
import { useRequests } from '../hooks/useData'
import { navigate } from '../lib/router'
import {
  Page, DataTable, FilterSelect, StatusChip, UrgencyChip, Notice, COMPONENT_LABEL, group, etaRange, when,
  statusLabel, ALL_STATUSES, inputCls, type Column,
} from '../components/ui'

const CLOSED: RequestStatus[] = ['Received', 'HandledManually']

/** All requests this user can see, with filters and pagination. Row → detail page. */
export const RequestsPage: React.FC<{ title?: string; initialStatus?: string }> = ({ title = 'Requests', initialStatus }) => {
  const { user } = useAuth()
  const { data, loaded, error } = useRequests()
  const [status, setStatus] = useState(initialStatus || 'open')
  const [urgency, setUrgency] = useState('all')
  const [q, setQ] = useState('')
  const isClinician = user?.role === 'clinician'

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return data.filter((r) => {
      if (status === 'open' && CLOSED.includes(r.status)) return false
      if (status !== 'open' && status !== 'all' && r.status !== status) return false
      if (urgency !== 'all' && r.urgency !== urgency) return false
      if (!term) return true
      const hay = `${r.id} ${r.patient_blood_group} ${facilityName(r.requesting_facility_id)} ${r.held_option?.facility_name || ''}`
      return hay.toLowerCase().includes(term)
    })
  }, [data, status, urgency, q])

  const columns: Column<EmergencyRequest>[] = [
    { key: 'id', header: '#', cell: (r) => <span className="tabular-nums text-slate-500">{r.id}</span> },
    { key: 'created', header: 'Raised', cell: (r) => <span className="whitespace-nowrap tabular-nums">{when(r.created_at)}</span> },
    ...(isClinician
      ? []
      : [{ key: 'hospital', header: 'Hospital', cell: (r: EmergencyRequest) => facilityName(r.requesting_facility_id) }]),
    { key: 'group', header: 'Group', cell: (r) => <span className="font-semibold">{group(r.patient_blood_group)}</span> },
    {
      key: 'need',
      header: 'Need',
      cell: (r) => (
        <span className="whitespace-nowrap">
          {r.units_requested} × {COMPONENT_LABEL[r.component] || r.component}
        </span>
      ),
    },
    { key: 'urgency', header: 'Urgency', cell: (r) => <UrgencyChip urgency={r.urgency} /> },
    { key: 'status', header: 'Status', cell: (r) => <StatusChip status={r.status} /> },
    {
      key: 'site',
      header: 'Supplying site',
      cell: (r) =>
        r.held_option ? (
          <span>
            {r.held_option.facility_name}
            <span className="block text-xs text-slate-500 tabular-nums">
              {etaRange(r.held_option.eta.low_min, r.held_option.eta.high_min)}
            </span>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
  ]

  return (
    <Page title={title} subtitle={loaded ? `${rows.length} of ${data.length} most recent` : undefined} wide>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="Search #, group, site"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inputCls} !w-56 !h-9`}
          aria-label="Search"
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'all', label: 'All statuses' },
            ...ALL_STATUSES.filter((s) => s !== 'DraftFromCall').map((s) => ({ value: s, label: statusLabel(s) })),
          ]}
        />
        <FilterSelect
          label="Urgency"
          value={urgency}
          onChange={setUrgency}
          options={[
            { value: 'all', label: 'All urgencies' },
            { value: 'life_threatening' as Urgency, label: 'Life-threatening' },
            { value: 'urgent', label: 'Urgent' },
            { value: 'routine', label: 'Routine' },
          ]}
        />
      </div>
      <DataTable
        key={`${status}-${urgency}-${q}`}
        columns={columns}
        rows={rows}
        loaded={loaded}
        empty="No requests match these filters."
        onRowClick={(r) => navigate(`/app/requests/${r.id}`)}
      />
    </Page>
  )
}
