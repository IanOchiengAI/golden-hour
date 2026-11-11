import React, { useState } from 'react'
import type { Dispatch } from '../types'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

export const LabDispatchView: React.FC = () => {
  const { user, loginWithFacility } = useAuth()
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [_isLoading, setIsLoading] = useState(false)
  const [selectedStation, setSelectedStation] = useState<string>(user?.facility_id || 'RBTC-NBO')

  // Top supplying facilities
  const stations = [
    { id: 'RBTC-NBO', name: 'National Blood Centre (Nairobi)' },
    { id: 'HSP-001', name: 'National Referral Hospital (HSP-001)' },
    { id: 'RBTC-KIS', name: 'Kisumu Regional Blood Centre' },
    { id: 'RBTC-ELD', name: 'Eldoret Regional Blood Centre' },
    { id: 'RBTC-MBS', name: 'Mombasa Regional Blood Centre' },
    { id: 'RBTC-NKR', name: 'Nakuru Regional Blood Centre' },
  ]

  // Load real dispatches from backend on mount or station change
  React.useEffect(() => {
    loadDispatches()
  }, [user?.facility_id])

  const handleStationSwitch = async (siteId: string) => {
    setSelectedStation(siteId)
    try {
      await loginWithFacility(siteId)
    } catch {
      // station switch error handled via state
    }
  }

  const loadDispatches = async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      const res = await api.getDispatches({ status: 'AwaitingRelease,Released,InTransit' })
      const list = Array.isArray(res) ? res : res.results || []
      setDispatches(list)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(`Failed to load dispatches: ${msg}`)
      setDispatches([])
    } finally {
      setIsLoading(false)
    }
  }

  const [transportMode, setTransportMode] = useState<'vehicle' | 'motorbike' | 'public_service_vehicle'>('motorbike')
  const [declineReason, setDeclineReason] = useState<string>('')
  const [modalDeclineId, setModalDeclineId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleConfirmRelease = async (dispatchId: number) => {
    setIsSubmitting(true)
    setFeedbackMsg(null)
    setErrorMsg(null)
    try {
      await api.releaseDispatch(dispatchId, 'confirm', transportMode)
      setFeedbackMsg(`Dispatch #${dispatchId} confirmed. Transport: ${transportMode.toUpperCase()}.`)
      setDispatches((prev) =>
        prev.map((d) => (d.id === dispatchId ? { ...d, status: 'Released', transport_mode: transportMode } : d))
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(`Release refused: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMarkInTransit = async (dispatchId: number) => {
    setIsSubmitting(true)
    setFeedbackMsg(null)
    setErrorMsg(null)
    try {
      await api.updateDispatchStatus(dispatchId, 'in_transit')
      setFeedbackMsg(`Dispatch #${dispatchId} is now IN TRANSIT.`)
      setDispatches((prev) => (prev.map((d) => (d.id === dispatchId ? { ...d, status: 'InTransit' } : d))))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(`Status update refused: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDecline = async (dispatchId: number) => {
    if (!declineReason.trim()) return
    setIsSubmitting(true)
    setFeedbackMsg(null)
    setErrorMsg(null)
    try {
      await api.releaseDispatch(dispatchId, 'decline', undefined, declineReason)
      setFeedbackMsg(`Dispatch #${dispatchId} declined. Hold released; next-ranked facility alerted.`)
      setDispatches((prev) => prev.filter((d) => d.id !== dispatchId))
      setModalDeclineId(null)
      setDeclineReason('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(`Decline refused: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const statusColor = (status: string): React.CSSProperties => {
    if (status === 'InTransit') return { color: 'var(--info)', background: '#EFF6FF', border: '1px solid #BFDBFE' }
    if (status === 'Released') return { color: 'var(--safe)', background: '#F0FDF4', border: '1px solid #BBF7D0' }
    if (status === 'AwaitingRelease') return { color: 'var(--warn)', background: '#FFFBEB', border: '1px solid #FDE68A' }
    return { color: 'var(--muted)', background: 'var(--surface-raised)', border: '1px solid var(--rule)' }
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
    stationRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    },
    stationLabel: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      fontWeight: 600,
      color: 'var(--muted)',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.06em',
      whiteSpace: 'nowrap' as const,
    },
    stationSelect: {
      border: '1px solid var(--rule)',
      borderRadius: '2px',
      padding: '6px 10px',
      fontSize: '12px',
      fontFamily: "'IBM Plex Mono', monospace",
      color: 'var(--ink)',
      background: '#fff',
      outline: 'none',
      cursor: 'pointer',
    },
    kdpaBadge: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      border: '1px solid var(--rule)',
      borderRadius: '4px',
      background: 'var(--surface-raised)',
    },
    kdpaText: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '1px',
    },
    kdpaTitle: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '10px',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: 'var(--safe)',
    },
    kdpaSubtitle: {
      fontSize: '11px',
      color: 'var(--muted)',
    },
    notice: (type: 'success' | 'error') => ({
      padding: '12px 16px',
      borderLeft: `3px solid ${type === 'success' ? 'var(--safe)' : 'var(--accent)'}`,
      background: type === 'success' ? '#F0FDF4' : '#FFF5F5',
      color: type === 'success' ? 'var(--safe)' : 'var(--accent)',
      fontSize: '13px',
      borderRadius: '2px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }),
    noticeDismiss: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: '16px',
      color: 'inherit',
      opacity: 0.6,
    },
    sectionTitle: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: 'var(--muted)',
      marginBottom: '12px',
    },
    emptyState: {
      border: '1px solid var(--rule)',
      borderRadius: '4px',
      padding: '48px',
      textAlign: 'center' as const,
      color: 'var(--faint)',
      fontSize: '13px',
    },
    dispatchCard: {
      border: '1px solid var(--rule)',
      borderRadius: '4px',
      background: '#fff',
      marginBottom: '16px',
      overflow: 'hidden' as const,
    },
    cardTop: {
      display: 'flex',
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      padding: '14px 20px',
      borderBottom: '1px solid var(--rule)',
      background: 'var(--surface-raised)',
    },
    dispatchId: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '13px',
      fontWeight: 700,
      color: 'var(--ink)',
    },
    requestRef: {
      fontSize: '12px',
      color: 'var(--muted)',
      marginLeft: '12px',
    },
    statusBadge: (status: string) => ({
      ...statusColor(status),
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      fontWeight: 700,
      padding: '3px 8px',
      borderRadius: '2px',
    }),
    urgencyBadge: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      fontWeight: 700,
      color: 'var(--accent)',
      background: '#FFF5F5',
      border: '1px solid #FCA5A5',
      padding: '3px 8px',
      borderRadius: '2px',
      marginRight: '8px',
    },
    cardBody: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: '0',
    },
    infoCell: {
      padding: '16px 20px',
      borderRight: '1px solid var(--rule)',
    },
    infoCellLast: {
      padding: '16px 20px',
    },
    cellLabel: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '10px',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: 'var(--faint)',
      marginBottom: '8px',
    },
    cellField: {
      marginBottom: '8px',
    },
    fieldLabel: {
      fontSize: '11px',
      color: 'var(--muted)',
      display: 'block',
      marginBottom: '1px',
    },
    fieldValue: {
      fontSize: '13px',
      fontWeight: 600,
      color: 'var(--ink)',
    },
    componentBadge: {
      fontSize: '13px',
      fontWeight: 700,
      color: 'var(--accent)',
    },
    unitId: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      color: 'var(--ink)',
      background: 'var(--surface-raised)',
      border: '1px solid var(--rule)',
      padding: '3px 7px',
      borderRadius: '2px',
      display: 'block',
      marginBottom: '4px',
    },
    cardFoot: {
      display: 'flex',
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      padding: '14px 20px',
      borderTop: '1px solid var(--rule)',
      gap: '16px',
      flexWrap: 'wrap' as const,
    },
    transportRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    },
    transportLabel: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      fontWeight: 600,
      color: 'var(--muted)',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.06em',
    },
    transportSelect: {
      border: '1px solid var(--rule)',
      borderRadius: '2px',
      padding: '6px 10px',
      fontSize: '12px',
      color: 'var(--ink)',
      background: '#fff',
      outline: 'none',
      cursor: 'pointer',
    },
    actionRow: {
      display: 'flex',
      gap: '10px',
      alignItems: 'center',
    },
    inTransitStatus: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '12px',
      fontWeight: 700,
      color: 'var(--info)',
    },
    // Modal
    overlay: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(17,17,17,0.5)',
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    },
    modal: {
      background: '#fff',
      border: '1px solid var(--rule)',
      borderRadius: '4px',
      maxWidth: '460px',
      width: '100%',
      padding: '28px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
    },
    modalTitle: {
      fontSize: '16px',
      fontWeight: 700,
      color: 'var(--ink)',
    },
    modalBody: {
      fontSize: '13px',
      color: 'var(--muted)',
      lineHeight: 1.5,
    },
    textareaLabel: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: 'var(--muted)',
      display: 'block',
      marginBottom: '6px',
    },
    textarea: {
      width: '100%',
      border: '1px solid var(--rule)',
      borderRadius: '2px',
      padding: '8px 12px',
      fontSize: '13px',
      color: 'var(--ink)',
      background: '#fff',
      resize: 'vertical' as const,
      minHeight: '72px',
      boxSizing: 'border-box' as const,
      outline: 'none',
      fontFamily: 'inherit',
    },
    modalButtons: {
      display: 'flex',
      gap: '12px',
      justifyContent: 'flex-end' as const,
    },
  }

  const btn = (variant: 'primary' | 'danger' | 'secondary' | 'outline-danger'): React.CSSProperties => ({
    border: 'none',
    borderRadius: '2px',
    padding: '9px 16px',
    fontSize: '12px',
    fontWeight: 700,
    cursor: isSubmitting ? 'not-allowed' : 'pointer',
    opacity: isSubmitting ? 0.6 : 1,
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '0.03em',
    ...(variant === 'primary' ? { background: 'var(--safe)', color: '#fff' } : {}),
    ...(variant === 'danger' ? { background: 'var(--accent)', color: '#fff' } : {}),
    ...(variant === 'secondary' ? { background: 'var(--surface-raised)', color: 'var(--muted)', border: '1px solid var(--rule)' } : {}),
    ...(variant === 'outline-danger' ? { background: '#FFF5F5', color: 'var(--accent)', border: '1px solid #FCA5A5' } : {}),
  })

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.pageHeader}>
        <div style={S.headerLeft}>
          <span style={S.eyebrow}>Supplying Blood Bank · Order Fulfillment</span>
          <h2 style={S.h2}>Cold Chain Dispatch</h2>
          <p style={S.subtitle}>Physical packaging, ISBT-128 barcode verification, and courier handoff.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
          <div style={S.stationRow}>
            <span style={S.stationLabel}>Station</span>
            <select
              value={selectedStation}
              onChange={(e) => handleStationSwitch(e.target.value)}
              style={S.stationSelect}
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.name}
                </option>
              ))}
            </select>
          </div>
          <div style={S.kdpaBadge}>
            <div style={S.kdpaText}>
              <span style={S.kdpaTitle}>✓ KDPA Compliant</span>
              <span style={S.kdpaSubtitle}>Supplier-safe view · patient details masked</span>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback */}
      {feedbackMsg && (
        <div style={S.notice('success')}>
          <span>{feedbackMsg}</span>
          <button onClick={() => setFeedbackMsg(null)} style={S.noticeDismiss}>×</button>
        </div>
      )}
      {errorMsg && (
        <div style={S.notice('error')}>
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} style={S.noticeDismiss}>×</button>
        </div>
      )}

      {/* Dispatches */}
      <div>
        <div style={S.sectionTitle}>Pending Blood Unit Releases</div>

        {dispatches.length === 0 ? (
          <div style={S.emptyState}>
            No active dispatch orders awaiting release at this station.
          </div>
        ) : (
          dispatches.map((d) => (
            <div key={d.id} style={S.dispatchCard}>
              {/* Card top bar */}
              <div style={S.cardTop}>
                <div>
                  <span style={S.dispatchId}>Dispatch #{d.id}</span>
                  <span style={S.requestRef}>For Emergency Request #{d.request_id}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={S.urgencyBadge}>{d.urgency.replace('_', ' ').toUpperCase()}</span>
                  <span style={S.statusBadge(d.status)}>{d.status}</span>
                </div>
              </div>

              {/* Three info columns */}
              <div style={S.cardBody}>
                <div style={S.infoCell}>
                  <div style={S.cellLabel}>Route Logistics</div>
                  <div style={S.cellField}>
                    <span style={S.fieldLabel}>From (Your Lab)</span>
                    <span style={S.fieldValue}>{d.from_facility_name || d.from_facility_id}</span>
                  </div>
                  <div style={S.cellField}>
                    <span style={S.fieldLabel}>Destination</span>
                    <span style={S.fieldValue}>{d.to_facility_name || d.to_facility_id}</span>
                  </div>
                </div>

                <div style={S.infoCell}>
                  <div style={S.cellLabel}>Blood Units Required</div>
                  <div style={S.cellField}>
                    <span style={S.fieldLabel}>Component</span>
                    <span style={S.componentBadge}>{d.component} ({d.units_requested} unit{d.units_requested !== 1 ? 's' : ''})</span>
                  </div>
                  <div style={S.cellField}>
                    <span style={S.fieldLabel}>Blood Groups</span>
                    <span style={S.fieldValue}>{d.blood_groups.join(', ')}</span>
                  </div>
                </div>

                <div style={S.infoCellLast}>
                  <div style={S.cellLabel}>ISBT-128 Barcodes to Retrieve</div>
                  {d.unit_ids.map((uid) => (
                    <span key={uid} style={S.unitId}>{uid}</span>
                  ))}
                </div>
              </div>

              {/* Footer: transport + actions */}
              <div style={S.cardFoot}>
                <div style={S.transportRow}>
                  <span style={S.transportLabel}>Transport</span>
                  <select
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value as typeof transportMode)}
                    style={S.transportSelect}
                  >
                    <option value="motorbike">Motorbike Courier (Fastest)</option>
                    <option value="vehicle">Dedicated Ambulance / Vehicle</option>
                    <option value="public_service_vehicle">Regional Courier / PSV</option>
                  </select>
                </div>

                <div style={S.actionRow}>
                  {d.status === 'AwaitingRelease' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setModalDeclineId(d.id)}
                        style={btn('outline-danger')}
                      >
                        Decline Order
                      </button>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleConfirmRelease(d.id)}
                        style={btn('primary')}
                      >
                        ✓ Confirm & Release
                      </button>
                    </>
                  )}

                  {d.status === 'Released' && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleMarkInTransit(d.id)}
                      style={btn('primary')}
                    >
                      → Mark In Transit
                    </button>
                  )}

                  {d.status === 'InTransit' && (
                    <span style={S.inTransitStatus}>↑ Blood En Route</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Decline Modal */}
      {modalDeclineId && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={S.modalTitle}>Decline Dispatch Order #{modalDeclineId}</div>
            <p style={S.modalBody}>
              Provide an operational reason for declining. The system will release the held units
              and offer the next ranked facility to the blood bank officer.
            </p>

            <div>
              <label style={S.textareaLabel}>Decline Reason</label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                placeholder="e.g., Cold storage breach detected during physical verification, or courier transport unavailable."
                style={S.textarea}
              />
            </div>

            <div style={S.modalButtons}>
              <button
                type="button"
                onClick={() => setModalDeclineId(null)}
                style={{ ...btn('secondary'), cursor: 'pointer', opacity: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || !declineReason.trim()}
                onClick={() => handleDecline(modalDeclineId)}
                style={{ ...btn('danger'), opacity: (isSubmitting || !declineReason.trim()) ? 0.5 : 1 }}
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
