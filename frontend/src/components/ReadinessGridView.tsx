import React, { useState } from 'react'
import { MapPin, BatteryCharging, Droplet, Search } from 'lucide-react'

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold uppercase tracking-wider">
            <MapPin className="w-4 h-4 text-rose-500" />
            National Blood Grid Network (47 Facilities)
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Stock Readiness &amp; Infrastructure Telemetry</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Real-time multi-site inventory, cold chain power vulnerability, and scarce O− universal donor reserves.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search facility or county..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-white text-xs focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Grid of Facilities */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map((f) => (
          <div
            key={f.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[11px] font-bold text-slate-400">{f.id}</span>
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    f.readinessStatus === 'green'
                      ? 'bg-emerald-500 shadow-md shadow-emerald-500/50'
                      : f.readinessStatus === 'amber'
                      ? 'bg-amber-500 shadow-md shadow-amber-500/50'
                      : 'bg-rose-500 shadow-md shadow-rose-500/50 animate-pulse'
                  }`}
                  title={`Readiness Status: ${f.readinessStatus.toUpperCase()}`}
                />
              </div>

              <h4 className="text-sm font-bold text-white leading-tight">{f.name}</h4>
              <p className="text-xs text-slate-400">{f.county} · {f.type}</p>
            </div>

            {/* Blood Stocks */}
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 flex items-center gap-1">
                  <Droplet className="w-3 h-3 text-rose-500" />
                  Universal O−:
                </span>
                <span className={`font-mono font-bold ${f.oNegUnits === 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                  {f.oNegUnits} U {f.oNegUnits === 0 && '(DEPLETED)'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Common O+:</span>
                <span className="font-mono font-semibold text-slate-200">{f.oPosUnits} U</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-800 pt-1 text-[11px]">
                <span className="text-slate-400">Total Valid Stock:</span>
                <span className="font-mono font-bold text-emerald-400">{f.totalUnits} units</span>
              </div>
            </div>

            {/* African Conditions: Power & Grid Reliability */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
              <span className="flex items-center gap-1">
                <BatteryCharging className={`w-3.5 h-3.5 ${f.backupPower ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span>{f.backupPower ? 'Generator: OK' : 'No Backup'}</span>
              </span>
              <span className={`font-medium ${
                f.gridReliability === 'High' ? 'text-emerald-400' : f.gridReliability === 'Moderate' ? 'text-amber-400' : 'text-rose-400'
              }`}>
                Grid: {f.gridReliability}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
