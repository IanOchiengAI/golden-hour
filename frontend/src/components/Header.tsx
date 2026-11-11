import React from 'react'
import { useAuth } from '../context/AuthContext'

const TABS = [
  { id: 'clinician', label: 'Request Blood' },
  { id: 'officer', label: 'Officer Copilot' },
  { id: 'moh', label: 'MoH Authorise' },
  { id: 'lab', label: 'Lab Dispatch' },
  { id: 'audit', label: 'Audit Trail' },
  { id: 'readiness', label: 'Stock Readiness' },
]

const ROLES = [
  { key: 'clinician' as const, label: 'Clinician' },
  { key: 'officer' as const, label: 'Officer' },
  { key: 'moh' as const, label: 'MoH' },
  { key: 'lab' as const, label: 'Lab' },
]

export const Header: React.FC<{ activeTab: string; setActiveTab: (tab: string) => void }> = ({
  activeTab,
  setActiveTab,
}) => {
  const { user, loginAs, isOnline, apiConnected } = useAuth()

  const handleRoleSwitch = async (roleKey: 'clinician' | 'officer' | 'moh' | 'lab') => {
    try { await loginAs(roleKey) } catch { /* handled */ }
    setActiveTab(roleKey)
  }

  return (
    <header style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--rule)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      {/* Top bar */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
      }}>
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            Golden<span style={{ color: 'var(--accent)' }}>Hour</span>
          </span>
          <span style={{
            fontSize: 11,
            fontFamily: 'var(--mono)',
            color: 'var(--ink-faint)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            Dispatch Copilot
          </span>
        </div>

        {/* Centre: role switcher for demo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--ink-faint)', marginRight: 4 }}>Role:</span>
          {ROLES.map(r => (
            <button
              key={r.key}
              onClick={() => handleRoleSwitch(r.key)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                border: '1px solid',
                cursor: 'pointer',
                transition: 'all 0.1s',
                background: user?.role === r.key || (user?.role === 'blood_bank_officer' && r.key === 'officer') || (user?.role === 'moh_officer' && r.key === 'moh') || (user?.role === 'lab_officer' && r.key === 'lab')
                  ? 'var(--ink)' : 'transparent',
                color: user?.role === r.key || (user?.role === 'blood_bank_officer' && r.key === 'officer') || (user?.role === 'moh_officer' && r.key === 'moh') || (user?.role === 'lab_officer' && r.key === 'lab')
                  ? '#fff' : 'var(--ink-muted)',
                borderColor: user?.role === r.key || (user?.role === 'blood_bank_officer' && r.key === 'officer') || (user?.role === 'moh_officer' && r.key === 'moh') || (user?.role === 'lab_officer' && r.key === 'lab')
                  ? 'var(--ink)' : 'var(--rule)',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Right: status indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-muted)' }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: !isOnline ? '#D97706' : apiConnected ? 'var(--safe)' : '#D97706',
              display: 'inline-block',
              flexShrink: 0,
            }} />
            {!isOnline ? 'Offline' : apiConnected ? 'Connected' : 'API unreachable'}
          </div>
          {user && (
            <span style={{ fontSize: 12, color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>
              {user.facility_id || 'National'}
            </span>
          )}
        </div>
      </div>

      {/* Nav tabs */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 24px',
        display: 'flex',
        gap: 0,
        borderTop: '1px solid var(--rule)',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--ink)' : 'var(--ink-muted)',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.1s',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  )
}
