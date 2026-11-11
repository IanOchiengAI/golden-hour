import React from 'react'
import { useAuth } from '../context/AuthContext'
import { ShieldAlert, Wifi, WifiOff, Zap, UserCheck } from 'lucide-react'

export const Header: React.FC<{ activeTab: string; setActiveTab: (tab: string) => void }> = ({
  activeTab,
  setActiveTab,
}) => {
  const { user, loginAs, isOnline, apiConnected, lowDataMode, setLowDataMode, error } = useAuth()

  const handleRoleSwitch = async (roleKey: 'clinician' | 'officer' | 'moh' | 'lab') => {
    try {
      await loginAs(roleKey)
      setActiveTab(roleKey)
    } catch {
      setActiveTab(roleKey)
    }
  }

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
      {/* Top Banner / Emergency Alert bar */}
      <div className="bg-rose-950/80 border-b border-rose-900/60 px-4 py-1 text-xs text-rose-200 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
          <span className="font-semibold tracking-wide uppercase">Terumo BCT Africa Hackathon 2026 — 24h Emergency Protocol</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-rose-300/80">
          <span>Target Golden Hour: &lt;60 min</span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">Mandatory Clinical Sign-Off Enforced</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Logo & Facility Details */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-rose-600 to-amber-500 p-2.5 rounded-xl shadow-lg shadow-rose-900/30 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                  Golden<span className="text-rose-500">Hour</span>
                </h1>
                <span className="text-[10px] bg-rose-500/20 text-rose-300 font-mono font-medium px-2 py-0.5 rounded-full border border-rose-500/30">
                  DISPATCH COPILOT
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {user?.facility_id ? (
                  <span>Facility: <strong className="text-slate-200">{user.facility_id}</strong> ({user.facility_name})</span>
                ) : (
                  <span>Ministry of Health National Coordination</span>
                )}
              </p>
            </div>
          </div>

          {/* Quick Demo Role Switcher & System Indicators */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <span className="text-slate-400 px-2 py-1 text-[11px] font-medium flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                Role:
              </span>
              <button
                onClick={() => handleRoleSwitch('clinician')}
                className={`px-2.5 py-1 rounded transition-all font-medium ${
                  user?.role === 'clinician'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Ward Clinician at HSP-002"
              >
                Clinician
              </button>
              <button
                onClick={() => handleRoleSwitch('officer')}
                className={`px-2.5 py-1 rounded transition-all font-medium ${
                  user?.role === 'blood_bank_officer'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Blood Bank Officer at RBTC Nairobi"
              >
                Officer
              </button>
              <button
                onClick={() => handleRoleSwitch('moh')}
                className={`px-2.5 py-1 rounded transition-all font-medium ${
                  user?.role === 'moh_officer'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="MoH Regional Authoriser"
              >
                MoH
              </button>
              <button
                onClick={() => handleRoleSwitch('lab')}
                className={`px-2.5 py-1 rounded transition-all font-medium ${
                  user?.role === 'lab_officer'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Supplying Lab Officer (Supplier-safe view)"
              >
                Lab
              </button>
            </div>

            {/* African Conditions: Connectivity & 2G/3G Low Data Mode Toggle */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
              {apiConnected && isOnline ? (
                <span className="flex items-center gap-1 text-emerald-400 font-medium text-[11px]">
                  <Wifi className="w-3.5 h-3.5" />
                  <span>API Connected</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-400 font-medium text-[11px]" title={error || 'Backend not responding on port 8000'}>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Backend Offline</span>
                </span>
              )}
              <span className="text-slate-700">|</span>
              <button
                onClick={() => setLowDataMode(!lowDataMode)}
                className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border transition-colors ${
                  lowDataMode
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="Optimizes payload for 2G/3G rural networks"
              >
                <Zap className="w-3 h-3 text-amber-400" />
                <span>{lowDataMode ? '2G Lite: ON' : '2G Lite: OFF'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 mt-3 border-t border-slate-800/80 pt-2 overflow-x-auto scrollbar-none text-xs">
          <button
            onClick={() => setActiveTab('clinician')}
            className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeTab === 'clinician'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            1. Clinician Request
          </button>
          <button
            onClick={() => setActiveTab('officer')}
            className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeTab === 'officer'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            2. Officer Decision (ML ETA)
          </button>
          <button
            onClick={() => setActiveTab('moh')}
            className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeTab === 'moh'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            3. MoH Authorisation
          </button>
          <button
            onClick={() => setActiveTab('lab')}
            className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeTab === 'lab'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            4. Supplying Lab
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeTab === 'audit'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            5. Audit Trail &amp; KDPA
          </button>
          <button
            onClick={() => setActiveTab('readiness')}
            className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
              activeTab === 'readiness'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            6. Stock Readiness Map
          </button>
        </nav>
      </div>
    </header>
  )
}
