import React, { useState, useEffect } from 'react'
import type { DispatchOption, EmergencyRequest, OptionsResponse } from '../types'
import { api } from '../api/client'
import { facilityName } from '../api/facilities'
import { usePolling, lastDispatchSite, useNow } from '../hooks/usePolling'
import {
  Page, Card, Button, Chip, Notice, Label, Empty, Dialog, Queue, UrgencyChip, COMPONENT_LABEL, group, etaRange,
  timeLeft, inputCls,
} from './ui'

/** The reason text ends with "expires YYYY-MM-DD"; show that date on its own. */
const expiryOf = (reason: string) => reason.match(/expires (\d{4}-\d{2}-\d{2})/)?.[1]

export const OfficerDecisionView: React.FC<{ selectedRequestId?: number }> = ({
  selectedRequestId,
}) => {
  const [requests, setRequests] = useState<EmergencyRequest[]>([])
  const [queueLoaded, setQueueLoaded] = useState(false)
  const [activeReqId, setActiveReqId] = useState<number | null>(selectedRequestId || null)
  const [optionsData, setOptionsData] = useState<OptionsResponse | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Escalation timer: time left until the request's due_at (from the backend's 5-minute rule).
  const now = useNow()
  const activeRow = requests.find((r) => r.id === activeReqId)
  const left = timeLeft(activeRow?.due_at, now)

  // Dialogs for Change and Reject with mandatory reason input
  const [modalMode, setModalMode] = useState<'change' | 'reject' | null>(null)
  const [decisionReason, setDecisionReason] = useState<string>('')

  // Work queue: requests waiting for this officer. Polled so new requests and supplier declines appear.
  const loadRequests = async () => {
    try {
      const list = await api.getRequests({ status: ['AwaitingDecision', 'Escalated'] })
      setRequests(list)
      setActiveReqId((current) =>
        current && list.some((r) => r.id === current) ? current : list[0]?.id ?? null
      )
    } catch (err: unknown) {
      setError(`Could not load the queue: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setQueueLoaded(true)
    }
  }
  usePolling(loadRequests, 10000)

  // Load options for the active request
  useEffect(() => {
    if (activeReqId) {
      loadOptions(activeReqId)
    } else {
      setOptionsData(null)
    }
  }, [activeReqId])

  const loadOptions = async (reqId: number) => {
    setIsLoading(true)
    setError(null)
    setOptionsData(null)
    try {
      const res = await api.getRequestOptions(reqId)
      setOptionsData(res)
      setSelectedOptionId(res.held_option_id || res.options[0]?.id || null)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(`Could not load options for request #${reqId}: ${errMsg}`)
    } finally {
      setIsLoading(false)
    }
  }

  const outcome = (res: EmergencyRequest) => {
    lastDispatchSite.set(res.dispatch?.from_facility_id)
    if (res.status === 'SentToSupplier') {
      return `Request #${res.id} sent to ${facilityName(res.dispatch?.from_facility_id)} under standing authorisation. MoH notified.`
    }
    if (res.status === 'AwaitingAuthorisation') return `Request #${res.id} is waiting for MoH approval.`
    if (res.status === 'HandledManually') return `Request #${res.id} rejected. Units released; handle it by phone.`
    return `Request #${res.id}: ${res.status}`
  }

  const finishAction = async (msg: string) => {
    setSuccessMsg(msg)
    setActiveReqId(null) // the decided request leaves the queue; loadRequests picks the next one
    await loadRequests()
  }

  const handleAccept = async () => {
    if (!activeReqId) return
    setIsSubmitting(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await api.submitDecision(activeReqId, 'accept')
      await finishAction(outcome(res))
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(`Not accepted: ${errMsg}`)
      loadOptions(activeReqId)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmModalAction = async () => {
    if (!activeReqId || decisionReason.trim().length < 3) {
      setError('A reason (at least 3 characters) is required to Change or Reject.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    setSuccessMsg(null)

    try {
      let res: EmergencyRequest
      if (modalMode === 'change') {
        if (!selectedOptionId) throw new Error('Choose another site first.')
        res = await api.submitDecision(activeReqId, 'change', selectedOptionId, decisionReason)
      } else {
        res = await api.submitDecision(activeReqId, 'reject', undefined, decisionReason)
      }
      setModalMode(null)
      setDecisionReason('')
      await finishAction(outcome(res))
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(`Action failed: ${errMsg}`)
      setModalMode(null)
      loadOptions(activeReqId)
    } finally {
      setIsSubmitting(false)
    }
  }

  const options = optionsData?.options || []
  const held = options.find((o) => o.id === optionsData?.held_option_id) || null
  const others = options.filter((o) => o.id !== held?.id)
  const req = optionsData?.request

  const openChange = (optId?: number) => {
    setSelectedOptionId(optId ?? others[0]?.id ?? null)
    setDecisionReason('')
    setModalMode('change')
  }

  return (
    <Page title="Choose a supplying site" wide>
      {successMsg && <Notice tone="ok" onClose={() => setSuccessMsg(null)}>{successMsg}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4 items-start">
        <Queue
          title="Waiting for you"
          items={requests}
          selectedId={activeReqId}
          onSelect={(id) => {
            setActiveReqId(id)
            setSuccessMsg(null)
          }}
          loaded={queueLoaded}
          empty="No requests waiting."
          row={(r) => ({
            main: `#${r.id} · ${group(r.patient_blood_group)} · ${r.units_requested} × ${COMPONENT_LABEL[r.component] || r.component}`,
            chips: r.urgency === 'life_threatening' ? <UrgencyChip urgency={r.urgency} /> : r.status === 'Escalated' ? <Chip tone="amber">Escalated</Chip> : null,
          })}
        />

        <div className="space-y-3">
          {!activeReqId ? (
            queueLoaded && <Empty>Nothing to decide.</Empty>
          ) : isLoading || !req ? (
            !error && <Empty>Loading…</Empty>
          ) : (
            <>
              {/* What is needed, and how long is left */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-3xl font-semibold">{group(req.patient_blood_group)}</span>
                <span className="text-base">
                  {req.units_requested} × {COMPONENT_LABEL[req.component] || req.component}
                </span>
                <span className="text-sm text-slate-500">for {facilityName(req.requesting_facility_id)}</span>
                <UrgencyChip urgency={req.urgency} />
                {left && <Chip tone={left.tone}>{left.text}</Chip>}
              </div>
              {req.warnings && req.warnings.length > 0 && <Notice tone="warn">{req.warnings.join(' ')}</Notice>}
              {optionsData?.ai_offline && (
                <Notice tone="warn">AI offline: arrival times are from the route table.</Notice>
              )}

              {held ? (
                <Card className="space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-semibold">{held.facility_name}</div>
                      <div className="text-xs text-slate-500">Rank {held.rank}</div>
                    </div>
                    <Chip>Held</Chip>
                    {held.is_partial && <Chip tone="amber">Partial</Chip>}
                  </div>
                  <div className="flex flex-wrap gap-x-8 gap-y-2">
                    <div>
                      <div className="text-xs text-slate-500">Arrives in</div>
                      <div className="text-3xl font-semibold tabular-nums">{etaRange(held.eta.low_min, held.eta.high_min)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Units</div>
                      <div className="text-3xl font-semibold tabular-nums">
                        {held.unit_ids.length}
                        <span className="text-sm font-normal text-slate-500"> of {held.units_available} · {[...new Set(held.blood_groups)].map(group).join(', ')}</span>
                      </div>
                    </div>
                    {expiryOf(held.reason) && (
                      <div>
                        <div className="text-xs text-slate-500">Expires</div>
                        <div className="text-base font-medium pt-2">{expiryOf(held.reason)}</div>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 truncate" title={held.reason}>{held.reason}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button kind="primary" big disabled={isSubmitting} onClick={handleAccept} className="flex-1 sm:flex-none sm:min-w-40">
                      {isSubmitting ? 'Saving…' : 'Accept'}
                    </Button>
                    <Button big disabled={others.length === 0} onClick={() => openChange()}>Change</Button>
                    <Button
                      big
                      onClick={() => {
                        setModalMode('reject')
                        setDecisionReason('')
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </Card>
              ) : (
                <Empty>No compatible stock at any site. Handle this request by phone.</Empty>
              )}

              {others.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Other sites</div>
                  <ul className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {others.map((o: DispatchOption) => (
                      <li key={o.id} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="flex-1 min-w-40 truncate">{o.facility_name}</span>
                        <span className="tabular-nums">{etaRange(o.eta.low_min, o.eta.high_min)}</span>
                        <span className="text-slate-500">{o.units_available} units</span>
                        {o.is_partial && <Chip tone="amber">Partial</Chip>}
                        <Button kind="quiet" onClick={() => openChange(o.id)}>Use this</Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {modalMode && (
        <Dialog title={modalMode === 'change' ? 'Change site' : `Reject request #${activeReqId}`}>
          {modalMode === 'change' ? (
            <div className="space-y-1">
              {others.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm py-1">
                  <input
                    type="radio"
                    name="change_option"
                    checked={selectedOptionId === o.id}
                    onChange={() => setSelectedOptionId(o.id)}
                  />
                  <span className="flex-1">{o.facility_name}</span>
                  <span className="tabular-nums text-slate-500">{etaRange(o.eta.low_min, o.eta.high_min)}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Held units are released. The request is handled by phone.</p>
          )}
          <div>
            <Label htmlFor="decision_reason">Reason</Label>
            <textarea
              id="decision_reason"
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button onClick={() => setModalMode(null)}>Cancel</Button>
            <Button
              kind="primary"
              disabled={isSubmitting || decisionReason.trim().length < 3 || (modalMode === 'change' && !selectedOptionId)}
              onClick={handleConfirmModalAction}
            >
              {isSubmitting ? 'Saving…' : modalMode === 'change' ? 'Change and accept' : 'Reject'}
            </Button>
          </div>
        </Dialog>
      )}
    </Page>
  )
}
