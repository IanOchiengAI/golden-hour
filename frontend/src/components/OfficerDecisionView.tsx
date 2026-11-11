import React, { useState, useEffect } from 'react'
import type { EmergencyRequest, OptionsResponse } from '../types'
import { api } from '../api/client'

const S = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px' } as React.CSSProperties,
  section: { marginBottom: 32 } as React.CSSProperties,
  label: { fontSize: 11, fontFamily: 'var(--mono)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--ink-faint)', marginBottom: 6, display: 'block' } as React.CSSProperties,
  card: { background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 8, padding: 24 } as React.CSSProperties,
  rule: { borderTop: '1px solid var(--rule)', margin: '20px 0' } as React.CSSProperties,
  h2: { fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ink)', margin: 0 } as React.CSSProperties,
  h3: { fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 } as React.CSSProperties,
  muted: { fontSize: 13, color: 'var(--ink-muted)' } as React.CSSProperties,
  mono: { fontFamily: 'var(--mono)' } as React.CSSProperties,
  badge: (color: string) => ({
    display: 'inline-block', fontSize: 11, fontFamily: 'var(--mono)',
    padding: '2px 8px', borderRadius: 3, background: color === 'red' ? '#FEF2F2' : color === 'green' ? '#F0FDF4' : '#FFF7ED',
    color: color === 'red' ? '#B91C1C' : color === 'green' ? '#15803D' : '#B45309',
    border: `1px solid ${color === 'red' ? '#FECACA' : color === 'green' ? '#BBF7D0' : '#FED7AA'}`,
  } as React.CSSProperties),
}

const btn = (variant: 'primary' | 'secondary' | 'danger', disabled = false): React.CSSProperties => ({
  padding: '10px 20px', fontSize: 13, fontWeight: 500, borderRadius: 6,
  cursor: disabled ? 'not-allowed' : 'pointer', border: 'none',
  opacity: disabled ? 0.5 : 1, transition: 'background 0.1s',
  background: variant === 'primary' ? 'var(--safe)' : variant === 'danger' ? 'var(--accent)' : 'var(--surface-raised)',
  color: variant === 'primary' || variant === 'danger' ? '#fff' : 'var(--ink)',
  outline: variant === 'secondary' ? '1px solid var(--rule)' : 'none',
})

function formatEta(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r === 0 ? `${h}h` : `${h}h ${r}min`
}

export const OfficerDecisionView: React.FC<{ selectedRequestId?: number }> = ({ selectedRequestId }) => {
  const [requests, setRequests] = useState<EmergencyRequest[]>([])
  const [activeReqId, setActiveReqId] = useState<number | null>(selectedRequestId || null)
  const [optionsData, setOptionsData] = useState<OptionsResponse | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [timerSeconds, setTimerSeconds] = useState(285)
  const [modalMode, setModalMode] = useState<'change' | 'reject' | null>(null)
  const [decisionReason, setDecisionReason] = useState('')

  useEffect(() => { loadRequests() }, [])
  useEffect(() => {
    const t = setInterval(() => setTimerSeconds(s => s > 0 ? s - 1 : 0), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (activeReqId) loadOptions(activeReqId) }, [activeReqId])

  const loadRequests = async () => {
    setIsLoading(true)
    try {
      const res = await api.getRequests({ status: 'AwaitingDecision,Escalated' })
      let list = Array.isArray(res) ? res : res.results || []
      if (list.length === 0) {
        const all = await api.getRequests()
        list = Array.isArray(all) ? all : all.results || []
      }
      setRequests(list)
      if (list.length > 0 && !activeReqId) setActiveReqId(list[0].id)
    } catch {
      const cached = localStorage.getItem('gh_clinician_requests')
      if (cached) {
        const list = JSON.parse(cached) as EmergencyRequest[]
        setRequests(list)
        if (list.length > 0 && !activeReqId) setActiveReqId(list[0].id)
      }
    } finally { setIsLoading(false) }
  }

  const loadOptions = async (reqId: number) => {
    setIsLoading(true); setError(null); setOptionsData(null)
    try {
      const res = await api.getRequestOptions(reqId)
      setOptionsData(res)
      setSelectedOptionId(res.held_option_id || res.options[0]?.id || null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setIsLoading(false) }
  }

  const handleAccept = async () => {
    if (!activeReqId) return
    setIsSubmitting(true); setError(null); setNotice(null)
    try {
      await api.submitDecision(activeReqId, 'accept')
      setNotice('Decision recorded. Dispatch confirmed.')
      await loadRequests()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setIsSubmitting(false) }
  }

  const handleConfirmModal = async () => {
    if (!activeReqId || decisionReason.trim().length < 3) {
      setError('A clinical reason (minimum 3 characters) is mandatory.')
      return
    }
    setIsSubmitting(true); setError(null); setNotice(null)
    try {
      if (modalMode === 'change') {
        if (!selectedOptionId) throw new Error('Select an alternative option.')
        await api.submitDecision(activeReqId, 'change', selectedOptionId, decisionReason)
        setNotice('Hold transferred. Reason logged.')
      } else if (modalMode === 'reject') {
        await api.submitDecision(activeReqId, 'reject', undefined, decisionReason)
        setNotice('Request rejected. Reason logged to audit trail.')
      }
      setModalMode(null); setDecisionReason('')
      await loadRequests()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setIsSubmitting(false) }
  }

  const activeReq = requests.find(r => r.id === activeReqId)
  const mm = Math.floor(timerSeconds / 60), ss = timerSeconds % 60
  const timerStr = `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
  const timerUrgent = timerSeconds < 60

  return (
    <div style={S.page}>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <span style={S.label}>Blood Bank Officer · RBTC Nairobi</span>
          <h2 style={S.h2}>Dispatch Decision</h2>
          <p style={{ ...S.muted, marginTop: 4 }}>
            Review AI-ranked options and make the final dispatch call. Human sign-off is mandatory.
          </p>
        </div>
        {/* SLA Timer */}
        <div style={{
          textAlign: 'right', flexShrink: 0,
          borderLeft: `3px solid ${timerUrgent ? 'var(--accent)' : 'var(--rule)'}`,
          paddingLeft: 16,
        }}>
          <span style={S.label}>Decision SLA</span>
          <div style={{ fontSize: 28, fontFamily: 'var(--mono)', fontWeight: 500, color: timerUrgent ? 'var(--accent)' : 'var(--ink)' }}>
            {timerStr}
          </div>
          <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Auto-escalates if unattended</span>
        </div>
      </div>

      {/* Notices */}
      {notice && (
        <div style={{ padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, marginBottom: 16, fontSize: 13, color: '#15803D', display: 'flex', justifyContent: 'space-between' }}>
          {notice}
          <button onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803D' }}>✕</button>
        </div>
      )}
      {error && (
        <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, marginBottom: 16, fontSize: 13, color: '#B91C1C' }}>
          {error}
        </div>
      )}

      {/* Request queue selector */}
      {requests.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <span style={S.label}>Active Queue ({requests.length})</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {requests.map(r => (
              <button
                key={r.id}
                onClick={() => { setActiveReqId(r.id); setNotice(null) }}
                style={{
                  padding: '6px 14px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
                  border: '1px solid', transition: 'all 0.1s',
                  background: activeReqId === r.id ? 'var(--ink)' : 'var(--surface)',
                  color: activeReqId === r.id ? '#fff' : 'var(--ink-muted)',
                  borderColor: activeReqId === r.id ? 'var(--ink)' : 'var(--rule)',
                  fontFamily: 'var(--mono)',
                }}
              >
                #{r.id} · {r.patient_blood_group} {r.component} ×{r.units_requested}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active request summary */}
      {activeReq && (
        <div style={{ ...S.card, marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 24 }}>
            {[
              { label: 'Blood Group', value: activeReq.patient_blood_group, big: true },
              { label: 'Component', value: activeReq.component },
              { label: 'Units', value: `×${activeReq.units_requested}` },
              { label: 'Urgency', value: activeReq.urgency.replace('_', ' ') },
              { label: 'Compatible Groups', value: (activeReq.compatible_groups || []).join(', ') },
              { label: 'ETA Model', value: activeReq.eta_method === 'model' ? 'AI active' : 'Fallback' },
            ].map(item => (
              <div key={item.label}>
                <span style={S.label}>{item.label}</span>
                <div style={{ fontSize: item.big ? 22 : 15, fontWeight: item.big ? 600 : 500, fontFamily: item.big ? 'var(--mono)' : undefined, color: 'var(--ink)' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
          {activeReq.clinical_note && (
            <>
              <div style={S.rule} />
              <div>
                <span style={S.label}>Clinical Note</span>
                <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: 0 }}>{activeReq.clinical_note}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* AI model status banner */}
      {optionsData && (
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--ink-muted)' }}>
          <span style={optionsData.ai_offline ? S.badge('orange') : S.badge('green')}>
            {optionsData.ai_offline ? 'AI Offline · Route table fallback' : 'ML model active · 34,135 transfers trained'}
          </span>
          <span>Data as of {optionsData.data_as_of} · Emergency MAE 30.8 min (−25.8% vs baseline)</span>
        </div>
      )}

      {/* Ranked options */}
      <span style={{ ...S.label, marginBottom: 12, display: 'block' }}>Ranked Dispatch Options</span>
      {isLoading && (
        <div style={{ ...S.card, textAlign: 'center', padding: 48, color: 'var(--ink-faint)', fontSize: 13 }}>
          Calculating routes…
        </div>
      )}
      {!isLoading && optionsData?.options && optionsData.options.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
          {optionsData.options.map(opt => {
            const isHeld = opt.id === optionsData.held_option_id
            const isSelected = opt.id === selectedOptionId
            return (
              <div
                key={opt.id}
                onClick={() => setSelectedOptionId(opt.id)}
                style={{
                  background: 'var(--surface)', borderRadius: 8,
                  border: isSelected ? '2px solid var(--ink)' : '1px solid var(--rule)',
                  padding: 20, cursor: 'pointer', transition: 'border-color 0.1s',
                  position: 'relative',
                }}
              >
                {/* Rank + hold badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ ...S.badge(opt.rank === 1 ? 'green' : 'orange'), fontSize: 11 }}>
                    #{opt.rank} {opt.rank === 1 ? '· Recommended' : ''}
                  </span>
                  {isHeld && (
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>
                      Units held
                    </span>
                  )}
                </div>

                {/* Facility name */}
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                  {opt.facility_name}
                </div>
                <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', marginBottom: 16 }}>
                  {opt.facility_id}
                </div>

                {/* ETA — the most important number */}
                <div style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '14px 0', marginBottom: 16 }}>
                  <span style={{ ...S.label, marginBottom: 2 }}>Estimated Arrival</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 32, fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--ink)', lineHeight: 1 }}>
                      {formatEta(opt.eta.mid_min)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>
                      {formatEta(opt.eta.low_min)}–{formatEta(opt.eta.high_min)} range
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>
                    91.1% of real trips land inside this window
                  </div>
                </div>

                {/* Key facts */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12, marginBottom: 12 }}>
                  <div>
                    <span style={{ color: 'var(--ink-faint)' }}>Units available</span>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{opt.units_available}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-faint)' }}>Blood groups</span>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>
                      {Array.from(new Set(opt.blood_groups)).join(', ')}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-faint)' }}>Cost score</span>
                    <div style={{ fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{(opt as any).cost_score?.toFixed(3) ?? '—'}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-faint)' }}>ETA source</span>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{opt.method === 'model' ? 'ML model' : 'Route table'}</div>
                  </div>
                </div>

                {/* Reason */}
                {opt.reason && (
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
                    {opt.reason}
                  </div>
                )}

                {/* Warnings */}
                {opt.warnings && opt.warnings.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {opt.warnings.map((w: string) => (
                      <div key={w} style={{ fontSize: 11, color: 'var(--warn)', marginBottom: 2 }}>⚠ {w}</div>
                    ))}
                  </div>
                )}

                {/* Selection indicator */}
                <div style={{ position: 'absolute', top: 20, right: 20, width: 16, height: 16, borderRadius: '50%', border: '2px solid', borderColor: isSelected ? 'var(--ink)' : 'var(--rule)', background: isSelected ? 'var(--ink)' : 'transparent' }} />
              </div>
            )
          })}
        </div>
      )}
      {!isLoading && optionsData && optionsData.options.length === 0 && (
        <div style={{ ...S.card, textAlign: 'center', padding: 48, color: 'var(--ink-faint)', fontSize: 13 }}>
          No compatible stock available. Request requires manual coordination.
        </div>
      )}

      {/* Decision bar */}
      {optionsData?.options && optionsData.options.length > 0 && (
        <div style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={S.h3}>Your decision</div>
            <div style={{ ...S.muted, fontSize: 12, marginTop: 4 }}>
              Accepting sends to supplying lab or MoH for authorisation. Reason is logged to the immutable audit trail.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => { setModalMode('reject'); setDecisionReason('') }} style={btn('danger')}>
              Reject
            </button>
            <button onClick={() => { setModalMode('change'); setDecisionReason('') }} style={btn('secondary')}>
              Change &amp; Accept
            </button>
            <button disabled={isSubmitting} onClick={handleAccept} style={btn('primary', isSubmitting)}>
              {isSubmitting ? 'Submitting…' : 'Accept — Dispatch'}
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 32, maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ ...S.h3, marginBottom: 12 }}>
              {modalMode === 'change' ? 'Override & transfer hold' : 'Reject request'}
            </h3>
            <p style={{ ...S.muted, marginBottom: 20 }}>
              {modalMode === 'change'
                ? `Units will be atomically moved from option ${optionsData?.held_option_id} to option ${selectedOptionId}.`
                : 'All held units will be released. The case escalates to manual coordination.'}
            </p>
            <label style={S.label}>Mandatory clinical justification</label>
            <textarea
              value={decisionReason}
              onChange={e => setDecisionReason(e.target.value)}
              rows={3}
              placeholder={modalMode === 'change'
                ? 'e.g. Rank 1 courier unavailable; motorbike from Rank 2 is faster on this route.'
                : 'e.g. Patient transferred to referral centre; request cancelled.'}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 6,
                border: '1px solid var(--rule)', fontFamily: 'var(--sans)', marginBottom: 8,
                resize: 'vertical', color: 'var(--ink)',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 20 }}>
              Minimum 3 characters. This is committed to the immutable audit log.
            </div>
            {error && <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalMode(null)} style={{ ...btn('secondary'), flex: 1 }}>Cancel</button>
              <button disabled={isSubmitting || decisionReason.trim().length < 3} onClick={handleConfirmModal} style={{ ...btn(modalMode === 'reject' ? 'danger' : 'primary', isSubmitting || decisionReason.trim().length < 3), flex: 1 }}>
                {isSubmitting ? 'Recording…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
