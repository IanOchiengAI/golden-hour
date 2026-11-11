import React from 'react'
import type { AuditEvent, DispatchOption, EmergencyRequest } from '../types'
import { api } from '../api/client'
import { facilityName } from '../api/facilities'
import { useAuth } from '../context/AuthContext'
import { usePolled } from '../hooks/useData'
import { Link, navigate } from '../lib/router'
import {
  Page, Section, Button, Chip, Notice, Empty, StatusChip, UrgencyChip, DispatchChip, COMPONENT_LABEL, group,
  etaRange, when,
} from '../components/ui'
import { routeLabel } from '../components/MohAuthoriseView'

type Detail = EmergencyRequest & { options?: DispatchOption[] }

export const RequestDetailPage: React.FC<{ id: number }> = ({ id }) => {
  const { user } = useAuth()
  const canAudit = user?.role === 'blood_bank_officer' || user?.role === 'moh_officer'
  const req = usePolled<Detail | null>(() => api.getRequest(id), null, 10000, [id])
  const audit = usePolled<AuditEvent[]>(
    () => (canAudit ? api.getAudit(id).then((a) => a.events) : Promise.resolve([])),
    [],
    10000,
    [id, canAudit]
  )
  const r = req.data

  // The one thing this role can do next with the request, if any.
  const next =
    r && user?.role === 'blood_bank_officer' && ['AwaitingDecision', 'Escalated'].includes(r.status)
      ? { label: 'Decide', to: '/app/decisions' }
      : r && user?.role === 'moh_officer' && r.status === 'AwaitingAuthorisation'
      ? { label: 'Approve or reject', to: '/app/approvals' }
      : r && user?.role === 'clinician' && r.status === 'InTransit'
      ? { label: 'Confirm arrival', to: '/app/arrivals' }
      : null

  return (
    <Page
      title={`Request #${id}`}
      wide
      aside={
        <div className="flex gap-2">
          <Button onClick={() => history.back()}>Back</Button>
          {next && <Button kind="primary" onClick={() => navigate(next.to)}>{next.label}</Button>}
        </div>
      }
    >
      {req.error && <Notice tone="error">{req.error}</Notice>}
      {!r ? (
        !req.error && <Empty>Loading…</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-3xl font-semibold">{group(r.patient_blood_group)}</span>
            <span className="text-base">{r.units_requested} × {COMPONENT_LABEL[r.component] || r.component}</span>
            <UrgencyChip urgency={r.urgency} />
            <StatusChip status={r.status} />
          </div>
          {r.warnings && r.warnings.length > 0 && <Notice tone="warn">{r.warnings.join(' ')}</Notice>}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Section title="Details">
              <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
                <dt className="text-slate-500">Hospital</dt>
                <dd>{facilityName(r.requesting_facility_id)}</dd>
                <dt className="text-slate-500">Raised</dt>
                <dd className="tabular-nums">{when(r.created_at)}</dd>
                <dt className="text-slate-500">Last change</dt>
                <dd className="tabular-nums">{when(r.status_changed_at || r.updated_at)}</dd>
                <dt className="text-slate-500">Route</dt>
                <dd>{routeLabel(r.authorisation_route)}</dd>
                <dt className="text-slate-500">ETA source</dt>
                <dd>{r.eta_method === 'fallback' ? 'Route table (AI offline)' : r.eta_method === 'model' ? 'ETA model' : '—'}</dd>
                {r.clinical_note && user?.role !== 'lab_officer' && (
                  <>
                    <dt className="text-slate-500">Note</dt>
                    <dd>{r.clinical_note}</dd>
                  </>
                )}
              </dl>
            </Section>

            <Section title="Dispatch">
              {r.dispatch ? (
                <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
                  <dt className="text-slate-500">Status</dt>
                  <dd><DispatchChip status={r.dispatch.status} /></dd>
                  <dt className="text-slate-500">From</dt>
                  <dd>{facilityName(r.dispatch.from_facility_id)}</dd>
                  <dt className="text-slate-500">Transport</dt>
                  <dd>{r.dispatch.transport_mode ? r.dispatch.transport_mode.replace(/_/g, ' ') : '—'}</dd>
                  <dt className="text-slate-500">Released</dt>
                  <dd className="tabular-nums">{when(r.dispatch.released_at)}</dd>
                  <dt className="text-slate-500">In transit</dt>
                  <dd className="tabular-nums">{when(r.dispatch.in_transit_at)}</dd>
                  <dt className="text-slate-500">Received</dt>
                  <dd className="tabular-nums">{when(r.dispatch.received_at)}</dd>
                  {r.dispatch.coolbox_max_temp_c != null && (
                    <>
                      <dt className="text-slate-500">Cool box max</dt>
                      <dd className="tabular-nums">{r.dispatch.coolbox_max_temp_c} °C</dd>
                    </>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-slate-500">Not sent to a supplier yet.</p>
              )}
            </Section>

            <Section title="Ranked sites">
              {r.options && r.options.length > 0 ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {r.options.map((o) => (
                    <li key={o.id} className="py-1.5 flex items-center gap-2">
                      <span className="text-slate-500 tabular-nums w-4">{o.rank}</span>
                      <span className="flex-1 truncate" title={o.reason}>{o.facility_name}</span>
                      <span className="tabular-nums text-slate-600">{etaRange(o.eta.low_min, o.eta.high_min)}</span>
                      {o.is_held && <Chip>Held</Chip>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No compatible stock was found.</p>
              )}
            </Section>
          </div>

          {canAudit && (
            <Section title="Timeline" aside={<Link to={`/app/audit?request=${id}`} className="text-sm text-blue-700 hover:underline">Full audit</Link>}>
              {audit.data.length === 0 ? (
                <p className="text-sm text-slate-500">{audit.loaded ? 'No events.' : 'Loading…'}</p>
              ) : (
                <ol className="relative border-l border-slate-200 ml-1.5 space-y-2">
                  {audit.data
                    .filter((e) => e.action !== 'status_changed')
                    .map((e, i) => (
                      <li key={e.id ?? i} className="pl-4 text-sm">
                        <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-slate-300" aria-hidden />
                        <span className="tabular-nums text-slate-500 mr-2">
                          {new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="font-medium">{e.action.replace(/_/g, ' ')}</span>
                        <span className="text-slate-500"> · {e.actor}</span>
                        {e.reason && <span className="block text-slate-600 pl-12">{e.reason}</span>}
                      </li>
                    ))}
                </ol>
              )}
            </Section>
          )}
        </>
      )}
    </Page>
  )
}
