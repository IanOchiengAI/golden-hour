import React, { useState } from 'react'
import { api } from '../api/client'

export const MohAuthoriseView: React.FC = () => {
  const [requestId, setRequestId] = useState<number>(1042)
  const [reason, setReason] = useState<string>('Within regional emergency protocol for acute trauma')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleAction = async (action: 'approve' | 'reject' | 'stop' | 'review') => {
    setIsSubmitting(true)
    setMsg(null)
    try {
      await api.submitAuthorisation(requestId, action, reason)
      setMsg({
        type: 'success',
        text: `MoH Action '${action.toUpperCase()}' recorded in national blood system audit log.`,
      })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setMsg({
        type: 'error',
        text: `Authorisation refused: ${errMsg}`,
      })
    } finally {
      setIsSubmitting(false)
    }
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
    configBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      marginTop: '10px',
      padding: '6px 12px',
      border: '1px solid var(--rule)',
      borderRadius: '4px',
      background: 'var(--surface-raised)',
    },
    configLabel: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '10px',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: 'var(--faint)',
    },
    configValue: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '12px',
      fontWeight: 700,
      color: 'var(--info)',
    },
    notice: (type: 'success' | 'error') => ({
      padding: '12px 16px',
      borderLeft: `3px solid ${type === 'success' ? 'var(--safe)' : 'var(--accent)'}`,
      background: type === 'success' ? '#F0FDF4' : '#FFF5F5',
      color: type === 'success' ? 'var(--safe)' : 'var(--accent)',
      fontSize: '13px',
      borderRadius: '2px',
    }),
    grid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '24px',
    },
    card: {
      background: 'var(--surface-raised)',
      border: '1px solid var(--rule)',
      borderRadius: '4px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
    },
    cardTitle: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: 'var(--muted)',
      marginBottom: '4px',
    },
    label: {
      display: 'block',
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '10px',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: 'var(--muted)',
      marginBottom: '6px',
    },
    input: {
      width: '100%',
      border: '1px solid var(--rule)',
      borderRadius: '2px',
      padding: '8px 12px',
      fontSize: '14px',
      fontFamily: "'IBM Plex Mono', monospace",
      color: 'var(--ink)',
      background: '#fff',
      boxSizing: 'border-box' as const,
      outline: 'none',
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
    btnGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '10px',
    },
    policyItem: (color: string) => ({
      padding: '12px 14px',
      borderLeft: `3px solid ${color}`,
      background: 'var(--surface-raised)',
      borderRadius: '2px',
    }),
    policyTitle: (color: string) => ({
      fontSize: '12px',
      fontWeight: 700,
      color: color,
      display: 'block',
      marginBottom: '4px',
    }),
    policyText: {
      fontSize: '12px',
      color: 'var(--muted)',
      lineHeight: 1.5,
    },
  }

  const btn = (variant: 'approve' | 'reject' | 'stop' | 'secondary'): React.CSSProperties => {
    const base: React.CSSProperties = {
      border: 'none',
      borderRadius: '2px',
      padding: '10px 14px',
      fontSize: '12px',
      fontWeight: 700,
      cursor: isSubmitting ? 'not-allowed' : 'pointer',
      opacity: isSubmitting ? 0.6 : 1,
      fontFamily: "'IBM Plex Mono', monospace",
      letterSpacing: '0.03em',
    }
    switch (variant) {
      case 'approve': return { ...base, background: 'var(--safe)', color: '#fff' }
      case 'reject': return { ...base, background: 'var(--accent)', color: '#fff' }
      case 'stop': return { ...base, background: 'var(--warn)', color: '#fff' }
      case 'secondary': return { ...base, background: 'var(--surface-raised)', color: 'var(--muted)', border: '1px solid var(--rule)' }
    }
  }

  return (
    <div style={S.page}>
      {/* Page Header */}
      <div style={S.pageHeader}>
        <span style={S.eyebrow}>Ministry of Health · National Authority</span>
        <h2 style={S.h2}>Inter-Facility Blood Movement Authorisation</h2>
        <p style={S.subtitle}>
          Tiered governance: Standing emergency waiver for life-threatening cases; MoH sign-off for urgent/routine.
        </p>
        <div style={S.configBadge}>
          <span style={S.configLabel}>Active Config (kenya.yaml)</span>
          <span style={S.configValue}>emergency_authorisation: standing</span>
        </div>
      </div>

      {/* Feedback notice */}
      {msg && (
        <div style={S.notice(msg.type)}>{msg.text}</div>
      )}

      {/* Two-column layout */}
      <div style={S.grid}>
        {/* Action Panel */}
        <div style={S.card}>
          <div style={S.cardTitle}>Authorise or Stop Transfer</div>

          <div>
            <label style={S.label}>Target Request ID</label>
            <input
              type="number"
              value={requestId}
              onChange={(e) => setRequestId(parseInt(e.target.value) || 0)}
              style={S.input}
            />
          </div>

          <div>
            <label style={S.label}>Authorisation Note / Regulatory Justification</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              style={S.textarea}
            />
          </div>

          <div style={S.btnGrid}>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleAction('approve')}
              style={btn('approve')}
            >
              ✓ Approve Dispatch
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleAction('reject')}
              style={btn('reject')}
            >
              ✕ Reject & Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleAction('stop')}
              style={btn('stop')}
            >
              ⬛ Emergency Stop
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleAction('review')}
              style={btn('secondary')}
            >
              ↗ Audit Review
            </button>
          </div>
        </div>

        {/* Policy Reference */}
        <div style={S.card}>
          <div style={S.cardTitle}>Kenya National Blood Policy Rules</div>

          <div style={S.policyItem('var(--safe)')}>
            <strong style={S.policyTitle('var(--safe)')}>Tier 1 — Life-Threatening (Standing Authorization)</strong>
            <span style={S.policyText}>
              To ensure transfusion within the physiological Golden Hour (&lt;60 min), red cell dispatches for
              trauma and post-partum haemorrhage proceed under standing MoH regional authorization without
              awaiting individual telephone sign-off.
            </span>
          </div>

          <div style={S.policyItem('var(--warn)')}>
            <strong style={S.policyTitle('var(--warn)')}>Tier 2 — Urgent Dispatches (&lt;180 min)</strong>
            <span style={S.policyText}>
              Requires active MoH or backup blood transfusion coordinator authorization. If unanswered
              within 5 minutes, escalated automatically.
            </span>
          </div>

          <div style={S.policyItem('var(--info)')}>
            <strong style={S.policyTitle('var(--info)')}>Regulatory Override Rights</strong>
            <span style={S.policyText}>
              The MoH authorising officer maintains veto authority to issue an "Emergency Stop" before
              blood physically departs the supplying facility.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
