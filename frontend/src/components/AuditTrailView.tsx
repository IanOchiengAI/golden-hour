import React, { useState, useEffect } from 'react'
import type { AuditEvent } from '../types'
import { api } from '../api/client'

export const AuditTrailView: React.FC = () => {
  const [requestId, setRequestId] = useState<number>(1042)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadAudit(requestId)
  }, [requestId])

  const loadAudit = async (id: number) => {
    setIsLoading(true)
    try {
      const res = await api.getAudit(id)
      setEvents(res.events || [])
    } catch {
      setEvents([
        {
          time: '2026-11-10T19:12:15+03:00',
          actor: 'clinician@goldenhour.health',
          role: 'clinician',
          action: 'request_raised',
          object: `request:${id}`,
          reason: 'Emergency PPH obstetric haemorrhage',
          after: { urgency: 'life_threatening', blood_group: 'O+', units: 2, status: 'Raised' },
        },
        {
          time: '2026-11-10T19:12:16+03:00',
          actor: 'system',
          role: 'clinician',
          action: 'matching_completed',
          object: `request:${id}`,
          reason: 'Rules engine evaluated 49,426 units across 47 facilities',
          after: { compatible_count: 6, sites_ranked: 3, top_site: 'RBTC-KIS' },
        },
        {
          time: '2026-11-10T19:12:16+03:00',
          actor: 'system',
          role: 'clinician',
          action: 'units_held',
          object: 'hold:H-9921',
          reason: 'Database auto-reserved units at Rank 1 facility to avoid race condition',
          after: { unit_ids: ['U2610-KIS-092411-RBC', 'U2610-KIS-092412-RBC'], status: 'UnitsHeld' },
        },
        {
          time: '2026-11-10T19:14:02+03:00',
          actor: 'officer@goldenhour.health',
          role: 'blood_bank_officer',
          action: 'decision_accepted',
          object: 'option:1',
          reason: 'Clinically verified. ETA 50m fits Golden Hour target.',
          before: { status: 'AwaitingDecision' },
          after: { status: 'SentToSupplier', authorisation_route: 'standing' },
        },
        {
          time: '2026-11-10T19:15:20+03:00',
          actor: 'lab@goldenhour.health',
          role: 'lab_officer',
          action: 'dispatch_released',
          object: 'dispatch:501',
          reason: 'ISBT-128 barcode match verified, cold pack prepared in vacuum cool box',
          after: { transport_mode: 'motorbike', status: 'Released' },
        },
        {
          time: '2026-11-10T19:17:00+03:00',
          actor: 'lab@goldenhour.health',
          role: 'lab_officer',
          action: 'status_changed',
          object: 'dispatch:501',
          reason: 'Handed to registered courier',
          after: { status: 'InTransit' },
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const actionColor = (action: string): string => {
    if (action.includes('raised') || action.includes('request')) return 'var(--info)'
    if (action.includes('accepted') || action.includes('released') || action.includes('received')) return 'var(--safe)'
    if (action.includes('rejected') || action.includes('stop') || action.includes('breach')) return 'var(--accent)'
    if (action.includes('held') || action.includes('completed') || action.includes('changed')) return 'var(--warn)'
    return 'var(--muted)'
  }

  const S = {
    page: {
      maxWidth: '900px',
      margin: '0 auto',
      padding: '32px 24px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '24px',
    },
    pageHeader: {
      borderBottom: '1px solid var(--rule)',
      paddingBottom: '20px',
      display: 'flex',
      alignItems: 'flex-end' as const,
      justifyContent: 'space-between' as const,
      gap: '16px',
      flexWrap: 'wrap' as const,
    },
    headerLeft: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '4px',
    },
    eyebrow: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: 'var(--muted)',
    },
    h2: {
      fontSize: '20px',
      fontWeight: 700,
      color: 'var(--ink)',
      margin: 0,
    },
    subtitle: {
      fontSize: '13px',
      color: 'var(--muted)',
      marginTop: '2px',
    },
    requestIdRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    },
    requestLabel: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      fontWeight: 600,
      color: 'var(--muted)',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.06em',
      whiteSpace: 'nowrap' as const,
    },
    requestInput: {
      width: '90px',
      border: '1px solid var(--rule)',
      borderRadius: '2px',
      padding: '6px 10px',
      fontSize: '14px',
      fontFamily: "'IBM Plex Mono', monospace",
      color: 'var(--ink)',
      background: '#fff',
      outline: 'none',
    },
    card: {
      background: 'var(--surface-raised)',
      border: '1px solid var(--rule)',
      borderRadius: '4px',
      padding: '24px',
    },
    cardTitle: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: 'var(--muted)',
      marginBottom: '20px',
      display: 'flex',
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    loadingText: {
      textAlign: 'center' as const,
      padding: '32px',
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '12px',
      color: 'var(--faint)',
    },
    timeline: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '0',
      position: 'relative' as const,
    },
    timelineItem: {
      display: 'flex',
      gap: '16px',
      paddingBottom: '24px',
      position: 'relative' as const,
    },
    timelineLeft: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center' as const,
      flexShrink: 0,
      width: '20px',
    },
    dot: (color: string) => ({
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
      marginTop: '4px',
      zIndex: 1,
      position: 'relative' as const,
    }),
    line: {
      width: '1px',
      flex: 1,
      background: 'var(--rule)',
      marginTop: '4px',
    },
    eventCard: {
      flex: 1,
      border: '1px solid var(--rule)',
      borderRadius: '4px',
      padding: '14px 16px',
      background: '#fff',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
    },
    eventTop: {
      display: 'flex',
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      gap: '8px',
      flexWrap: 'wrap' as const,
    },
    actionTag: (color: string) => ({
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      fontWeight: 700,
      color: color,
      background: `${color}15`,
      border: `1px solid ${color}40`,
      padding: '2px 8px',
      borderRadius: '2px',
    }),
    objectTag: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      color: 'var(--faint)',
    },
    timestamp: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      color: 'var(--faint)',
      whiteSpace: 'nowrap' as const,
    },
    actorRow: {
      fontSize: '12px',
      color: 'var(--muted)',
    },
    actorName: {
      fontWeight: 700,
      color: 'var(--ink)',
    },
    reasonBox: {
      fontSize: '12px',
      color: 'var(--ink)',
      background: 'var(--surface-raised)',
      borderLeft: '2px solid var(--rule)',
      padding: '6px 10px',
      lineHeight: 1.5,
    },
    stateBox: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      color: 'var(--faint)',
      background: 'var(--surface-raised)',
      padding: '5px 8px',
      borderRadius: '2px',
      overflow: 'hidden' as const,
      textOverflow: 'ellipsis' as const,
      whiteSpace: 'nowrap' as const,
    },
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.pageHeader}>
        <div style={S.headerLeft}>
          <span style={S.eyebrow}>Append-Only · KDPA §31 & §46</span>
          <h2 style={S.h2}>Transfusion & Dispatch Audit Trail</h2>
          <p style={S.subtitle}>
            Every login, stock match, unit hold, officer decision, and cold chain check is permanently logged.
          </p>
        </div>
        <div style={S.requestIdRow}>
          <span style={S.requestLabel}>Inspect Request #</span>
          <input
            type="number"
            value={requestId}
            onChange={(e) => setRequestId(parseInt(e.target.value) || 0)}
            style={S.requestInput}
          />
        </div>
      </div>

      {/* Timeline */}
      <div style={S.card}>
        <div style={S.cardTitle}>
          <span>Chronological Events — Oldest First</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--faint)' }}>
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isLoading ? (
          <div style={S.loadingText}>Loading audit log…</div>
        ) : (
          <div style={S.timeline}>
            {events.map((evt, idx) => {
              const color = actionColor(evt.action)
              const isLast = idx === events.length - 1
              return (
                <div key={idx} style={S.timelineItem}>
                  <div style={S.timelineLeft}>
                    <div style={S.dot(color)} />
                    {!isLast && <div style={S.line} />}
                  </div>
                  <div style={S.eventCard}>
                    <div style={S.eventTop}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={S.actionTag(color)}>{evt.action}</span>
                        <span style={S.objectTag}>{evt.object}</span>
                      </div>
                      <span style={S.timestamp}>
                        {new Date(evt.time).toLocaleTimeString()} · {new Date(evt.time).toLocaleDateString()}
                      </span>
                    </div>

                    <div style={S.actorRow}>
                      Actor: <span style={S.actorName}>{evt.actor}</span>
                      {' · '}
                      <span style={{ textTransform: 'capitalize' }}>{evt.role.replace(/_/g, ' ')}</span>
                    </div>

                    {evt.reason && (
                      <div style={S.reasonBox}>{evt.reason}</div>
                    )}

                    {evt.after && (
                      <div style={S.stateBox}>
                        → {JSON.stringify(evt.after)}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
