import React from 'react'
import type { Dispatch, RequestStatus, Urgency } from '../types'

/*
 * Shared look for every screen.
 * - One accent (blue) for actions. Green / amber / red are for status only.
 * - Red means life-threatening or a blocking problem, nothing else.
 * - Type scale: text-xs labels · text-sm body · text-base card titles · text-xl page title · text-3xl key numbers.
 */

export const Page: React.FC<{
  title: string; subtitle?: string; aside?: React.ReactNode; children: React.ReactNode; wide?: boolean
}> = ({ title, subtitle, aside, children, wide }) => (
  <div className={`${wide ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 lg:px-8 py-6 space-y-4`}>
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {aside}
    </div>
    {children}
  </div>
)

/** A headline number. */
export const StatCard: React.FC<{
  label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'amber' | 'red'; onClick?: () => void
}> = ({ label, value, hint, tone, onClick }) => {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`text-left bg-white border border-slate-200 rounded-lg p-4 ${onClick ? 'hover:border-slate-300 hover:shadow-sm' : ''}`}
    >
      <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
        {tone && <span className={`w-2 h-2 rounded-full ${tone === 'red' ? 'bg-red-500' : 'bg-amber-500'}`} aria-hidden />}
        {label}
      </div>
      <div className="text-3xl font-semibold tabular-nums text-slate-900 mt-1">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </Tag>
  )
}

export const Section: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title, aside, children, className = '',
}) => (
  <section className={`bg-white border border-slate-200 rounded-lg ${className}`}>
    <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {aside}
    </div>
    <div className="px-4 pb-4">{children}</div>
  </section>
)

export const FilterSelect: React.FC<{
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}> = ({ label, value, onChange, options }) => (
  <select
    aria-label={label}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="h-9 border border-slate-300 rounded-md px-2 text-sm bg-white text-slate-900"
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
)

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
}

/** Table with client-side pagination. Rows are clickable when onRowClick is given. */
export function DataTable<T extends { id: number }>({
  columns, rows, pageSize = 10, onRowClick, empty, loaded = true,
}: {
  columns: Column<T>[]
  rows: T[]
  pageSize?: number
  onRowClick?: (row: T) => void
  empty: string
  loaded?: boolean
}) {
  const [page, setPage] = React.useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const p = Math.min(page, pages - 1)
  const shown = rows.slice(p * pageSize, p * pageSize + pageSize)
  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-3 py-2 font-medium whitespace-nowrap ${c.className || ''}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!loaded ? (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">{empty}</td></tr>
            ) : (
              shown.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2 align-middle ${c.className || ''}`}>{c.cell(row)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 text-sm text-slate-600">
          <span className="tabular-nums">
            {p * pageSize + 1}–{Math.min(rows.length, (p + 1) * pageSize)} of {rows.length}
          </span>
          <div className="flex gap-2">
            <Button onClick={() => setPage(p - 1)} disabled={p === 0} className="!h-8">Previous</Button>
            <Button onClick={() => setPage(p + 1)} disabled={p >= pages - 1} className="!h-8">Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white border border-slate-200 rounded-lg p-4 ${className}`}>{children}</div>
)

type BtnKind = 'primary' | 'secondary' | 'quiet'
const BTN: Record<BtnKind, string> = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800 disabled:bg-slate-300',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  quiet: 'text-blue-700 hover:underline disabled:text-slate-400',
}
export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; big?: boolean }
> = ({ kind = 'secondary', big, className = '', ...props }) => (
  <button
    type="button"
    {...props}
    className={`${BTN[kind]} ${kind === 'quiet' ? 'text-sm' : `${big ? 'h-12 text-base' : 'h-10 text-sm'} px-4 rounded-md font-medium`} disabled:cursor-not-allowed ${className}`}
  />
)

type Tone = 'grey' | 'green' | 'amber' | 'red'
const TONE: Record<Tone, string> = {
  grey: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
}
export const Chip: React.FC<{ tone?: Tone; children: React.ReactNode }> = ({ tone = 'grey', children }) => (
  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${TONE[tone]}`}>{children}</span>
)

const REQUEST_STATUS: Record<RequestStatus, [string, Tone]> = {
  DraftFromCall: ['Draft', 'grey'],
  Raised: ['Raised', 'grey'],
  Matching: ['Matching', 'grey'],
  UnitsHeld: ['Held', 'grey'],
  AwaitingDecision: ['Awaiting officer', 'amber'],
  Escalated: ['Escalated', 'amber'],
  AwaitingAuthorisation: ['Awaiting MoH', 'amber'],
  SentToSupplier: ['At supplier', 'grey'],
  Dispatched: ['Released', 'grey'],
  InTransit: ['In transit', 'grey'],
  Received: ['Received', 'green'],
  HandledManually: ['By phone', 'red'],
}
export const statusLabel = (s: RequestStatus) => (REQUEST_STATUS[s] || [s])[0]
export const ALL_STATUSES = Object.keys(REQUEST_STATUS) as RequestStatus[]
export const dispatchStatusLabel = (s: Dispatch['status']) => (DISPATCH_STATUS[s] || [s])[0]

/** "14 Nov, 09:12" */
export const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export const StatusChip: React.FC<{ status: RequestStatus }> = ({ status }) => {
  const [label, tone] = REQUEST_STATUS[status] || [status, 'grey']
  return <Chip tone={tone}>{label}</Chip>
}

const DISPATCH_STATUS: Record<Dispatch['status'], [string, Tone]> = {
  AwaitingRelease: ['Awaiting release', 'amber'],
  Released: ['Released', 'grey'],
  InTransit: ['In transit', 'grey'],
  Received: ['Received', 'green'],
  Declined: ['Declined', 'red'],
  Cancelled: ['Stopped', 'red'],
}
export const DispatchChip: React.FC<{ status: Dispatch['status'] }> = ({ status }) => {
  const [label, tone] = DISPATCH_STATUS[status] || [status, 'grey']
  return <Chip tone={tone}>{label}</Chip>
}

export const URGENCY_LABEL: Record<Urgency, string> = {
  life_threatening: 'Life-threatening',
  urgent: 'Urgent',
  routine: 'Routine',
}
export const UrgencyChip: React.FC<{ urgency: Urgency }> = ({ urgency }) => (
  <Chip tone={urgency === 'life_threatening' ? 'red' : 'grey'}>{URGENCY_LABEL[urgency] || urgency}</Chip>
)

export const COMPONENT_LABEL: Record<string, string> = { RBC: 'red cells', FFP: 'plasma', PLT: 'platelets' }

/** "−" for display (the API uses "-"). */
export const group = (g?: string | null) => (g ? (g === 'unknown' ? 'Unknown' : g.replace('-', '−')) : '')

/** "44–126 min" or "1h 10m – 2h 05m" */
export function etaRange(low: number, high: number) {
  const f = (m: number) => {
    const r = Math.round(m)
    return r < 120 ? `${r}` : `${Math.floor(r / 60)}h ${String(r % 60).padStart(2, '0')}m`
  }
  const lo = f(low)
  const hi = f(high)
  return high < 120 ? `${lo}–${hi} min` : `${lo}${low < 120 ? ' min' : ''} – ${hi}`
}

export const Notice: React.FC<{ tone: 'error' | 'warn' | 'ok'; children: React.ReactNode; onClose?: () => void }> = ({
  tone, children, onClose,
}) => {
  const cls = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`border rounded-md px-3 py-2 text-sm flex items-start gap-2 ${cls}`}>
      <span className="flex-1">{children}</span>
      {onClose && (
        <button type="button" onClick={onClose} className="text-xs underline shrink-0">
          Dismiss
        </button>
      )}
    </div>
  )
}

export const Label: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-500 mb-1">
    {children}
  </label>
)

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-slate-500 py-6 text-center">{children}</p>
)

export const inputCls =
  'w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600'

/** Pick one option from a row of big buttons. */
export function Choice<T extends string>({
  options, value, onChange, cols, danger,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  cols: string
  /** option values that use red when selected (life-threatening) */
  danger?: T[]
}) {
  return (
    <div className={`grid ${cols} gap-2`} role="radiogroup">
      {options.map((o) => {
        const on = o.value === value
        const red = on && danger?.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`h-11 rounded-md border text-sm font-medium ${
              red
                ? 'bg-red-600 border-red-600 text-white'
                : on
                ? 'bg-blue-700 border-blue-700 text-white'
                : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A work queue: a list on wide screens, a dropdown on phones so the selected item stays above the fold. */
export function Queue<T extends { id: number }>({
  title, items, selectedId, onSelect, row, loaded, empty,
}: {
  title: string
  items: T[]
  selectedId: number | null
  onSelect: (id: number) => void
  row: (item: T) => { main: string; chips?: React.ReactNode }
  loaded: boolean
  empty: string
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 mb-1">
        {title} {loaded && `(${items.length})`}
      </div>
      {!loaded ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <>
          <select
            className={`${inputCls} lg:hidden`}
            value={selectedId ?? ''}
            onChange={(e) => onSelect(Number(e.target.value))}
            aria-label={title}
          >
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {row(it).main}
              </option>
            ))}
          </select>
          <ul className="hidden lg:block border border-slate-200 rounded-lg bg-white divide-y divide-slate-100">
            {items.map((it) => {
              const r = row(it)
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(it.id)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                      it.id === selectedId ? 'bg-blue-50 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex-1 truncate">{r.main}</span>
                    {r.chips}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

export const Dialog: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
    <div className="bg-white rounded-lg w-full max-w-md p-4 space-y-3 shadow-lg">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </div>
  </div>
)

/** "4:32 left" / "Overdue" from an ISO due time. */
export function timeLeft(dueIso: string | null | undefined, now: number): { text: string; tone: Tone } | null {
  if (!dueIso) return null
  const s = Math.round((new Date(dueIso).getTime() - now) / 1000)
  if (s <= 0) return { text: 'Overdue', tone: 'red' }
  const m = Math.floor(s / 60)
  return { text: `${m}:${String(s % 60).padStart(2, '0')} left`, tone: s < 60 ? 'red' : 'amber' }
}
