import React, { useEffect, useRef, useState } from 'react'
import {
  Bell, ClipboardCheck, FileText, History, LayoutDashboard, List, LogOut, Map, Menu, Package, PlusCircle, ShieldCheck,
  Truck, X,
} from 'lucide-react'
import type { Dispatch, EmergencyRequest, RequestStatus, Role } from '../types'
import { api } from '../api/client'
import { useAuth, type TestRole } from '../context/AuthContext'
import { usePolled } from '../hooks/useData'
import { lastDispatchSite } from '../hooks/usePolling'
import { Link, navigate } from '../lib/router'
import { group } from '../components/ui'

export interface NavItem {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badgeKey?: 'work'
}

export const NAV: Record<Role, NavItem[]> = {
  clinician: [
    { path: 'overview', label: 'Overview', icon: LayoutDashboard },
    { path: 'new', label: 'Request blood', icon: PlusCircle },
    { path: 'arrivals', label: 'Confirm arrivals', icon: Truck, badgeKey: 'work' },
    { path: 'requests', label: 'My requests', icon: List },
  ],
  blood_bank_officer: [
    { path: 'overview', label: 'Overview', icon: LayoutDashboard },
    { path: 'decisions', label: 'Decisions', icon: ClipboardCheck, badgeKey: 'work' },
    { path: 'requests', label: 'All requests', icon: List },
    { path: 'audit', label: 'Audit trail', icon: FileText },
    { path: 'readiness', label: 'Readiness', icon: Map },
  ],
  moh_officer: [
    { path: 'overview', label: 'Overview', icon: LayoutDashboard },
    { path: 'approvals', label: 'Approvals', icon: ShieldCheck, badgeKey: 'work' },
    { path: 'requests', label: 'All requests', icon: List },
    { path: 'audit', label: 'Audit trail', icon: FileText },
    { path: 'readiness', label: 'Readiness', icon: Map },
  ],
  lab_officer: [
    { path: 'overview', label: 'Overview', icon: LayoutDashboard },
    { path: 'orders', label: 'Orders', icon: Package, badgeKey: 'work' },
    { path: 'history', label: 'Order history', icon: History },
  ],
}

export const ROLE_LABEL: Record<Role, string> = {
  clinician: 'Clinician',
  blood_bank_officer: 'Blood bank officer',
  moh_officer: 'MoH authorising officer',
  lab_officer: 'Lab officer',
}

interface Notification {
  key: string
  text: string
  detail: string
  to: string
  urgent: boolean
}

/** What needs this person's action now. Request roles poll /requests; labs poll /dispatches. */
function useNotifications(role: Role): Notification[] {
  const isLab = role === 'lab_officer'
  const reqStatuses: RequestStatus[] =
    role === 'clinician' ? ['InTransit']
    : role === 'blood_bank_officer' ? ['AwaitingDecision', 'Escalated']
    : ['AwaitingAuthorisation', 'SentToSupplier']
  // Only call the endpoint this role may use (refused calls are audited by the backend).
  const reqs = usePolled<EmergencyRequest[]>(
    () => (isLab ? Promise.resolve([]) : api.getRequests({ status: reqStatuses, limit: 100 })), [], 15000, [role])
  const disp = usePolled<Dispatch[]>(
    () => (isLab ? api.getDispatches({ status: ['AwaitingRelease', 'Released'], limit: 100 }) : Promise.resolve([])), [], 15000, [role])

  if (isLab) {
    return disp.data.map((d) => ({
      key: `d${d.id}`,
      text: d.status === 'AwaitingRelease' ? `Order #${d.id} waiting for release` : `Order #${d.id} released — mark in transit`,
      detail: `${d.units_requested} × ${d.component} to ${d.to_facility_name || d.to_facility_id}`,
      to: '/app/orders',
      urgent: d.urgency === 'life_threatening',
    }))
  }
  return reqs.data
    .filter((r) => role !== 'moh_officer' || r.status === 'AwaitingAuthorisation' || (r.authorisation_route === 'standing' && r.dispatch_status === 'AwaitingRelease'))
    .map((r) => ({
      key: `r${r.id}`,
      text:
        role === 'clinician' ? `Blood for #${r.id} is on its way`
        : role === 'blood_bank_officer' ? `#${r.id} needs a decision${r.status === 'Escalated' ? ' (escalated)' : ''}`
        : r.status === 'AwaitingAuthorisation' ? `#${r.id} needs approval`
        : `#${r.id} sent under standing authorisation`,
      detail: `${group(r.patient_blood_group)} · ${r.units_requested} × ${r.component}`,
      to: role === 'clinician' ? '/app/arrivals' : role === 'blood_bank_officer' ? '/app/decisions' : '/app/approvals',
      urgent: r.urgency === 'life_threatening',
    }))
}

function useClickAway(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const on = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', on)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', on)
      document.removeEventListener('keydown', esc)
    }
  }, [open, close])
  return ref
}

const Bellmenu: React.FC<{ items: Notification[] }> = ({ items }) => {
  const [open, setOpen] = useState(false)
  const ref = useClickAway(open, () => setOpen(false))
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-600"
        aria-label={`Notifications: ${items.length}`}
        aria-expanded={open}
      >
        <Bell className="w-5 h-5" />
        {items.length > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold text-white flex items-center justify-center ${items.some((i) => i.urgent) ? 'bg-red-600' : 'bg-blue-700'}`}>
            {items.length > 99 ? '99+' : items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-lg shadow-lg z-50">
          <div className="px-3 py-2 border-b border-slate-100 text-sm font-semibold">Needs your action</div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-sm text-slate-500 text-center">You're up to date.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {items.slice(0, 20).map((n) => (
                <li key={n.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      navigate(n.to)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex gap-2"
                  >
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.urgent ? 'bg-red-500' : 'bg-slate-300'}`} aria-hidden />
                    <span className="text-sm">
                      {n.text}
                      <span className="block text-xs text-slate-500">{n.detail}{n.urgent ? ' · life-threatening' : ''}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const TEST_ROLES: { key: TestRole; label: string }[] = [
  { key: 'clinician', label: 'Clinician' },
  { key: 'officer', label: 'Blood bank officer' },
  { key: 'moh', label: 'MoH officer' },
  { key: 'lab', label: 'Lab officer' },
]

const UserMenu: React.FC = () => {
  const { user, signOut, signInTestUser } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useClickAway(open, () => setOpen(false))
  if (!user) return null
  const initials = user.username.split('@')[0].split(/[.\-_]/).map((s) => s[0]?.toUpperCase()).join('').slice(0, 2)
  const switchTo = (r: TestRole) => {
    setOpen(false)
    signInTestUser(r, r === 'lab' ? lastDispatchSite.get() || 'RBTC-NBO' : undefined)
      .then(() => navigate('/app/overview'))
      .catch(() => undefined)
  }
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full bg-slate-800 text-white text-sm font-semibold"
        aria-label="Account"
        aria-expanded={open}
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50 text-sm">
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="font-medium truncate">{user.username}</div>
            <div className="text-xs text-slate-500">
              {ROLE_LABEL[user.role]}{user.facility_name ? ` · ${user.facility_name}` : ''}
            </div>
          </div>
          {user.demo && (
            <div className="py-1 border-b border-slate-100">
              <div className="px-3 py-1 text-xs text-slate-500">Switch test user</div>
              {TEST_ROLES.map((r) => (
                <button key={r.key} type="button" onClick={() => switchTo(r.key)} className="w-full text-left px-3 py-1.5 hover:bg-slate-50">
                  {r.label}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => signOut()} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export const AppShell: React.FC<{ section: string; children: React.ReactNode }> = ({ section, children }) => {
  const { user, apiConnected, isOnline } = useAuth()
  const [drawer, setDrawer] = useState(false)
  const notes = useNotifications(user!.role)
  const items = NAV[user!.role]
  const connected = apiConnected && isOnline

  const nav = (
    <nav aria-label="Sections" className="flex flex-col gap-0.5 p-3">
      {items.map((it) => {
        const active = section === it.path || (it.path === 'requests' && section.startsWith('requests'))
        const Icon = it.icon
        return (
          <Link
            key={it.path}
            to={`/app/${it.path}`}
            onClick={() => setDrawer(false)}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 px-3 h-9 rounded-md text-sm ${
              active ? 'bg-blue-50 text-blue-800 font-medium' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1">{it.label}</span>
            {it.badgeKey && notes.length > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center tabular-nums">
                {notes.length}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )

  const brand = (
    <Link to="/app/overview" className="flex items-center gap-2 px-4 h-14 border-b border-slate-200">
      <Logo />
      <span className="font-semibold text-slate-900">Golden Hour</span>
    </Link>
  )

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 lg:pl-60">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col bg-white border-r border-slate-200">
        {brand}
        {nav}
        <div className="mt-auto p-4 text-xs text-slate-500">
          <div className="font-medium text-slate-700">{ROLE_LABEL[user!.role]}</div>
          {user!.facility_name || (user!.role === 'moh_officer' ? 'Ministry of Health' : '')}
        </div>
      </aside>

      {/* Drawer (phone / tablet) */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between pr-2 border-b border-slate-200">
              <div className="flex items-center gap-2 px-4 h-14">
                <Logo />
                <span className="font-semibold">Golden Hour</span>
              </div>
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="w-9 h-9 flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-40 h-14 bg-white border-b border-slate-200 flex items-center gap-2 px-4 lg:px-8">
        <button type="button" className="lg:hidden w-9 h-9 -ml-2 flex items-center justify-center" onClick={() => setDrawer(true)} aria-label="Open menu">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 text-sm text-slate-500 truncate">
          <span className="lg:hidden font-semibold text-slate-900 mr-2">Golden Hour</span>
          <span className="hidden sm:inline">{user!.role === 'moh_officer' ? 'Ministry of Health' : user!.facility_name}</span>
        </div>
        <span
          className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
          role="img"
          aria-label={connected ? 'Connected' : 'Not connected'}
          title={connected ? 'Connected' : 'Not connected'}
        />
        <Bellmenu items={notes} />
        <UserMenu />
      </header>

      <main>{children}</main>
    </div>
  )
}

export const Logo: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <rect width="32" height="32" rx="8" fill="#1d4ed8" />
    <path d="M16 6c-4 5.5-7 9.2-7 12.6A7 7 0 0 0 16 25.6a7 7 0 0 0 7-7C23 15.2 20 11.5 16 6z" fill="#fff" />
    <path d="M16 13v8M12 17h8" stroke="#1d4ed8" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)
