import React, { useState, useEffect } from 'react'
import type { BloodGroup, BloodComponent, Urgency, EmergencyRequest } from '../types'
import { api } from '../api/client'

const S = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px' } as React.CSSProperties,
  label: { fontSize: 11, fontFamily: 'var(--mono)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--ink-faint)', marginBottom: 6, display: 'block' } as React.CSSProperties,
  card: { background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 8, padding: 24 } as React.CSSProperties,
  rule: { borderTop: '1px solid var(--rule)', margin: '20px 0' } as React.CSSProperties,
  h2: { fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 } as React.CSSProperties,
  muted: { fontSize: 13, color: 'var(--ink-muted)' } as React.CSSProperties,
  fieldLabel: { fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 6, display: 'block' } as React.CSSProperties,
  input: {
    width: '100%', padding: '9px 12px', fontSize: 14, borderRadius: 6,
    border: '1px solid var(--rule)', background: 'var(--surface)', color: 'var(--ink)',
    fontFamily: 'var(--sans)', outline: 'none',
  } as React.CSSProperties,
}

const statusColor = (s: string) => {
  if (s === 'Received') return { background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }
  if (s === 'InTransit') return { background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }
  if (s === 'AwaitingDecision') return { background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }
  if (s === 'AwaitingAuthorisation') return { background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }
  return { background: 'var(--surface-raised)', color: 'var(--ink-muted)', border: '1px solid var(--rule)' }
}

export const ClinicianView: React.FC<{ onRequestCreated?: (req: EmergencyRequest) => void }> = ({ onRequestCreated }) => {
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+')
  const [component, setComponent] = useState<BloodComponent>('RBC')
  const [units, setUnits] = useState(2)
  const [urgency, setUrgency] = useState<Urgency>('life_threatening')
  const [clinicalNote, setClinicalNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latestRequest, setLatestRequest] = useState<EmergencyRequest | null>(null)
  const [requestsList, setRequestsList] = useState<EmergencyRequest[]>([])
  const [receiptModalReq, setReceiptModalReq] = useState<EmergencyRequest | null>(null)
  const [coolboxTemp, setCoolboxTemp] = useState('4.5')
  const [receiptWarning, setReceiptWarning] = useState<string | null>(null)
  const [isConfirmingReceipt, setIsConfirmingReceipt] = useState(false)

  useEffect(() => { loadRequests() }, [])

  const loadRequests = async () => {
    try {
      const res = await api.getRequests()
      const list = Array.isArray(res) ? res : res.results || []
      if (list.length > 0) { setRequestsList(list); return }
    } catch { /* fallback */ }
    const cached = localStorage.getItem('gh_clinician_requests')
    if (cached) setRequestsList(JSON.parse(cached))
  }

  const saveToLocal = (newReq: EmergencyRequest) => {
    const updated = [newReq, ...requestsList.filter(r => r.id !== newReq.id)]
    setRequestsList(updated)
    localStorage.setItem('gh_clinician_requests', JSON.stringify(updated))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setIsSubmitting(true)
    if (bloodGroup === 'unknown' && component === 'PLT') {
      setError('Platelets require a known blood group. Group the patient first.')
      setIsSubmitting(false); return
    }
    try {
      const created = await api.createRequest({ patient_blood_group: bloodGroup, component, units_requested: units, urgency, clinical_note: clinicalNote })
      setLatestRequest(created); saveToLocal(created)
      if (onRequestCreated) onRequestCreated(created)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setIsSubmitting(false) }
  }

  const handleConfirmArrival = async (req: EmergencyRequest) => {
    setIsConfirmingReceipt(true); setReceiptWarning(null)
    const temp = parseFloat(coolboxTemp)
    try {
      const res = await api.updateDispatchStatus(req.dispatch_id || req.id, 'received', isNaN(temp) ? undefined : temp)
      if (res.warning) setReceiptWarning(res.warning)
      else if (temp > 10.0) setReceiptWarning(`ALERT: Cool box ${temp}°C exceeds 10°C limit. Units must be quarantined immediately.`)
      saveToLocal({ ...req, status: 'Received' }); setReceiptModalReq(null)
    } catch (err: unknown) {
      setReceiptWarning(err instanceof Error ? err.message : String(err))
    } finally { setIsConfirmingReceipt(false) }
  }

  const presets = [
    { label: 'PPH (2U O+)', group: 'O+', comp: 'RBC', units: 2, urgency: 'life_threatening', note: 'Severe obstetric post-partum haemorrhage in maternity theatre. Vitals unstable.' },
    { label: 'Trauma uncrossmatched', group: 'unknown', comp: 'RBC', units: 4, urgency: 'life_threatening', note: 'Road traffic trauma, acute massive haemorrhage, uncrossmatched emergency.' },
  ] as const

  return (
    <div style={S.page}>
      <div style={{ marginBottom: 28 }}>
        <span style={S.label}>Ward Clinician · HSP-002</span>
        <h2 style={S.h2}>Request Blood</h2>
        <p style={{ ...S.muted, marginTop: 4 }}>Requests scan all 47 facilities, run compatibility checks, and auto-hold units at the top site.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
        {/* Form */}
        <div style={S.card}>
          {/* Presets */}
          <div style={{ marginBottom: 24 }}>
            <span style={S.label}>Quick presets</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {presets.map(p => (
                <button key={p.label} type="button" onClick={() => { setBloodGroup(p.group as BloodGroup); setComponent(p.comp as BloodComponent); setUnits(p.units); setUrgency(p.urgency as Urgency); setClinicalNote(p.note) }}
                  style={{ padding: '7px 14px', fontSize: 12, border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--surface-raised)', color: 'var(--ink)', cursor: 'pointer' }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={S.rule} />

          <form onSubmit={handleSubmit}>
            {error && <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 13, color: '#B91C1C', marginBottom: 20 }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              {/* Blood Group */}
              <div>
                <label style={S.fieldLabel}>Patient blood group</label>
                <select value={bloodGroup} onChange={e => setBloodGroup(e.target.value as BloodGroup)} style={{ ...S.input }}>
                  {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'unknown'].map(g => (
                    <option key={g} value={g}>{g === 'unknown' ? 'Unknown / Uncrossmatched' : g}</option>
                  ))}
                </select>
                {bloodGroup === 'unknown' && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--warn)' }}>⚠ Will recommend O− universal donor. O− stock is scarce.</div>}
              </div>

              {/* Component */}
              <div>
                <label style={S.fieldLabel}>Component</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {(['RBC', 'FFP', 'PLT'] as BloodComponent[]).map(c => (
                    <button key={c} type="button" onClick={() => setComponent(c)} style={{
                      padding: '8px 4px', fontSize: 13, fontWeight: 500, borderRadius: 6, cursor: 'pointer',
                      border: '1px solid', textAlign: 'center',
                      background: component === c ? 'var(--ink)' : 'var(--surface-raised)',
                      color: component === c ? '#fff' : 'var(--ink-muted)',
                      borderColor: component === c ? 'var(--ink)' : 'var(--rule)',
                    }}>{c}</button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 6 }}>
                  {component === 'RBC' && '35–42 day shelf · 2–6°C'}
                  {component === 'FFP' && 'Reversed ABO compat · frozen'}
                  {component === 'PLT' && '5-day shelf · 20–24°C agitation'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              {/* Units */}
              <div>
                <label style={S.fieldLabel}>Units — <strong style={{ color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{units}</strong></label>
                <input type="range" min={1} max={8} value={units} onChange={e => setUnits(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>
                  <span>1</span><span>4</span><span>8</span>
                </div>
              </div>

              {/* Urgency */}
              <div>
                <label style={S.fieldLabel}>Urgency</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {(['life_threatening', 'urgent', 'routine'] as Urgency[]).map(u => (
                    <button key={u} type="button" onClick={() => setUrgency(u)} style={{
                      padding: '8px 4px', fontSize: 11, fontWeight: 500, borderRadius: 6, cursor: 'pointer',
                      border: '1px solid', textAlign: 'center' as const,
                      background: urgency === u ? (u === 'life_threatening' ? 'var(--accent)' : u === 'urgent' ? 'var(--warn)' : 'var(--safe)') : 'var(--surface-raised)',
                      color: urgency === u ? '#fff' : 'var(--ink-muted)',
                      borderColor: urgency === u ? 'transparent' : 'var(--rule)',
                    }}>{u === 'life_threatening' ? 'Critical' : u.charAt(0).toUpperCase() + u.slice(1)}</button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 6 }}>
                  {urgency === 'life_threatening' && 'Target <60 min · standing MoH auth'}
                  {urgency === 'urgent' && 'Target <180 min · MoH sign-off required'}
                  {urgency === 'routine' && 'Scheduled / elective'}
                </div>
              </div>
            </div>

            {/* Clinical note */}
            <div style={{ marginBottom: 24 }}>
              <label style={S.fieldLabel}>Clinical note (optional)</label>
              <textarea value={clinicalNote} onChange={e => setClinicalNote(e.target.value)} rows={2} maxLength={500}
                placeholder="e.g. Theatre 2, acute PPH, BP 70/40, HR 135"
                style={{ ...S.input, resize: 'vertical' }} />
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>
                KDPA: Visible to officer only. Supplying lab sees component and blood group only.
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} style={{
              width: '100%', padding: '12px', fontSize: 14, fontWeight: 600, borderRadius: 6, border: 'none',
              background: isSubmitting ? '#E5E5E5' : 'var(--accent)', color: isSubmitting ? 'var(--ink-muted)' : '#fff',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}>
              {isSubmitting ? 'Scanning 47 facilities…' : `Request ${units}U ${bloodGroup} ${component}`}
            </button>
          </form>
        </div>

        {/* Right column */}
        <div>
          {latestRequest ? (
            <div style={S.card}>
              <span style={S.label}>Latest request</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 18, fontFamily: 'var(--mono)', fontWeight: 500 }}>#{latestRequest.id}</span>
                <span style={{ fontSize: 12, ...statusColor(latestRequest.status), padding: '2px 8px', borderRadius: 3, fontFamily: 'var(--mono)' }}>
                  {latestRequest.status}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                {[
                  ['Blood group', latestRequest.patient_blood_group],
                  ['Component', `${latestRequest.component} ×${latestRequest.units_requested}`],
                  ['Compatible', (latestRequest.compatible_groups || []).join(', ')],
                  ['ETA engine', latestRequest.eta_method === 'model' ? 'ML model' : 'Route table'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ink-faint)' }}>{k}</span>
                    <span style={{ fontWeight: 500, fontFamily: 'var(--mono)' }}>{v}</span>
                  </div>
                ))}
              </div>
              {latestRequest.warnings && latestRequest.warnings.length > 0 && (
                <div style={{ marginTop: 14, padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, fontSize: 12, color: '#B45309' }}>
                  {latestRequest.warnings[0]}
                </div>
              )}
              <div style={{ ...S.rule }} />
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                Units held at top-ranked facility. Handed off to Blood Bank Officer for decision.
              </div>
            </div>
          ) : (
            <div style={S.card}>
              <span style={S.label}>How it works</span>
              <div style={{ display: 'grid', gap: 12 }}>
                {[
                  ['ABO/RhD rules', 'Full compatibility matrix — antigen-verified, never AI.'],
                  ['Safety filters', 'Excludes excursions, reactive screenings, expired units.'],
                  ['ML ETA', '30.8 min emergency accuracy vs 41.5 min baseline (−25.8%).'],
                  ['Human gate', 'Officer approves every dispatch. No autonomous release.'],
                ].map(([title, desc]) => (
                  <div key={title} style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{title}</div>
                    <div style={{ color: 'var(--ink-muted)' }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Requests table */}
      {requestsList.length > 0 && (
        <div style={{ ...S.card, marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Request Queue <span style={{ fontSize: 13, color: 'var(--ink-faint)', fontFamily: 'var(--mono)', fontWeight: 400 }}>({requestsList.length})</span></span>
            <button onClick={loadRequests} style={{ fontSize: 12, color: 'var(--ink-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Refresh</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                {['ID', 'Urgency', 'Component', 'Units', 'Status', 'Time', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-faint)', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requestsList.map(req => (
                <tr key={req.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontWeight: 500 }}>#{req.id}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 3, background: req.urgency === 'life_threatening' ? '#FEF2F2' : '#FFFBEB', color: req.urgency === 'life_threatening' ? '#B91C1C' : '#B45309', border: req.urgency === 'life_threatening' ? '1px solid #FECACA' : '1px solid #FDE68A' }}>
                      {req.urgency === 'life_threatening' ? 'Critical' : req.urgency}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)' }}>{req.patient_blood_group} {req.component}</td>
                  <td style={{ padding: '10px 12px' }}>{req.units_requested}U</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', padding: '2px 7px', borderRadius: 3, ...statusColor(req.status) }}>
                      {req.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>
                    {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {req.status === 'InTransit' && (
                      <button onClick={() => setReceiptModalReq(req)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: 'none', background: 'var(--safe)', color: '#fff', cursor: 'pointer' }}>
                        Confirm Arrival
                      </button>
                    )}
                    {req.status === 'Received' && <span style={{ fontSize: 12, color: 'var(--safe)' }}>✓ Received</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Arrival modal */}
      {receiptModalReq && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 32, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Confirm Blood Arrival</h3>
            <p style={{ ...S.muted, marginBottom: 20 }}>Request #{receiptModalReq.id}: {receiptModalReq.units_requested}U {receiptModalReq.component} ({receiptModalReq.patient_blood_group})</p>
            <label style={S.fieldLabel}>Cool box temperature (°C)</label>
            <input type="number" step="0.1" value={coolboxTemp} onChange={e => setCoolboxTemp(e.target.value)}
              style={{ ...S.input, fontFamily: 'var(--mono)', fontSize: 18, marginBottom: 6 }} />
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 20 }}>Safe range: 2.0–6.0°C. Alert triggers above 10.0°C.</div>
            {receiptWarning && <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 13, color: '#B91C1C', marginBottom: 16 }}>{receiptWarning}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setReceiptModalReq(null)} style={{ flex: 1, padding: '10px', fontSize: 13, border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--surface-raised)', cursor: 'pointer', color: 'var(--ink)' }}>Cancel</button>
              <button disabled={isConfirmingReceipt} onClick={() => handleConfirmArrival(receiptModalReq)} style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, background: 'var(--safe)', color: '#fff', cursor: 'pointer' }}>
                {isConfirmingReceipt ? 'Logging…' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
