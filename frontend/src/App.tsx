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

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('clinician')
  const [selectedReqId, setSelectedReqId] = useState<number | undefined>(undefined)

  const handleRequestCreated = (req: EmergencyRequest) => {
    setSelectedReqId(req.id)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-rose-500 selection:text-white">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 pb-16">
        {activeTab === 'clinician' && <ClinicianView onRequestCreated={handleRequestCreated} />}
        {activeTab === 'officer' && <OfficerDecisionView selectedRequestId={selectedReqId} />}
        {activeTab === 'moh' && <MohAuthoriseView />}
        {activeTab === 'lab' && <LabDispatchView />}
        {activeTab === 'audit' && <AuditTrailView />}
        {activeTab === 'readiness' && <ReadinessGridView />}
      </main>

      {/* Global Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Golden Hour · Team Golden Hour · Terumo BCT Africa Hackathon 2026</span>
          <span className="font-mono text-[11px] text-slate-400">
            Stack: React + TypeScript + Tailwind CSS · Django REST Framework API · Random Forest ETA Regressor
          </span>
        </div>
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
