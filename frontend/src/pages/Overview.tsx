import React from 'react'
import type { Dispatch, EmergencyRequest, RequestStatus } from '../types'
import { facilityName } from '../api/facilities'
import { useAuth } from '../context/AuthContext'
import { useDispatches, useRequests } from '../hooks/useData'
import { useNow } from '../hooks/usePolling'
import { navigate } from '../lib/router'
import { BarList, ColumnChart, perDay, type Datum } from '../components/charts'
import {
  Page, Section, StatCard, Button, Notice, Chip, StatusChip, UrgencyChip, DispatchChip, COMPONENT_LABEL, group,
  statusLabel, dispatchStatusLabel, timeLeft, when, DataTable, FilterSelect,
} from '../components/ui'

const WEEK = 7 * 86400000
const recent = (iso?: string | null) => !!iso && Date.now() - new Date(iso).getTime() < WEEK
const count = (rows: EmergencyRequest[], statuses: RequestStatus[]) => rows.filter((r) => statuses.includes(r.status)).length

/** Median minutes from raised to received, over received requests in the list. */
function medianTurnaround(rows: EmergencyRequest[]): number | null {
  const mins = rows
    .filter((r) => r.status === 'Received' && r.status_changed_at)
    .map((r) => (new Date(r.status_changed_at!).getTime() - new Date(r.created_at).getTime()) / 60000)
    .sort((a, b) => a - b)
  if (!mins.length) return null
  const m = Math.floor(mins.length / 2)
  return Math.round(mins.length % 2 ? mins[m] : (mins[m - 1] + mins[m]) / 2)
}
const fmtMin = (m: number | null) => (m == null ? '—' : m < 120 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`)

const PIPELINE: RequestStatus[] = [
  'AwaitingDecision', 'Escalated', 'AwaitingAuthorisation', 'SentToSupplier', 'Dispatched', 'InTransit', 'Received', 'HandledManually',
]
const byStage = (rows: EmergencyRequest[]): Datum[] =>
  PIPELINE.map((s) => ({ label: statusLabel(s), value: count(rows, [s]), title: s }))

const goStatus = (d: Datum) => navigate(`/app/requests?status=${d.title}`)

const LoadState: React.FC<{ loaded: boolean; error: string | null; n: number }> = ({ loaded, error, n }) =>
  error ? <Notice tone="error">{error}</Notice> : loaded ? (
    <p className="text-xs text-slate-500">Based on the {n} most recent requests you can see.</p>
  ) : null

/** Requests waiting for this person, oldest deadline first. */
const AttentionList: React.FC<{ rows: EmergencyRequest[]; to: string; empty: string }> = ({ rows, to, empty }) => {
  const now = useNow()
  if (rows.length === 0) return <p className="text-sm text-slate-500">{empty}</p>
  return (
    <ul className="divide-y divide-slate-100">
      {rows.slice(0, 5).map((r) => {
        const left = timeLeft(r.due_at, now)
        return (
          <li key={r.id}>
            <button type="button" onClick={() => navigate(to)} className="w-full text-left py-2 flex flex-wrap items-center gap-2 text-sm hover:bg-slate-50">
              <span className="tabular-nums text-slate-500">#{r.id}</span>
              <span className="font-semibold">{group(r.patient_blood_group)}</span>
              <span>{r.units_requested} × {COMPONENT_LABEL[r.component] || r.component}</span>
              <span className="text-slate-500 truncate">{facilityName(r.requesting_facility_id)}</span>
              <span className="ml-auto flex gap-1">
                {r.urgency === 'life_threatening' && <UrgencyChip urgency={r.urgency} />}
                {left && <Chip tone={left.tone}>{left.text}</Chip>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

const RequestCharts: React.FC<{ rows: EmergencyRequest[] }> = ({ rows }) => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <Section title="Requests per day (last 14 days)" className="lg:col-span-2">
      <ColumnChart data={perDay(rows, (r) => r.created_at)} ariaLabel="Requests raised per day, last 14 days" />
    </Section>
    <Section title="Requests by stage">
      <BarList data={byStage(rows)} ariaLabel="Requests by stage" onSelect={goStatus} />
    </Section>
  </div>
)

export const OfficerOverview: React.FC = () => {
  const { data: rows, loaded, error } = useRequests()
  const waiting = rows.filter((r) => r.status === 'AwaitingDecision' || r.status === 'Escalated')
  return (
    <Page title="Overview" subtitle="Blood bank" wide aside={<Button kind="primary" onClick={() => navigate('/app/decisions')}>Open decisions</Button>}>
      <LoadState loaded={loaded} error={error} n={rows.length} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Waiting for you" value={waiting.length} tone={waiting.length ? 'amber' : undefined} onClick={() => navigate('/app/decisions')} hint={`${count(rows, ['Escalated'])} escalated`} />
        <StatCard label="Awaiting MoH" value={count(rows, ['AwaitingAuthorisation'])} onClick={() => navigate('/app/requests?status=AwaitingAuthorisation')} />
        <StatCard label="On the way" value={count(rows, ['SentToSupplier', 'Dispatched', 'InTransit'])} hint="At supplier, released or in transit" />
        <StatCard label="Median raise → receive" value={fmtMin(medianTurnaround(rows))} hint={`${rows.filter((r) => r.status === 'Received' && recent(r.status_changed_at)).length} received this week`} />
      </div>
      <Section title="Needs your decision">
        <AttentionList rows={waiting} to="/app/decisions" empty="Nothing waiting." />
      </Section>
      <RequestCharts rows={rows} />
    </Page>
  )
}

export const MohOverview: React.FC = () => {
  const { data: rows, loaded, error } = useRequests()
  const toApprove = rows.filter((r) => r.status === 'AwaitingAuthorisation')
  const open = rows.filter((r) => !['Received', 'HandledManually'].includes(r.status))
  const standingOpen = open.filter((r) => r.authorisation_route === 'standing').length
  const canStop = rows.filter((r) => r.authorisation_route === 'standing' && r.status === 'SentToSupplier' && r.dispatch_status === 'AwaitingRelease').length
  const routes: Datum[] = [
    { label: 'Standing authorisation', value: rows.filter((r) => r.authorisation_route === 'standing').length },
    { label: 'MoH approval per transfer', value: rows.filter((r) => r.authorisation_route === 'per_transfer').length },
    { label: 'Not decided yet', value: rows.filter((r) => !r.authorisation_route).length },
  ]
  return (
    <Page title="Overview" subtitle="Ministry of Health" wide aside={<Button kind="primary" onClick={() => navigate('/app/approvals')}>Open approvals</Button>}>
      <LoadState loaded={loaded} error={error} n={rows.length} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="To approve" value={toApprove.length} tone={toApprove.length ? 'amber' : undefined} onClick={() => navigate('/app/approvals')} />
        <StatCard label="Standing, open" value={standingOpen} hint={`${canStop} can still be stopped`} />
        <StatCard label="Handled by phone" value={count(rows, ['HandledManually'])} hint="Rejected, stopped or no stock" onClick={() => navigate('/app/requests?status=HandledManually')} />
        <StatCard label="Median raise → receive" value={fmtMin(medianTurnaround(rows))} />
      </div>
      <Section title="Waiting for approval">
        <AttentionList rows={toApprove} to="/app/approvals" empty="Nothing waiting." />
      </Section>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section title="Requests per day (last 14 days)" className="lg:col-span-2">
          <ColumnChart data={perDay(rows, (r) => r.created_at)} ariaLabel="Requests raised per day, last 14 days" />
        </Section>
        <Section title="Authorisation route">
          <BarList data={routes} ariaLabel="Requests by authorisation route" />
        </Section>
      </div>
    </Page>
  )
}

export const ClinicianOverview: React.FC = () => {
  const { user } = useAuth()
  const { data: rows, loaded, error } = useRequests()
  const inTransit = count(rows, ['InTransit'])
  const open = rows.filter((r) => !['Received', 'HandledManually'].includes(r.status))
  return (
    <Page title="Overview" subtitle={user?.facility_name} wide aside={<Button kind="primary" onClick={() => navigate('/app/new')}>Request blood</Button>}>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Open requests" value={open.length} onClick={() => navigate('/app/requests')} />
        <StatCard label="Arriving now" value={inTransit} tone={inTransit ? 'amber' : undefined} hint="Confirm on arrival" onClick={() => navigate('/app/arrivals')} />
        <StatCard label="Received this week" value={rows.filter((r) => r.status === 'Received' && recent(r.status_changed_at)).length} />
        <StatCard label="Median raise → receive" value={fmtMin(medianTurnaround(rows))} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Open requests" aside={<Button kind="quiet" onClick={() => navigate('/app/requests')}>All requests</Button>}>
          {!loaded ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : open.length === 0 ? (
            <p className="text-sm text-slate-500">No open requests.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {open.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => navigate(`/app/requests/${r.id}`)} className="w-full text-left py-2 flex items-center gap-2 text-sm hover:bg-slate-50">
                    <span className="tabular-nums text-slate-500">#{r.id}</span>
                    <span className="font-semibold">{group(r.patient_blood_group)}</span>
                    <span className="flex-1">{r.units_requested} × {COMPONENT_LABEL[r.component] || r.component}</span>
                    <StatusChip status={r.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Requests per day (last 14 days)">
          <ColumnChart data={perDay(rows, (r) => r.created_at)} ariaLabel="Requests raised per day, last 14 days" />
        </Section>
      </div>
    </Page>
  )
}

export const LabOverview: React.FC = () => {
  const { user } = useAuth()
  const { data: rows, loaded, error } = useDispatches()
  const c = (s: Dispatch['status']) => rows.filter((d) => d.status === s).length
  const awaiting = c('AwaitingRelease')
  const dest = new Map<string, number>()
  rows.forEach((d) => dest.set(d.to_facility_id, (dest.get(d.to_facility_id) || 0) + 1))
  const topDest: Datum[] = [...dest.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => ({ label: facilityName(id), value: n }))
  const statuses: Dispatch['status'][] = ['AwaitingRelease', 'Released', 'InTransit', 'Received', 'Declined', 'Cancelled']
  return (
    <Page title="Overview" subtitle={user?.facility_name} wide aside={<Button kind="primary" onClick={() => navigate('/app/orders')}>Open orders</Button>}>
      {error && <Notice tone="error">{error}</Notice>}
      {loaded && <p className="text-xs text-slate-500">Orders from your site ({rows.length} most recent).</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Awaiting release" value={awaiting} tone={awaiting ? 'amber' : undefined} onClick={() => navigate('/app/orders')} />
        <StatCard label="Released, not collected" value={c('Released')} hint="Mark in transit at hand-over" onClick={() => navigate('/app/orders')} />
        <StatCard label="In transit" value={c('InTransit')} />
        <StatCard label="Declined" value={c('Declined')} hint={`${c('Received')} received`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section title="Orders per day (last 14 days)" className="lg:col-span-2">
          <ColumnChart data={perDay(rows, (d) => d.created_at)} ariaLabel="Orders per day, last 14 days" />
        </Section>
        <Section title="By status">
          <BarList data={statuses.map((s) => ({ label: dispatchStatusLabel(s), value: c(s) }))} ariaLabel="Orders by status" />
        </Section>
      </div>
      {topDest.length > 0 && (
        <Section title="Top destinations">
          <BarList data={topDest} ariaLabel="Orders by destination" />
        </Section>
      )}
    </Page>
  )
}

/** Lab: past orders as a table. */
export const LabHistory: React.FC = () => {
  const { data: rows, loaded, error } = useDispatches()
  const [status, setStatus] = React.useState('all')
  const shown = rows.filter((d) => status === 'all' || d.status === status)
  return (
    <Page title="Order history" wide subtitle={loaded ? `${shown.length} of ${rows.length}` : undefined}>
      {error && <Notice tone="error">{error}</Notice>}
      <FilterSelect
        label="Status"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'all', label: 'All statuses' },
          ...(['AwaitingRelease', 'Released', 'InTransit', 'Received', 'Declined', 'Cancelled'] as Dispatch['status'][]).map((s) => ({
            value: s,
            label: dispatchStatusLabel(s),
          })),
        ]}
      />
      <DataTable
        key={status}
        loaded={loaded}
        rows={shown}
        empty="No orders."
        columns={[
          { key: 'id', header: '#', cell: (d: Dispatch) => <span className="tabular-nums text-slate-500">{d.id}</span> },
          { key: 'created', header: 'Created', cell: (d: Dispatch) => <span className="tabular-nums whitespace-nowrap">{when(d.created_at)}</span> },
          { key: 'to', header: 'To', cell: (d: Dispatch) => d.to_facility_name || facilityName(d.to_facility_id) },
          { key: 'need', header: 'Units', cell: (d: Dispatch) => `${d.units_requested} × ${COMPONENT_LABEL[d.component] || d.component}` },
          { key: 'urgency', header: 'Urgency', cell: (d: Dispatch) => <UrgencyChip urgency={d.urgency} /> },
          { key: 'status', header: 'Status', cell: (d: Dispatch) => <DispatchChip status={d.status} /> },
          { key: 'transport', header: 'Transport', cell: (d: Dispatch) => (d.transport_mode ? d.transport_mode.replace(/_/g, ' ') : '—') },
          { key: 'received', header: 'Received', cell: (d: Dispatch) => <span className="tabular-nums whitespace-nowrap">{when(d.received_at)}</span> },
        ]}
      />
    </Page>
  )
}
