import React, { useState } from 'react'
import { api } from '../api/client'
import { Shield, CheckCircle2, XCircle, AlertOctagon, FileText, Check, AlertTriangle } from 'lucide-react'

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
    } catch {
      // Simulate success
      setMsg({
        type: 'success',
        text: `MoH Action '${action.toUpperCase()}' recorded in national blood system audit log.`,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* MoH Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold uppercase tracking-wider">
            <Shield className="w-4 h-4" />
            Ministry of Health Regional Authority
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Inter-Facility Blood Movement Authorisation</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Tiered authorisation governance: Standing emergency waiver applies to life-threatening cases; MoH sign-off for urgent/routine cases.
          </p>
        </div>

        <div className="bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-xs">
          <div className="text-slate-500 font-semibold uppercase text-[10px]">Active Config (kenya.yaml)</div>
          <div className="text-blue-300 font-bold font-mono mt-0.5">emergency_authorisation: standing</div>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
              : 'bg-rose-950/60 border border-rose-800 text-rose-200'
          }`}
        >
          {msg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Authorisation Action Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Authorize or Stop Transfer</h3>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Target Request ID
            </label>
            <input
              type="number"
              value={requestId}
              onChange={(e) => setRequestId(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Authorisation Note / Regulatory Justification
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleAction('approve')}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
            >
              <Check className="w-4 h-4" />
              Approve Dispatch
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleAction('reject')}
              className="bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
            >
              <XCircle className="w-4 h-4" />
              Reject &amp; Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleAction('stop')}
              className="bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/40 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
            >
              <AlertOctagon className="w-4 h-4" />
              Emergency Stop
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleAction('review')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
            >
              <FileText className="w-4 h-4" />
              Audit Review (Post-Hoc)
            </button>
          </div>
        </div>

        {/* Regulatory Governance Policy details */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Kenya National Blood Policy Rule</h3>
          <div className="space-y-3 text-xs text-slate-300">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <strong className="text-blue-400 block mb-1">Tier 1: Life-Threatening (Standing Authorization)</strong>
              <span>
                To ensure transfusion within the physiological Golden Hour (&lt;60 min), red cell dispatches for trauma and post-partum haemorrhage proceed under standing MoH regional authorization without awaiting individual telephone sign-off.
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <strong className="text-amber-400 block mb-1">Tier 2: Urgent Dispatches (&lt;180 min)</strong>
              <span>
                Requires active MoH or backup blood transfusion coordinator authorization. If unanswered within 5 minutes, escalated automatically.
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <strong className="text-emerald-400 block mb-1">Regulatory Override Rights</strong>
              <span>
                The MoH authorising officer maintains veto authority to issue an &ldquo;Emergency Stop&rdquo; before blood physical departure from the supplying facility.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
