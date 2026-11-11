import React, { useState, useEffect } from 'react'
import type { BloodGroup, BloodComponent, Urgency, EmergencyRequest } from '../types'
import { api } from '../api/client'
import { AlertCircle, Clock, CheckCircle2, Send, Droplets, Thermometer, Sparkles, AlertTriangle } from 'lucide-react'

export const ClinicianView: React.FC<{ onRequestCreated?: (req: EmergencyRequest) => void }> = ({
  onRequestCreated,
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
  
  // Arrival confirmation modal state
  const [receiptModalReq, setReceiptModalReq] = useState<EmergencyRequest | null>(null)
  const [coolboxTemp, setCoolboxTemp] = useState<string>('4.5')
  const [receiptWarning, setReceiptWarning] = useState<string | null>(null)
  const [isConfirmingReceipt, setIsConfirmingReceipt] = useState(false)

  // Load existing requests from localStorage and backend
  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    try {
      const res = await api.getRequests()
      const list = Array.isArray(res) ? res : res.results || []
      if (list.length > 0) {
        setRequestsList(list)
        return
      }
    } catch {
      // fallback to local cache
    }
    const cached = localStorage.getItem('gh_clinician_requests')
    if (cached) {
      setRequestsList(JSON.parse(cached))
    }
  }

  const saveToLocal = (newReq: EmergencyRequest) => {
    const updated = [newReq, ...requestsList.filter(r => r.id !== newReq.id)]
    setRequestsList(updated)
    localStorage.setItem('gh_clinician_requests', JSON.stringify(updated))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    // Validation
    if (bloodGroup === 'unknown' && component === 'PLT') {
      setError('Platelets cannot be requested for unknown blood group. Group the patient first.')
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
      setError(`Request not sent: ${errMsg}. Please check server connection or call the blood bank directly.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmArrival = async (req: EmergencyRequest) => {
    setIsConfirmingReceipt(true)
    setReceiptWarning(null)
    const temp = parseFloat(coolboxTemp)
    const dispatchId = req.dispatch_id || req.id

    try {
      const res = await api.updateDispatchStatus(dispatchId, 'received', isNaN(temp) ? undefined : temp)
      if (res.warning) {
        setReceiptWarning(res.warning)
      } else if (temp > 10.0) {
        setReceiptWarning(`CRITICAL ALERT: Cool box temperature (${temp}°C) breached 10°C limit! Units must be placed in quarantine immediately.`)
      }
      const updated: EmergencyRequest = { ...req, status: 'Received' }
      saveToLocal(updated)
      setReceiptModalReq(null)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setReceiptWarning(`Confirmation refused: ${errMsg}`)
    } finally {
      setIsConfirmingReceipt(false)
    }
  }

  const applyPreset = (presetType: 'pph' | 'rta' | 'trauma') => {
    if (presetType === 'pph') {
      setBloodGroup('O+')
      setComponent('RBC')
      setUnits(2)
      setUrgency('life_threatening')
      setClinicalNote('Severe obstetric post-partum haemorrhage (PPH) in maternity theatre. Vitals unstable.')
    } else if (presetType === 'rta') {
      setBloodGroup('unknown')
      setComponent('RBC')
      setUnits(4)
      setUrgency('life_threatening')
      setClinicalNote('Pedestrian road traffic trauma, acute massive internal haemorrhage, uncrossmatched emergency.')
    } else if (presetType === 'trauma') {
      setBloodGroup('B+')
      setComponent('FFP')
      setUnits(2)
      setUrgency('urgent')
      setClinicalNote('Disseminated intravascular coagulation risk post-trauma.')
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Clinician Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold uppercase tracking-wider">
            <Droplets className="w-4 h-4" />
            Ward Clinician Terminal
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Raise Emergency Blood Request</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Requests trigger automated compatibility validation across all 47 regional facilities and reserve units instantly.
          </p>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 font-medium mr-1 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Emergency Presets:
          </span>
          <button
            type="button"
            onClick={() => applyPreset('pph')}
            className="text-xs bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-700/60 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg transition-all"
          >
            Maternity PPH (2U O+)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('rta')}
            className="text-xs bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-700/60 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg transition-all"
          >
            Trauma Uncrossmatched (O-)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Column */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-rose-950/60 border border-rose-800 text-rose-200 text-xs p-3.5 rounded-xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Blood Group & Component Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Patient Blood Group
                </label>
                <select
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-medium text-sm focus:outline-none focus:border-rose-500 transition-colors"
                >
                  <option value="O+">O+ (RhD Positive)</option>
                  <option value="O-">O- (Universal Red Cell Donor - Rare)</option>
                  <option value="A+">A+ (RhD Positive)</option>
                  <option value="A-">A- (RhD Negative)</option>
                  <option value="B+">B+ (RhD Positive)</option>
                  <option value="B-">B- (RhD Negative)</option>
                  <option value="AB+">AB+ (Universal Red Cell Recipient)</option>
                  <option value="AB-">AB- (RhD Negative)</option>
                  <option value="unknown">Unknown / Uncrossmatched</option>
                </select>

                {bloodGroup === 'unknown' && (
                  <p className="mt-2 text-xs text-amber-400/90 bg-amber-950/30 border border-amber-900/50 p-2.5 rounded-lg flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Recommends O− universal donor red cells. O− stock is scarce; grouped units will be prioritized once grouped.</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Blood Component
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['RBC', 'FFP', 'PLT'] as BloodComponent[]).map((comp) => (
                    <button
                      key={comp}
                      type="button"
                      onClick={() => setComponent(comp)}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                        component === comp
                          ? 'bg-rose-600/20 border-rose-500 text-rose-300 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {comp === 'RBC' && 'Red Cells (RBC)'}
                      {comp === 'FFP' && 'Plasma (FFP)'}
                      {comp === 'PLT' && 'Platelets (PLT)'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {component === 'RBC' && '35–42 day shelf life · 2–6°C cold chain.'}
                  {component === 'FFP' && 'Reversed compatibility table (AB gives to all).'}
                  {component === 'PLT' && '5 day shelf life · 20–24°C continuous agitation.'}
                </p>
              </div>
            </div>

            {/* Units & Urgency */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Units Requested
                  </label>
                  <span className="text-sm font-bold text-rose-400">{units} unit(s)</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={units}
                  onChange={(e) => setUnits(parseInt(e.target.value))}
                  className="w-full accent-rose-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                  <span>1 Unit</span>
                  <span>4 Units (Typical)</span>
                  <span>8 Units (Max)</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Clinical Urgency
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['life_threatening', 'urgent', 'routine'] as Urgency[]).map((urg) => (
                    <button
                      key={urg}
                      type="button"
                      onClick={() => setUrgency(urg)}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center capitalize ${
                        urgency === urg
                          ? urg === 'life_threatening'
                            ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-900/30'
                            : 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-900/30'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {urg.replace('_', ' ')}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {urgency === 'life_threatening' && 'Target: <60m. Standing emergency authorisation route applies.'}
                  {urgency === 'urgent' && 'Target: <180m. Requires MoH officer sign-off with 5m timer.'}
                  {urgency === 'routine' && 'Scheduled elective or redistribution.'}
                </p>
              </div>
            </div>

            {/* Clinical Note */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Clinical Indication &amp; Theater Location (Optional)
              </label>
              <textarea
                value={clinicalNote}
                onChange={(e) => setClinicalNote(e.target.value)}
                rows={2}
                placeholder="e.g., Maternity Theatre 2, acute severe haemorrhage, vitals BP 70/40, HR 135"
                maxLength={500}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-rose-500 transition-colors"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Strict privacy note (KDPA): Note is visible only to clinician and blood bank officer. Supplying lab sees only component and blood group.
              </p>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-rose-900/40 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>Scanning 47 Facilities &amp; Running ML ETA Model...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Dispatch Immediate Blood Request ({units}U {bloodGroup} {component})</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Info Card: Protocol & Immediate Feedback */}
        <div className="space-y-6">
          {latestRequest ? (
            <div className="bg-slate-900 border border-rose-800/80 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded-full font-mono font-semibold">
                  Request #{latestRequest.id}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(latestRequest.created_at).toLocaleTimeString()}
                </span>
              </div>

              <div>
                <div className="text-xs text-slate-400">Current Status</div>
                <div className="text-base font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  {latestRequest.status}
                </div>
              </div>

              <div className="text-xs space-y-1.5 text-slate-300 border-t border-slate-800 pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-400">Component:</span>
                  <span className="font-semibold">{latestRequest.component} ({latestRequest.units_requested} units)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Patient Group:</span>
                  <span className="font-semibold">{latestRequest.patient_blood_group}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Compatible Pick:</span>
                  <span className="font-semibold text-rose-300">[{latestRequest.compatible_groups.join(', ')}]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ETA Engine:</span>
                  <span className="font-semibold text-amber-300">
                    {latestRequest.eta_method === 'model' ? 'Random Forest ML' : 'Route Table Fallback'}
                  </span>
                </div>
              </div>

              {latestRequest.warnings && latestRequest.warnings.length > 0 && (
                <div className="bg-amber-950/40 border border-amber-900/60 p-3 rounded-xl text-xs text-amber-200">
                  {latestRequest.warnings[0]}
                </div>
              )}

              <div className="bg-slate-950 p-3 rounded-xl text-xs text-slate-400 border border-slate-800">
                <span className="text-white font-medium">Automatic Unit Hold Active:</span> Units at the top-ranked facility are reserved. Handed off to Blood Bank Officer for review.
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold uppercase tracking-wider">
                <Clock className="w-4 h-4" />
                The Golden Hour Standard
              </div>
              <h3 className="text-sm font-semibold text-white">How Intelligent Dispatch Works</h3>
              <ul className="text-xs text-slate-400 space-y-2.5">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></span>
                  <span><strong>Biological compatibility:</strong> Fixed ABO/RhD matrix rules engine (antigen verified, never AI).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></span>
                  <span><strong>Safety filters:</strong> Excludes temperature excursions, reactive screenings, and expired units.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></span>
                  <span><strong>Calibrated ML ETA:</strong> Predicts realistic transit time from 35,181 historical transfers with honest uncertainty bounds.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></span>
                  <span><strong>Human-in-the-loop:</strong> Blood bank officer must Accept, Change, or Reject every dispatch.</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Requests History & Arrival Tracking Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>Hospital Blood Requests Queue</span>
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
              {requestsList.length}
            </span>
          </h3>
          <button
            onClick={loadRequests}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Refresh
          </button>
        </div>

        {requestsList.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">
            No active emergency blood requests. Use the form above to submit an urgent dispatch.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Request ID</th>
                  <th className="py-3 px-4">Urgency</th>
                  <th className="py-3 px-4">Component &amp; Group</th>
                  <th className="py-3 px-4">Units</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {requestsList.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-white">#{req.id}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-semibold ${
                        req.urgency === 'life_threatening'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {req.urgency.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {req.component} · <strong className="text-white">{req.patient_blood_group}</strong>
                    </td>
                    <td className="py-3 px-4">{req.units_requested} U</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        req.status === 'Received'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : req.status === 'InTransit'
                          ? 'bg-blue-500/20 text-blue-300 animate-pulse'
                          : req.status === 'AwaitingDecision'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {req.status === 'InTransit' ? (
                        <button
                          onClick={() => setReceiptModalReq(req)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold px-3 py-1 rounded-lg transition-colors flex items-center gap-1 ml-auto"
                        >
                          <Thermometer className="w-3 h-3" />
                          Confirm Arrival
                        </button>
                      ) : req.status === 'Received' ? (
                        <span className="text-emerald-400 text-xs flex items-center gap-1 justify-end font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Transfusion Ready
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">In Progress</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Arrival / Cool Box Temperature Confirmation Modal */}
      {receiptModalReq && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-2.5 text-emerald-400">
              <Thermometer className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Confirm Blood Arrival &amp; Cold Chain</h3>
            </div>
            <p className="text-xs text-slate-300">
              Request #{receiptModalReq.id}: Confirm physical receipt of {receiptModalReq.units_requested} unit(s) of {receiptModalReq.component} ({receiptModalReq.patient_blood_group}).
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Cool Box Max Temperature (°C)
              </label>
              <input
                type="number"
                step="0.1"
                value={coolboxTemp}
                onChange={(e) => setCoolboxTemp(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-base focus:outline-none focus:border-rose-500"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Standard safe range: 2.0°C – 6.0°C (cool box breach limit: &gt;10.0°C).
              </p>
            </div>

            {receiptWarning && (
              <div className="bg-rose-950/60 border border-rose-800 p-3 rounded-xl text-xs text-rose-200">
                {receiptWarning}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReceiptModalReq(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isConfirmingReceipt}
                onClick={() => handleConfirmArrival(receiptModalReq)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                {isConfirmingReceipt ? 'Logging...' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
