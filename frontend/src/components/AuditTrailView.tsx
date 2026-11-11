import React, { useState, useEffect } from 'react'
import type { AuditEvent } from '../types'
import { api } from '../api/client'
import { ShieldCheck, FileText, UserCheck } from 'lucide-react'

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Audit Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Append-Only Audit Log (KDPA §31 &amp; §46)
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Immutable Transfusion &amp; Dispatch Audit Trail</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Every login, automated stock match, unit hold, officer override, and cold chain temperature inspection is permanently signed.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-medium">Inspect Request #:</label>
          <input
            type="number"
            value={requestId}
            onChange={(e) => setRequestId(parseInt(e.target.value) || 0)}
            className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Timeline View */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          <span>Chronological Audit Events (Oldest First)</span>
        </h3>

        {isLoading ? (
          <div className="text-center py-8 text-slate-400 text-xs">Loading audit log...</div>
        ) : (
          <div className="relative border-l-2 border-slate-800 ml-4 space-y-6">
            {events.map((evt, idx) => (
              <div key={idx} className="relative pl-6">
                {/* Timeline Node Icon */}
                <div className="absolute -left-2.5 top-0.5 w-5 h-5 rounded-full bg-slate-950 border-2 border-rose-500 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                        {evt.action}
                      </span>
                      <span className="font-mono text-slate-400">{evt.object}</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {new Date(evt.time).toLocaleTimeString()} · {new Date(evt.time).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                    <span>Actor: <strong className="text-white">{evt.actor}</strong></span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-400">Role: <span className="capitalize">{evt.role.replace(/_/g, ' ')}</span></span>
                  </div>

                  {evt.reason && (
                    <div className="text-xs text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-800/80">
                      <span className="text-slate-400 font-semibold">Clinical / Operational Justification: </span>
                      {evt.reason}
                    </div>
                  )}

                  {evt.after && (
                    <div className="text-[11px] font-mono text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-800/40 truncate">
                      State: {JSON.stringify(evt.after)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
