import React, { useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useRoute, navigate } from './lib/router'
import { AppShell, NAV } from './layout/AppShell'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { ClinicianOverview, OfficerOverview, MohOverview, LabOverview, LabHistory } from './pages/Overview'
import { RequestsPage } from './pages/RequestsPage'
import { RequestDetailPage } from './pages/RequestDetailPage'
import { ClinicianView } from './components/ClinicianView'
import { OfficerDecisionView } from './components/OfficerDecisionView'
import { MohAuthoriseView } from './components/MohAuthoriseView'
import { LabDispatchView } from './components/LabDispatchView'
import { AuditTrailView } from './components/AuditTrailView'
import { ReadinessGridView } from './components/ReadinessGridView'
import type { Role } from './types'

/*
 * Routes (hash):
 *   #/                 landing page
 *   #/login            sign in (form + test users)
 *   #/app/<section>    the signed-in user's workspace; sections depend on role (see NAV)
 *   #/app/requests/<id> one request
 */

function parse(route: string) {
  const [path, qs = ''] = route.split('?')
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs) }
}

const Redirect: React.FC<{ to: string; onlyFrom?: string }> = ({ to, onlyFrom }) => {
  useEffect(() => {
    if (!onlyFrom || window.location.hash.replace(/^#/, '').startsWith(onlyFrom)) navigate(to)
  }, [to, onlyFrom])
  return null
}

function section(role: Role, name: string, id: string | undefined, query: URLSearchParams): React.ReactNode {
  if (!NAV[role].some((n) => n.path === name)) return <Redirect to="/app/overview" />
  if (name === 'requests' && id) return <RequestDetailPage id={Number(id)} />
  switch (`${role}:${name}`) {
    case 'clinician:overview': return <ClinicianOverview />
    case 'clinician:new': return <ClinicianView section="form" />
    case 'clinician:arrivals': return <ClinicianView section="arrivals" />
    case 'clinician:requests': return <RequestsPage title="My requests" initialStatus={query.get('status') || undefined} />
    case 'blood_bank_officer:overview': return <OfficerOverview />
    case 'blood_bank_officer:decisions': return <OfficerDecisionView />
    case 'moh_officer:overview': return <MohOverview />
    case 'moh_officer:approvals': return <MohAuthoriseView />
    case 'lab_officer:overview': return <LabOverview />
    case 'lab_officer:orders': return <LabDispatchView />
    case 'lab_officer:history': return <LabHistory />
  }
  if (name === 'requests') return <RequestsPage title="All requests" initialStatus={query.get('status') || undefined} />
  if (name === 'audit') return <AuditTrailView initialRequestId={Number(query.get('request')) || undefined} />
  if (name === 'readiness') return <ReadinessGridView />
  return <Redirect to="/app/overview" />
}

const Routes: React.FC = () => {
  const route = useRoute()
  const { user } = useAuth()
  const { parts, query } = parse(route)

  if (parts[0] === 'login') return user ? <Redirect to="/app/overview" /> : <LoginPage />
  if (parts[0] === 'app') {
    // Signed out while on /app: go to sign-in, unless sign-out already moved us elsewhere.
    if (!user) return <Redirect to="/login" onlyFrom="/app" />
    const name = parts[1] || 'overview'
    return (
      // key: remount the page when the signed-in user changes (e.g. switching test user)
      <AppShell section={parts.slice(1).join('/') || 'overview'} key={user.token}>
        <React.Fragment key={route}>{section(user.role, name, parts[2], query)}</React.Fragment>
      </AppShell>
    )
  }
  if (parts.length === 0) return <LandingPage />
  return <Redirect to="/" />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  )
}
