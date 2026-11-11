import React, { useState } from 'react'
import { api } from '../api/client'
import { facilityName } from '../api/facilities'
import { usePolling, lastDispatchSite, useNow } from '../hooks/usePolling'
import type { EmergencyRequest } from '../types'
import {
  Page, Card, Button, Chip, Notice, Label, Empty, Queue, StatusChip, UrgencyChip, COMPONENT_LABEL, group, etaRange,
  timeLeft, inputCls,
} from './ui'

type MohAction = 'approve' | 'reject' | 'stop' | 'review'

// Requests the MoH officer acts on: per-transfer requests waiting for approval, and
// standing-authorisation requests (stop before release, review afterwards).
const MOH_STATUSES = ['AwaitingAuthorisation', 'SentToSupplier', 'Dispatched', 'InTransit', 'Received'] as const

export const routeLabel = (route?: string) =>
  route === 'standing' ? 'Standing authorisation' : route === 'per_transfer' ? 'MoH approval per transfer' : 'Not set yet'

export function allowedActions(r: EmergencyRequest): MohAction[] {
  if (r.status === 'AwaitingAuthorisation') return ['approve', 'reject']
  if (r.authorisation_route !== 'standing') return []
  const canStop = r.status === 'SentToSupplier' && r.dispatch_status === 'AwaitingRelease'
  return canStop ? ['review', 'stop'] : ['review']
}

const ACTION_LABEL: Record<MohAction, string> = { approve: 'Approve', reject: 'Reject', stop: 'Stop', review: 'Mark reviewed' }

export const MohAuthoriseView: React.FC = () => {
  const [rows, setRows] = useState<EmergencyRequest[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [reason, setReason] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const now = useNow()

  const load = async () => {
    try {
      const list = await api.getRequests({ status: [...MOH_STATUSES], limit: 50 })
      const relevant = list.filter((r) => allowedActions(r).length > 0)
      // Waiting for approval first, then standing-route requests.
      relevant.sort((a, b) => Number(b.status === 'AwaitingAuthorisation') - Number(a.status === 'AwaitingAuthorisation'))
      setRows(relevant)
      setSelectedId((cur) => (cur && relevant.some((r) => r.id === cur) ? cur : relevant[0]?.id ?? null))
    } catch (err: unknown) {
      setMsg({ type: 'error', text: `Could not load the queue: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setLoaded(true)
    }
  }
  usePolling(load, 10000)

  const selected = rows.find((r) => r.id === selectedId) || null

  const handleAction = async (action: MohAction) => {
    if (!selected) return
    if ((action === 'reject' || action === 'stop') && reason.trim().length < 3) {
      setMsg({ type: 'error', text: 'A reason (at least 3 characters) is required to reject or stop.' })
      return
    }
    setIsSubmitting(true)
    setMsg(null)
    try {
      const res = await api.submitAuthorisation(selected.id, action, reason)
      lastDispatchSite.set(res.dispatch?.from_facility_id)
      const text = {
        approve: `Request #${res.id} approved and sent to ${facilityName(res.dispatch?.from_facility_id)}.`,
        reject: `Request #${res.id} not approved. Units released.`,
        stop: `Request #${res.id} stopped before release. Units released.`,
        review: `Request #${res.id} reviewed.`,
      }[action]
      setMsg({ type: 'success', text })
      setReason('')
      await load()
    } catch (err: unknown) {
      setMsg({ type: 'error', text: `Not recorded: ${err instanceof Error ? err.message : String(err)}` })
      await load()
    } finally {
      setIsSubmitting(false)
    }
  }

  const actions = selected ? allowedActions(selected) : []
  const left = selected?.status === 'AwaitingAuthorisation' ? timeLeft(selected.due_at, now) : null
  const site = selected?.held_option

  return (
    <Page title="Authorise transfers" wide>
      {msg && (
        <Notice tone={msg.type === 'success' ? 'ok' : 'error'} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4 items-start">
        <Queue
          title="To approve or review"
          items={rows}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loaded={loaded}
          empty="Nothing waiting."
          row={(r) => ({
            main: `#${r.id} · ${group(r.patient_blood_group)} · ${r.units_requested} × ${COMPONENT_LABEL[r.component] || r.component}`,
            chips: r.status === 'AwaitingAuthorisation' ? <Chip tone="amber">Approve</Chip> : <Chip>Standing</Chip>,
          })}
        />

        {!selected ? (
          loaded && <Empty>Nothing to authorise.</Empty>
        ) : (
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-3xl font-semibold">{group(selected.patient_blood_group)}</span>
              <span className="text-base">
                {selected.units_requested} × {COMPONENT_LABEL[selected.component] || selected.component}
              </span>
              <UrgencyChip urgency={selected.urgency} />
              <StatusChip status={selected.status} />
              {left && <Chip tone={left.tone}>{left.text}</Chip>}
            </div>
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
              <dt className="text-slate-500">Route</dt>
              <dd>{routeLabel(selected.authorisation_route)}</dd>
              <dt className="text-slate-500">From</dt>
              <dd>{site ? site.facility_name : '—'}</dd>
              <dt className="text-slate-500">To</dt>
              <dd>{facilityName(selected.requesting_facility_id)}</dd>
              {site && (
                <>
                  <dt className="text-slate-500">Arrives in</dt>
                  <dd className="tabular-nums">{etaRange(site.eta.low_min, site.eta.high_min)}</dd>
                </>
              )}
            </dl>
            <div>
              <Label htmlFor="moh_reason">Reason {actions.includes('reject') || actions.includes('stop') ? '(required to reject or stop)' : '(optional)'}</Label>
              <textarea id="moh_reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={inputCls} />
            </div>
            <div className="flex flex-wrap gap-2">
              {actions.map((a, i) => (
                <Button
                  key={a}
                  kind={i === 0 ? 'primary' : 'secondary'}
                  big
                  disabled={isSubmitting}
                  onClick={() => handleAction(a)}
                  className={i === 0 ? 'flex-1 sm:flex-none sm:min-w-40' : ''}
                >
                  {ACTION_LABEL[a]}
                </Button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </Page>
  )
}
