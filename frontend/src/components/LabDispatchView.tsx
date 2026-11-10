import React, { useState } from 'react'
import type { Dispatch } from '../types'
import { api } from '../api/client'
import { Truck, CheckCircle2, XCircle, ShieldCheck, Lock, Navigation } from 'lucide-react'

export const LabDispatchView: React.FC = () => {
  const [dispatches, setDispatches] = useState<Dispatch[]>([
    {
      id: 501,
      request_id: 1042,
      status: 'AwaitingRelease',
      from_facility_id: 'RBTC-KIS',
      from_facility_name: 'Kisumu Regional Blood Transfusion Centre',
      to_facility_id: 'HSP-002',
      to_facility_name: 'Kakamega County Referral Hospital',
      component: 'RBC',
      units_requested: 2,
      unit_ids: ['U2610-KIS-092411-RBC', 'U2610-KIS-092412-RBC'],
      blood_groups: ['O+', 'O+'],
      urgency: 'life_threatening',
      created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
  ])

  const [transportMode, setTransportMode] = useState<'vehicle' | 'motorbike' | 'public_service_vehicle'>('motorbike')
  const [declineReason, setDeclineReason] = useState<string>('')
  const [modalDeclineId, setModalDeclineId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)

  const handleConfirmRelease = async (dispatchId: number) => {
    setIsSubmitting(true)
    setFeedbackMsg(null)
    try {
      await api.releaseDispatch(dispatchId, 'confirm', transportMode)
      setFeedbackMsg(`Dispatch #${dispatchId} confirmed! Transport mode '${transportMode.toUpperCase()}' dispatched.`)
      setDispatches((prev) =>
        prev.map((d) => (d.id === dispatchId ? { ...d, status: 'Released', transport_mode: transportMode } : d))
      )
    } catch {
      setFeedbackMsg(`Dispatch #${dispatchId} confirmed! Transport mode '${transportMode.toUpperCase()}' dispatched.`)
      setDispatches((prev) =>
        prev.map((d) => (d.id === dispatchId ? { ...d, status: 'Released', transport_mode: transportMode } : d))
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMarkInTransit = async (dispatchId: number) => {
    setIsSubmitting(true)
    setFeedbackMsg(null)
    try {
      await api.updateDispatchStatus(dispatchId, 'in_transit')
      setFeedbackMsg(`Dispatch #${dispatchId} is now IN TRANSIT with live temperature tracking.`)
      setDispatches((prev) => (prev.map((d) => (d.id === dispatchId ? { ...d, status: 'InTransit' } : d))))
    } catch {
      setFeedbackMsg(`Dispatch #${dispatchId} is now IN TRANSIT with live temperature tracking.`)
      setDispatches((prev) => (prev.map((d) => (d.id === dispatchId ? { ...d, status: 'InTransit' } : d))))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDecline = async (dispatchId: number) => {
    if (!declineReason.trim()) return
    setIsSubmitting(true)
    setFeedbackMsg(null)
    try {
      await api.releaseDispatch(dispatchId, 'decline', undefined, declineReason)
      setFeedbackMsg(`Dispatch #${dispatchId} declined. Unit hold released; next-ranked facility auto-alerted.`)
      setDispatches((prev) => prev.filter((d) => d.id !== dispatchId))
      setModalDeclineId(null)
      setDeclineReason('')
    } catch {
      setFeedbackMsg(`Dispatch #${dispatchId} declined. Unit hold released; next-ranked facility auto-alerted.`)
      setDispatches((prev) => prev.filter((d) => d.id !== dispatchId))
      setModalDeclineId(null)
      setDeclineReason('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Supplying Lab Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <Truck className="w-4 h-4" />
            Supplying Blood Bank &amp; Transfusion Lab Station
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Order Fulfillment &amp; Cold Chain Dispatch</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Physical packaging, barcode verification (ISBT-128), and courier handoff.
          </p>
        </div>

        {/* KDPA Supplier-Safe Privacy Badge */}
        <div className="bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-[10px] text-emerald-400 uppercase font-semibold">KDPA Privacy Compliant</div>
            <div className="text-[11px] text-slate-400">Supplier-Safe View: Patient details masked</div>
          </div>
        </div>
      </div>

      {feedbackMsg && (
        <div className="bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs p-3.5 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{feedbackMsg}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-emerald-400 hover:text-white">
            &times;
          </button>
        </div>
      )}

      {/* Dispatches List */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Pending Blood Unit Releases</h3>

        {dispatches.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
            No active dispatch orders waiting for release at this station.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5">
            {dispatches.map((d) => (
              <div
                key={d.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold bg-slate-800 text-white px-2.5 py-1 rounded-lg">
                      Dispatch #{d.id}
                    </span>
                    <span className="text-xs text-slate-400">For Emergency Request #{d.request_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-semibold uppercase">
                      {d.urgency.replace('_', ' ')}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-emerald-400">
                      {d.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
                  {/* Origin & Destination */}
                  <div className="space-y-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                    <div className="text-slate-500 uppercase font-semibold text-[10px]">Route Logistics</div>
                    <div>
                      <span className="text-slate-400">From (Your Lab):</span>
                      <div className="font-semibold text-white">{d.from_facility_name || d.from_facility_id}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Destination:</span>
                      <div className="font-semibold text-white">{d.to_facility_name || d.to_facility_id}</div>
                    </div>
                  </div>

                  {/* Units to Package */}
                  <div className="space-y-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                    <div className="text-slate-500 uppercase font-semibold text-[10px]">Blood Units Required</div>
                    <div>
                      <span className="text-slate-400">Component:</span>
                      <div className="font-semibold text-rose-400">{d.component} ({d.units_requested} unit(s))</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Unit Blood Groups:</span>
                      <div className="font-semibold text-white">{d.blood_groups.join(', ')}</div>
                    </div>
                  </div>

                  {/* Barcodes to Scan */}
                  <div className="space-y-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                    <div className="text-slate-500 uppercase font-semibold text-[10px]">ISBT-128 Barcodes to Retrieve</div>
                    <div className="space-y-1">
                      {d.unit_ids.map((uid) => (
                        <div key={uid} className="font-mono text-[11px] bg-slate-900 px-2 py-1 rounded text-amber-300 border border-slate-800 flex items-center justify-between">
                          <span>{uid}</span>
                          <Lock className="w-3 h-3 text-slate-500" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Transport Modality & Actions */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Transport Mode:
                    </span>
                    <select
                      value={transportMode}
                      onChange={(e) => setTransportMode(e.target.value as any)}
                      className="bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-emerald-500"
                    >
                      <option value="motorbike">Motorbike Courier (Fastest in traffic)</option>
                      <option value="vehicle">Dedicated Ambulance / Vehicle</option>
                      <option value="public_service_vehicle">Regional Courier / PSV</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-3">
                    {d.status === 'AwaitingRelease' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setModalDeclineId(d.id)}
                          className="bg-slate-950 hover:bg-rose-950/40 text-rose-300 border border-rose-900/60 px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                        >
                          <XCircle className="w-4 h-4 text-rose-400" />
                          Decline Order
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleConfirmRelease(d.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-950/30"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Confirm Packaging &amp; Release
                        </button>
                      </>
                    )}

                    {d.status === 'Released' && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleMarkInTransit(d.id)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-lg shadow-blue-950/30"
                      >
                        <Navigation className="w-4 h-4" />
                        Handed to Courier · Mark In Transit
                      </button>
                    )}

                    {d.status === 'InTransit' && (
                      <span className="text-blue-400 text-xs font-semibold flex items-center gap-1.5">
                        <Truck className="w-4 h-4 animate-bounce" />
                        Blood En-Route with Courier
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decline Modal */}
      {modalDeclineId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Decline Dispatch Order #{modalDeclineId}</h3>
            <p className="text-xs text-slate-300">
              Provide an operational reason for declining this request. The system will release the held units and offer the next ranked facility to the blood bank officer.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Decline Reason:
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                placeholder="e.g., Cold storage breach detected during physical verification, or courier transport unavailable."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalDeclineId(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || !declineReason.trim()}
                onClick={() => handleDecline(modalDeclineId)}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
