import React, { useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import { Header } from './components/Header'
import { ClinicianView } from './components/ClinicianView'
import { OfficerDecisionView } from './components/OfficerDecisionView'
import { MohAuthoriseView } from './components/MohAuthoriseView'
import { LabDispatchView } from './components/LabDispatchView'
import { AuditTrailView } from './components/AuditTrailView'
import { ReadinessGridView } from './components/ReadinessGridView'
import type { EmergencyRequest } from './types'
import './App.css'

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('clinician')
  const [selectedReqId, setSelectedReqId] = useState<number | undefined>(undefined)

  const handleRequestCreated = (req: EmergencyRequest) => {
    setSelectedReqId(req.id)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-raised)' }}>
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      <main style={{ flex: 1 }}>
        {activeTab === 'clinician' && <ClinicianView onRequestCreated={handleRequestCreated} />}
        {activeTab === 'officer' && <OfficerDecisionView selectedRequestId={selectedReqId} />}
        {activeTab === 'moh' && <MohAuthoriseView />}
        {activeTab === 'lab' && <LabDispatchView />}
        {activeTab === 'audit' && <AuditTrailView />}
        {activeTab === 'readiness' && <ReadinessGridView />}
      </main>
      <footer style={{
        borderTop: '1px solid var(--rule)',
        background: 'var(--surface)',
        padding: '12px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '12px',
        color: 'var(--ink-faint)',
      }}>
        <span>Golden Hour · Team Golden Hour · Terumo BCT Africa Hackathon 2026</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>
          Random Forest ETA · 34,135 transfers · 91.1% emergency coverage
        </span>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
