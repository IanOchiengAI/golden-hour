import React, { useState } from 'react'
import type { BloodGroup, BloodComponent, Urgency, EmergencyRequest } from '../types'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import {
  Page, Card, Button, Choice, Notice, Label, Empty, Dialog, StatusChip, UrgencyChip, COMPONENT_LABEL, group,
  inputCls,
} from './ui'

const MAX_UNITS = 10 // max_units_per_request in config/kenya.yaml

/** section "form": raise a request. section "arrivals": confirm blood that is in transit to this hospital. */
export const ClinicianView: React.FC<{ onRequestCreated?: (req: EmergencyRequest) => void; section?: 'form' | 'arrivals' }> = ({
  onRequestCreated,
  section = 'form',
}) => {
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+')
  const [component, setComponent] = useState<BloodComponent>('RBC')
  const [units, setUnits] = useState<number>(2)
  const [urgency, setUrgency] = useState<Urgency>('life_threatening')
  const [clinicalNote, setClinicalNote] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latestRequest, setLatestRequest] = useState<EmergencyRequest | null>(null)
  const [requestsList, setRequestsList] = useState<EmergencyRequest[]>([])

  // Arrival confirmation dialog state
  const [receiptModalReq, setReceiptModalReq] = useState<EmergencyRequest | null>(null)
  const [coolboxTemp, setCoolboxTemp] = useState<string>('4.5')
  const [receiptWarning, setReceiptWarning] = useState<string | null>(null)
  const [isConfirmingReceipt, setIsConfirmingReceipt] = useState(false)
  const [receiptDone, setReceiptDone] = useState(false)

  const openReceipt = (req: EmergencyRequest) => {
    setReceiptModalReq(req)
    setReceiptWarning(null)
    setReceiptDone(false)
  }
  const [listError, setListError] = useState<string | null>(null)
  const [listLoaded, setListLoaded] = useState(false)

  // This hospital's requests from the API; refreshed every 10 s so "In transit" appears on its own.
  const loadRequests = async () => {
    try {
      const list = await api.getRequests({ limit: 20 })
      setRequestsList(list)
      setListError(null)
      localStorage.setItem('gh_clinician_requests', JSON.stringify(list))
    } catch (err: unknown) {
      // Offline: show the last list we had, marked as such.
      setListError(err instanceof Error ? err.message : String(err))
      try {
        const cached = localStorage.getItem('gh_clinician_requests')
        if (cached) setRequestsList(JSON.parse(cached))
      } catch {
        // ignore bad cache
      }
    } finally {
      setListLoaded(true)
    }
  }
  usePolling(loadRequests, 10000)

  const saveToLocal = (newReq: EmergencyRequest) => {
    setRequestsList((prev) => [newReq, ...prev.filter((r) => r.id !== newReq.id)])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    // Validation
    if (bloodGroup === 'unknown' && component === 'PLT') {
      setError('Platelets cannot be requested for an unknown blood group. Group the patient first.')
      setIsSubmitting(false)
      return
    }

    try {
      const created = await api.createRequest({
        patient_blood_group: bloodGroup,
        component,
        units_requested: units,
        urgency,
        clinical_note: clinicalNote,
      })
      setLatestRequest(created)
      saveToLocal(created)
      if (onRequestCreated) onRequestCreated(created)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(`Not sent: ${errMsg} If this continues, call the blood bank.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmArrival = async (req: EmergencyRequest) => {
    setIsConfirmingReceipt(true)
    setReceiptWarning(null)
    const temp = parseFloat(coolboxTemp)
    if (!req.dispatch_id) {
      setReceiptWarning('No dispatch found for this request yet. Refresh and try again.')
      setIsConfirmingReceipt(false)
      return
    }

    try {
      const res = await api.updateDispatchStatus(req.dispatch_id, 'received', isNaN(temp) ? undefined : temp)
      saveToLocal({ ...req, status: res.request_status })
      if (res.warnings.length > 0) {
        // Keep the dialog open so the quarantine warning is read; it closes with "Close".
        setReceiptWarning(res.warnings.join(' '))
        setReceiptDone(true)
      } else {
        setReceiptModalReq(null)
      }
      loadRequests()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setReceiptWarning(`Not confirmed: ${errMsg}`)
    } finally {
      setIsConfirmingReceipt(false)
    }
  }

  const applyPreset = (presetType: 'pph' | 'rta') => {
    if (presetType === 'pph') {
      setBloodGroup('O+')
      setComponent('RBC')
      setUnits(2)
      setUrgency('life_threatening')
      setClinicalNote('Severe obstetric post-partum haemorrhage (PPH) in maternity theatre. Vitals unstable.')
    } else {
      setBloodGroup('unknown')
      setComponent('RBC')
      setUnits(4)
      setUrgency('life_threatening')
      setClinicalNote('Pedestrian road traffic trauma, acute massive internal haemorrhage, uncrossmatched emergency.')
    }
  }

  const latest = latestRequest && (requestsList.find((r) => r.id === latestRequest.id) || latestRequest)
  const arriving = requestsList.filter((r) => r.status === 'InTransit')

  const receiptDialog = receiptModalReq && (
        <Dialog title={`Confirm arrival · #${receiptModalReq.id}`}>
          <p className="text-sm">
            {receiptModalReq.units_requested} × {COMPONENT_LABEL[receiptModalReq.component]} {group(receiptModalReq.patient_blood_group)}
          </p>
          <div>
            <Label htmlFor="coolbox">Highest cool box temperature (°C)</Label>
            <input
              id="coolbox"
              type="number"
              step="0.1"
              value={coolboxTemp}
              onChange={(e) => setCoolboxTemp(e.target.value)}
              className={`${inputCls} text-lg tabular-nums`}
            />
            <p className="text-xs text-slate-500 mt-1">Limit 10 °C.</p>
          </div>
          {receiptWarning && <Notice tone="error">{receiptWarning}</Notice>}
          <div className="flex gap-2 justify-end">
            <Button onClick={() => setReceiptModalReq(null)}>{receiptDone ? 'Close' : 'Cancel'}</Button>
            {!receiptDone && (
              <Button kind="primary" disabled={isConfirmingReceipt} onClick={() => handleConfirmArrival(receiptModalReq)}>
                {isConfirmingReceipt ? 'Saving…' : 'Confirm'}
              </Button>
            )}
          </div>
        </Dialog>
  )

  if (section === 'arrivals') {
    return (
      <Page title="Confirm arrivals" subtitle="Blood on its way to your hospital. Confirm when it arrives.">
        {listError && <Notice tone="warn">Offline: showing the last list loaded.</Notice>}
        {!listLoaded ? (
          <Empty>Loading…</Empty>
        ) : arriving.length === 0 ? (
          <Empty>Nothing in transit.</Empty>
        ) : (
          <ul className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {arriving.map((req) => (
              <li key={req.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-slate-500 tabular-nums">#{req.id}</span>
                <span className="text-xl font-semibold">{group(req.patient_blood_group)}</span>
                <span>{req.units_requested} × {COMPONENT_LABEL[req.component] || req.component}</span>
                {req.urgency === 'life_threatening' && <UrgencyChip urgency={req.urgency} />}
                <Button kind="primary" onClick={() => openReceipt(req)} className="ml-auto">Confirm arrival</Button>
              </li>
            ))}
          </ul>
        )}
        {receiptDialog}
      </Page>
    )
  }

  return (
    <Page
      title="Request blood"
      aside={
        <div className="flex gap-2">
          <Button onClick={() => applyPreset('pph')} className="!h-8 !px-3 !text-xs">PPH: 2 units O+</Button>
          <Button onClick={() => applyPreset('rta')} className="!h-8 !px-3 !text-xs">Trauma: O− uncrossmatched</Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <Card className="space-y-4">
          <div>
            <Label>Urgency</Label>
            <Choice<Urgency>
              cols="grid-cols-3"
              value={urgency}
              onChange={setUrgency}
              danger={['life_threatening']}
              options={[
                { value: 'life_threatening', label: 'Life-threatening' },
                { value: 'urgent', label: 'Urgent' },
                { value: 'routine', label: 'Routine' },
              ]}
            />
          </div>

          <div>
            <Label>Patient blood group</Label>
            <Choice<BloodGroup>
              cols="grid-cols-5 sm:grid-cols-9"
              value={bloodGroup}
              onChange={setBloodGroup}
              options={(['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+', 'unknown'] as BloodGroup[]).map((g) => ({
                value: g,
                label: g === 'unknown' ? '?' : group(g),
              }))}
            />
            {bloodGroup === 'unknown' && (
              <p className="mt-1 text-xs text-amber-800">Group unknown: O− will be offered. O− stock is scarce.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Component</Label>
              <Choice<BloodComponent>
                cols="grid-cols-3"
                value={component}
                onChange={setComponent}
                options={[
                  { value: 'RBC', label: 'Red cells' },
                  { value: 'FFP', label: 'Plasma' },
                  { value: 'PLT', label: 'Platelets' },
                ]}
              />
            </div>
            <div>
              <Label>Units</Label>
              <div className="flex items-center gap-2">
                <Button aria-label="One unit less" disabled={units <= 1} onClick={() => setUnits(units - 1)} className="!w-11 !h-11 !px-0 text-lg">
                  −
                </Button>
                <span className="w-12 text-center text-3xl font-semibold tabular-nums" aria-live="polite">{units}</span>
                <Button aria-label="One unit more" disabled={units >= MAX_UNITS} onClick={() => setUnits(units + 1)} className="!w-11 !h-11 !px-0 text-lg">
                  +
                </Button>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="note">Note (optional)</Label>
            <textarea
              id="note"
              value={clinicalNote}
              onChange={(e) => setClinicalNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ward, indication"
              className={inputCls}
            />
            <p className="text-xs text-slate-500 mt-1">Only the blood bank sees this note.</p>
          </div>
        </Card>

        {/* Always visible, also on a phone */}
        <div className="sticky bottom-0 bg-slate-100 pt-3 pb-3 space-y-2">
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" kind="primary" big disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Sending…' : 'Request blood'}
          </Button>
        </div>
      </form>

      {latest && (
        <Notice tone="ok">
          Request #{latest.id} sent · <StatusChip status={latest.status} /> ·{' '}
          <a href={`#/app/requests/${latest.id}`} className="underline">Track it</a>
          {latest.warnings && latest.warnings.length > 0 && (
            <span className="block mt-1 text-amber-900">{latest.warnings.join(' ')}</span>
          )}
        </Notice>
      )}

    </Page>
  )
}
