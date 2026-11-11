import React, { useState, useEffect } from 'react'
import type { AuditEvent } from '../types'
import { api } from '../api/client'
import { Page, Button, Notice, Empty, inputCls } from './ui'

const ROLE_LABEL: Record<string, string> = {
  clinician: 'Clinician',
  blood_bank_officer: 'Blood bank',
  moh_officer: 'MoH',
  lab_officer: 'Lab',
}

export const AuditTrailView: React.FC<{ initialRequestId?: number }> = ({ initialRequestId }) => {
  const [requestId, setRequestId] = useState<number | null>(initialRequestId ?? null)
  const [input, setInput] = useState<string>(initialRequestId ? String(initialRequestId) : '')
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // No request chosen: open the most recent one.
  useEffect(() => {
    if (requestId) return
    api
      .getRequests({ limit: 1 })
      .then((list) => {
        if (list[0]) {
          setRequestId(list[0].id)
          setInput(String(list[0].id))
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [requestId])

  useEffect(() => {
    if (!requestId) return
    setIsLoading(true)
    setError(null)
    api
      .getAudit(requestId)
      .then((res) => setEvents(res.events || []))
      .catch((err: unknown) => {
        setEvents([])
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setIsLoading(false))
  }, [requestId])

  return (
    <Page
      title="Audit trail"
      wide
      aside={
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const n = parseInt(input, 10)
            if (n > 0) setRequestId(n)
          }}
        >
          <label htmlFor="audit_req" className="text-sm text-slate-500">Request #</label>
          <input id="audit_req" type="number" value={input} onChange={(e) => setInput(e.target.value)} className={`${inputCls} !w-24`} />
          <Button type="submit">Show</Button>
        </form>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}

      {isLoading ? (
        <Empty>Loading…</Empty>
      ) : events.length === 0 ? (
        !error && <Empty>{requestId ? 'No events for this request.' : 'No requests yet.'}</Empty>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((evt, idx) => (
                <tr key={evt.id ?? idx} className="align-top">
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {new Date(evt.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="px-3 py-2">
                    {evt.actor}
                    {evt.role && ROLE_LABEL[evt.role] && <span className="block text-xs text-slate-500">{ROLE_LABEL[evt.role]}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {evt.action.replace(/_/g, ' ')}
                    {evt.action === 'status_changed' && typeof evt.after?.status === 'string' && (
                      <span className="text-slate-500"> → {evt.after.status}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{evt.reason || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  )
}
