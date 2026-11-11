import React, { useState } from 'react'
import type { Dispatch } from '../types'
import { api } from '../api/client'
import { SUPPLYING_SITES, facilityName } from '../api/facilities'
import { useAuth } from '../context/AuthContext'
import { usePolling } from '../hooks/usePolling'
import {
  Page, Card, Button, Notice, Label, Empty, Dialog, Queue, DispatchChip, UrgencyChip, COMPONENT_LABEL, group, inputCls,
} from './ui'

type Mode = 'vehicle' | 'motorbike' | 'public_service_vehicle'

export const LabDispatchView: React.FC = () => {
  const { user, signInTestUser } = useAuth()
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const selectedStation = user?.facility_id || 'RBTC-NBO'

  const handleStationSwitch = async (siteId: string) => {
    try {
      await signInTestUser('lab', siteId) // the view reloads under the new login
    } catch (err: unknown) {
      setErrorMsg(`Could not sign in at ${siteId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Dispatches from this site that still need the lab. Polled so a new order appears on its own.
  const loadDispatches = async () => {
    try {
      const list = await api.getDispatches({ status: ['AwaitingRelease', 'Released'] })
      setDispatches(list)
      setSelectedId((cur) => (cur && list.some((d) => d.id === cur) ? cur : list[0]?.id ?? null))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(`Could not load orders: ${msg}`)
    } finally {
      setLoaded(true)
    }
  }
  usePolling(loadDispatches, 10000)

  const [transportMode, setTransportMode] = useState<Mode>('motorbike')
  const [declineReason, setDeclineReason] = useState<string>('')
  const [modalDeclineId, setModalDeclineId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>, ok: string, failPrefix: string) => {
    setIsSubmitting(true)
    setFeedbackMsg(null)
    setErrorMsg(null)
    try {
      await fn()
      setFeedbackMsg(ok)
      return true
    } catch (err: unknown) {
      setErrorMsg(`${failPrefix}: ${err instanceof Error ? err.message : String(err)}`)
      return false
    } finally {
      setIsSubmitting(false)
      loadDispatches()
    }
  }

  const handleConfirmRelease = (dispatchId: number) =>
    run(() => api.releaseDispatch(dispatchId, 'confirm', transportMode), `Dispatch #${dispatchId} released.`, 'Release refused')

  const handleMarkInTransit = (dispatchId: number) =>
    run(() => api.updateDispatchStatus(dispatchId, 'in_transit'), `Dispatch #${dispatchId} is in transit.`, 'Status not updated')

  const handleDecline = async (dispatchId: number) => {
    if (declineReason.trim().length < 3) return
    const ok = await run(
      () => api.releaseDispatch(dispatchId, 'decline', undefined, declineReason),
      `Dispatch #${dispatchId} declined. Units released; the next site is offered to the blood bank officer.`,
      'Decline refused'
    )
    if (ok) {
      setModalDeclineId(null)
      setDeclineReason('')
    }
  }

  const d = dispatches.find((x) => x.id === selectedId) || null

  return (
    <Page
      title="Orders"
      subtitle={user?.facility_name}
      wide
      aside={
        // A real lab officer belongs to one site; test users may switch site for the demo.
        user?.demo && <select
          aria-label="Your site"
          value={selectedStation}
          onChange={(e) => handleStationSwitch(e.target.value)}
          className="h-9 border border-slate-300 rounded-md px-2 text-sm bg-white max-w-full"
        >
          {SUPPLYING_SITES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      }
    >
      {feedbackMsg && <Notice tone="ok" onClose={() => setFeedbackMsg(null)}>{feedbackMsg}</Notice>}
      {errorMsg && <Notice tone="error" onClose={() => setErrorMsg(null)}>{errorMsg}</Notice>}

      <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4 items-start">
        <Queue
          title="Orders"
          items={dispatches}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loaded={loaded}
          empty="No orders for this site."
          row={(x) => ({
            main: `#${x.id} · ${x.units_requested} × ${COMPONENT_LABEL[x.component] || x.component} · ${facilityName(x.to_facility_id)}`,
            chips: <DispatchChip status={x.status} />,
          })}
        />

        {!d ? (
          loaded && <Empty>Nothing to release.</Empty>
        ) : (
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-3xl font-semibold tabular-nums">{d.units_requested} ×</span>
              <span className="text-base">{COMPONENT_LABEL[d.component] || d.component}</span>
              <UrgencyChip urgency={d.urgency} />
              <DispatchChip status={d.status} />
            </div>
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
              <dt className="text-slate-500">To</dt>
              <dd>{d.to_facility_name || facilityName(d.to_facility_id)}</dd>
              <dt className="text-slate-500">Units</dt>
              <dd>
                <ul className="font-mono text-xs space-y-0.5">
                  {d.unit_ids.map((uid, i) => (
                    <li key={uid}>
                      {uid} <span className="font-sans font-semibold">{group(d.blood_groups[i])}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </dl>

            {d.status === 'AwaitingRelease' && (
              <>
                <div>
                  <Label htmlFor="transport">Transport</Label>
                  <select
                    id="transport"
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value as Mode)}
                    className={inputCls}
                  >
                    <option value="motorbike">Motorbike</option>
                    <option value="vehicle">Vehicle</option>
                    <option value="public_service_vehicle">Public service vehicle</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button kind="primary" big disabled={isSubmitting} onClick={() => handleConfirmRelease(d.id)} className="flex-1 sm:flex-none sm:min-w-40">
                    {isSubmitting ? 'Saving…' : 'Release'}
                  </Button>
                  <Button big onClick={() => setModalDeclineId(d.id)}>Decline</Button>
                </div>
              </>
            )}
            {d.status === 'Released' && (
              <Button kind="primary" big disabled={isSubmitting} onClick={() => handleMarkInTransit(d.id)} className="w-full sm:w-auto sm:min-w-40">
                {isSubmitting ? 'Saving…' : 'Mark in transit'}
              </Button>
            )}
          </Card>
        )}
      </div>

      {modalDeclineId && (
        <Dialog title={`Decline order #${modalDeclineId}`}>
          <p className="text-sm text-slate-600">Held units are released and the next site is offered.</p>
          <div>
            <Label htmlFor="decline_reason">Reason</Label>
            <textarea
              id="decline_reason"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button onClick={() => setModalDeclineId(null)}>Cancel</Button>
            <Button
              kind="primary"
              disabled={isSubmitting || declineReason.trim().length < 3}
              onClick={() => handleDecline(modalDeclineId)}
            >
              Decline
            </Button>
          </div>
        </Dialog>
      )}
    </Page>
  )
}
