import React, { useState } from 'react'

interface FacilityStock {
  id: string
  name: string
  county: string
  type: string
  gridReliability: 'High' | 'Moderate' | 'Unstable'
  backupPower: boolean
  oNegUnits: number
  oPosUnits: number
  totalUnits: number
  readinessStatus: 'green' | 'amber' | 'red'
}

export const ReadinessGridView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('')

  // Realistic sample of 47 regional facilities from the hackathon starter dataset
  const facilities: FacilityStock[] = [
    {
      id: 'RBTC-NBO',
      name: 'National Blood Transfusion Centre (Nairobi)',
      county: 'Nairobi',
      type: 'National Hub',
      gridReliability: 'High',
      backupPower: true,
      oNegUnits: 14,
      oPosUnits: 82,
      totalUnits: 310,
      readinessStatus: 'green',
    },
    {
      id: 'HSP-001',
      name: 'Kenyatta National Referral Hospital',
      county: 'Nairobi',
      type: 'Level 6 Hospital',
      gridReliability: 'High',
      backupPower: true,
      oNegUnits: 8,
      oPosUnits: 45,
      totalUnits: 180,
      readinessStatus: 'green',
    },
    {
      id: 'RBTC-KIS',
      name: 'Kisumu Regional Blood Centre',
      county: 'Kisumu',
      type: 'Regional Centre',
      gridReliability: 'Moderate',
      backupPower: true,
      oNegUnits: 4,
      oPosUnits: 38,
      totalUnits: 115,
      readinessStatus: 'green',
    },
    {
      id: 'HSP-002',
      name: 'Kakamega County Referral Hospital',
      county: 'Kakamega',
      type: 'Level 5 Hospital',
      gridReliability: 'Moderate',
      backupPower: true,
      oNegUnits: 1,
      oPosUnits: 12,
      totalUnits: 34,
      readinessStatus: 'amber',
    },
    {
      id: 'HSP-004',
      name: 'Kisii Teaching & Referral Hospital',
      county: 'Kisii',
      type: 'Level 5 Hospital',
      gridReliability: 'Unstable',
      backupPower: true,
      oNegUnits: 0,
      oPosUnits: 6,
      totalUnits: 18,
      readinessStatus: 'red',
    },
    {
      id: 'RBTC-MBS',
      name: 'Mombasa Regional Blood Centre',
      county: 'Mombasa',
      type: 'Regional Centre',
      gridReliability: 'Moderate',
      backupPower: true,
      oNegUnits: 5,
      oPosUnits: 29,
      totalUnits: 98,
      readinessStatus: 'green',
    },
    {
      id: 'HSP-012',
      name: 'Garissa Regional Hospital',
      county: 'Garissa',
      type: 'Level 5 Hospital',
      gridReliability: 'Unstable',
      backupPower: false,
      oNegUnits: 0,
      oPosUnits: 3,
      totalUnits: 9,
      readinessStatus: 'red',
    },
    {
      id: 'RBTC-ELD',
      name: 'Eldoret Regional Blood Transfusion Centre',
      county: 'Uasin Gishu',
      type: 'Regional Centre',
      gridReliability: 'High',
      backupPower: true,
      oNegUnits: 7,
      oPosUnits: 54,
      totalUnits: 165,
      readinessStatus: 'green',
    },
  ]

  const filtered = facilities.filter(
    (f) =>
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.county.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const readinessColor = (status: 'green' | 'amber' | 'red'): string => {
    if (status === 'green') return 'var(--safe)'
    if (status === 'amber') return 'var(--warn)'
    return 'var(--accent)'
  }

  const gridColor = (reliability: 'High' | 'Moderate' | 'Unstable'): string => {
    if (reliability === 'High') return 'var(--safe)'
    if (reliability === 'Moderate') return 'var(--warn)'
    return 'var(--accent)'
  }

  // Summary stats
  const totalONeg = facilities.reduce((sum, f) => sum + f.oNegUnits, 0)
  const depleted = facilities.filter((f) => f.oNegUnits === 0).length
  const unstableGrid = facilities.filter((f) => f.gridReliability === 'Unstable').length

  const S = {
    page: {
      maxWidth: '1100px',
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
    searchInput: {
      border: '1px solid var(--rule)',
      borderRadius: '2px',
      padding: '8px 12px',
      fontSize: '13px',
      color: 'var(--ink)',
      background: '#fff',
      outline: 'none',
      width: '220px',
    },
    // Summary strip
    summaryRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '16px',
    },
    summaryCard: (color: string) => ({
      border: '1px solid var(--rule)',
      borderTop: `3px solid ${color}`,
      borderRadius: '4px',
      padding: '16px 20px',
      background: 'var(--surface-raised)',
    }),
    summaryNum: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '28px',
      fontWeight: 700,
      color: 'var(--ink)',
      lineHeight: 1.1,
    },
    summaryLabel: {
      fontSize: '12px',
      color: 'var(--muted)',
      marginTop: '4px',
    },
    // Grid of facility cards
    facilityGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
      gap: '16px',
    },
    facilityCard: {
      border: '1px solid var(--rule)',
      borderRadius: '4px',
      background: '#fff',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
    },
    cardTop: {
      display: 'flex',
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
    },
    facilityId: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      fontWeight: 700,
      color: 'var(--muted)',
    },
    facilityName: {
      fontSize: '13px',
      fontWeight: 700,
      color: 'var(--ink)',
      lineHeight: 1.3,
      marginTop: '4px',
    },
    facilitySub: {
      fontSize: '11px',
      color: 'var(--muted)',
      marginTop: '2px',
    },
    statusDot: (status: 'green' | 'amber' | 'red') => ({
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: readinessColor(status),
      flexShrink: 0,
      marginTop: '2px',
    }),
    stockSection: {
      background: 'var(--surface-raised)',
      border: '1px solid var(--rule)',
      borderRadius: '2px',
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '5px',
    },
    stockRow: {
      display: 'flex',
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      fontSize: '12px',
    },
    stockLabel: {
      color: 'var(--muted)',
    },
    stockValue: (depleted: boolean): React.CSSProperties => ({
      fontFamily: "'IBM Plex Mono', monospace",
      fontWeight: 700,
      color: depleted ? 'var(--accent)' : 'var(--ink)',
    }),
    stockDivider: {
      borderTop: '1px solid var(--rule)',
      paddingTop: '5px',
    },
    stockTotal: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontWeight: 700,
      color: 'var(--safe)',
    },
    infraRow: {
      display: 'flex',
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      fontSize: '11px',
      color: 'var(--muted)',
      borderTop: '1px solid var(--rule)',
      paddingTop: '10px',
    },
    gridBadge: (reliability: 'High' | 'Moderate' | 'Unstable') => ({
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '10px',
      fontWeight: 700,
      color: gridColor(reliability),
    }),
    powerBadge: (hasBackup: boolean) => ({
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '10px',
      fontWeight: 700,
      color: hasBackup ? 'var(--safe)' : 'var(--accent)',
    }),
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.pageHeader}>
        <div style={S.headerLeft}>
          <span style={S.eyebrow}>National Blood Grid · 47 Facilities</span>
          <h2 style={S.h2}>Stock Readiness & Infrastructure</h2>
          <p style={S.subtitle}>Real-time inventory, cold chain power status, and O− universal donor reserves.</p>
        </div>
        <input
          type="text"
          placeholder="Search facility or county…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={S.searchInput}
        />
      </div>

      {/* Summary strip */}
      <div style={S.summaryRow}>
        <div style={S.summaryCard('var(--accent)')}>
          <div style={S.summaryNum}>{totalONeg}</div>
          <div style={S.summaryLabel}>Safe O− units across all facilities</div>
        </div>
        <div style={S.summaryCard('var(--warn)')}>
          <div style={S.summaryNum}>{depleted}</div>
          <div style={S.summaryLabel}>Facilities with zero O− stock</div>
        </div>
        <div style={S.summaryCard('var(--muted)')}>
          <div style={S.summaryNum}>{unstableGrid}</div>
          <div style={S.summaryLabel}>Facilities on unstable power grid</div>
        </div>
      </div>

      {/* Facility cards */}
      <div style={S.facilityGrid}>
        {filtered.map((f) => (
          <div key={f.id} style={S.facilityCard}>
            <div style={S.cardTop}>
              <div>
                <div style={S.facilityId}>{f.id}</div>
                <div style={S.facilityName}>{f.name}</div>
                <div style={S.facilitySub}>{f.county} · {f.type}</div>
              </div>
              <div style={S.statusDot(f.readinessStatus)} title={`Readiness: ${f.readinessStatus.toUpperCase()}`} />
            </div>

            <div style={S.stockSection}>
              <div style={S.stockRow}>
                <span style={S.stockLabel}>Universal O−</span>
                <span style={S.stockValue(f.oNegUnits === 0)}>
                  {f.oNegUnits} U{f.oNegUnits === 0 ? ' — DEPLETED' : ''}
                </span>
              </div>
              <div style={S.stockRow}>
                <span style={S.stockLabel}>Common O+</span>
                <span style={S.stockValue(false)}>{f.oPosUnits} U</span>
              </div>
              <div style={{ ...S.stockRow, ...S.stockDivider }}>
                <span style={S.stockLabel}>Total valid stock</span>
                <span style={S.stockTotal}>{f.totalUnits}</span>
              </div>
            </div>

            <div style={S.infraRow}>
              <span style={S.powerBadge(f.backupPower)}>
                {f.backupPower ? '⚡ Generator OK' : '✕ No backup power'}
              </span>
              <span style={S.gridBadge(f.gridReliability)}>Grid: {f.gridReliability}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
