import React, { useState } from 'react'
import { useAuth, type TestRole } from '../context/AuthContext'
import { SUPPLYING_SITES } from '../api/facilities'
import { lastDispatchSite } from '../hooks/usePolling'
import { Link, navigate } from '../lib/router'
import { Logo } from '../layout/AppShell'
import { Button, Label, Notice, inputCls } from '../components/ui'

const TEST_USERS: { role: TestRole; title: string; where: string }[] = [
  { role: 'clinician', title: 'Clinician', where: 'Eastlands County Hospital' },
  { role: 'officer', title: 'Blood bank officer', where: 'Nairobi Regional Blood Transfusion Centre' },
  { role: 'moh', title: 'MoH authorising officer', where: 'Ministry of Health' },
  { role: 'lab', title: 'Lab officer', where: 'A supplying site' },
]

export const LoginPage: React.FC = () => {
  const { signIn, signInTestUser, loading, error, notice } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [labSite, setLabSite] = useState(lastDispatchSite.get() || 'RBTC-NBO')
  const [busy, setBusy] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy('form')
    try {
      await signIn(email, password)
      navigate('/app/overview')
    } catch {
      // error shown from context
    } finally {
      setBusy(null)
    }
  }

  const test = async (role: TestRole) => {
    setBusy(role)
    try {
      await signInTestUser(role, role === 'lab' ? labSite : undefined)
      navigate('/app/overview')
    } catch {
      // error shown from context
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 px-4 max-w-6xl w-full mx-auto flex items-center gap-2">
        <Link to="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-semibold text-slate-900">Golden Hour</span>
        </Link>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-md lg:max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
            <p className="text-sm text-slate-500 mt-1">Use the account your blood service gave you.</p>

            {notice && <div className="mt-4"><Notice tone="warn">{notice}</Notice></div>}
            {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
              </div>
              <Button type="submit" kind="primary" big disabled={loading} className="w-full">
                {busy === 'form' ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
            <p className="mt-4 text-xs text-slate-500">
              No account? Accounts are issued by your national blood service. Ask your administrator for access.
            </p>
          </div>

          <div id="test" className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-slate-900">Sign in as a test user</h2>
            <p className="text-sm text-slate-500 mt-1">Demo accounts with synthetic data. You can switch user from the account menu.</p>
            <ul className="mt-4 space-y-2">
              {TEST_USERS.map((t) => (
                <li key={t.role} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{t.title}</div>
                    {t.role === 'lab' ? (
                      <select
                        aria-label="Lab site"
                        value={labSite}
                        onChange={(e) => setLabSite(e.target.value)}
                        className="mt-1 w-full h-8 border border-slate-300 rounded-md px-2 text-xs bg-white"
                      >
                        {SUPPLYING_SITES.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-xs text-slate-500 truncate">{t.where}</div>
                    )}
                  </div>
                  <Button disabled={loading} onClick={() => test(t.role)} className="!h-8 shrink-0">
                    {busy === t.role ? 'Signing in…' : 'Continue'}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  )
}
