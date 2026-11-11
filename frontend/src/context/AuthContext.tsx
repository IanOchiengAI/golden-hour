import React, { createContext, useContext, useState, useEffect } from 'react'
import type { User } from '../types'
import { api, DEMO_CREDENTIALS, labUsername } from '../api/client'
import { facilityName } from '../api/facilities'

/*
 * Sign-in:
 * - signIn(email, password): the sign-in form. Always a real POST /auth/login.
 * - signInTestUser(role): one click with the seeded demo accounts. Tokens are reused
 *   per demo user until they expire, so switching roles in a demo stays under the
 *   backend's login rate limit (10/min).
 * - signOut(): forgets the token in this browser. (The backend has no logout endpoint
 *   yet; tokens expire after TOKEN_TTL_HOURS.)
 * The signed-in user and token live in localStorage, so a reload keeps you signed in.
 */

export type TestRole = keyof typeof DEMO_CREDENTIALS

interface AuthContextType {
  user: User | null
  signIn: (username: string, password: string) => Promise<void>
  signInTestUser: (role: TestRole, labSite?: string) => Promise<void>
  signOut: (message?: string) => void
  isOnline: boolean
  apiConnected: boolean
  loading: boolean
  error: string | null
  /** message to show on the sign-in page (e.g. "Session expired") */
  notice: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

type LoginResult = { token: string; username: string; role: User['role']; facility_id?: string; expires_at?: string }

const tokenCache = {
  read(): Record<string, LoginResult> {
    try {
      return JSON.parse(localStorage.getItem('gh_tokens') || '{}')
    } catch {
      return {}
    }
  },
  get(username: string): LoginResult | null {
    const t = tokenCache.read()[username]
    const valid = t && (!t.expires_at || new Date(t.expires_at).getTime() > Date.now() + 60_000)
    return valid ? t : null
  },
  put(username: string, res: LoginResult) {
    try {
      localStorage.setItem('gh_tokens', JSON.stringify({ ...tokenCache.read(), [username]: res }))
    } catch {
      // storage blocked: log in again next time
    }
  },
  clear() {
    try {
      localStorage.removeItem('gh_tokens')
    } catch {
      // ignore
    }
  },
}

function readSavedUser(): User | null {
  try {
    const saved = localStorage.getItem('gh_user')
    const u = saved ? (JSON.parse(saved) as User) : null
    if (u) api.setToken(u.token)
    return u
  } catch {
    return null
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(readSavedUser)
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine)
  const [apiConnected, setApiConnected] = useState<boolean>(true)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const finish = (res: LoginResult, demo: boolean) => {
    api.setToken(res.token)
    const newUser: User = {
      username: res.username,
      role: res.role,
      facility_id: res.facility_id || '',
      facility_name: facilityName(res.facility_id),
      token: res.token,
      demo,
    }
    setUser(newUser)
    setApiConnected(true)
    setNotice(null)
    localStorage.setItem('gh_user', JSON.stringify(newUser))
  }

  const run = async (fn: () => Promise<void>) => {
    setLoading(true)
    setError(null)
    try {
      await fn()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.startsWith('Cannot reach')) setApiConnected(false)
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const signIn = (username: string, password: string) =>
    run(async () => finish(await api.login(username.trim().toLowerCase(), password), false))

  const signInTestUser = (role: TestRole, labSite?: string) =>
    run(async () => {
      const username = role === 'lab' && labSite ? labUsername(labSite) : DEMO_CREDENTIALS[role].username
      const cached = tokenCache.get(username)
      const res = cached ?? (await api.login(username, DEMO_CREDENTIALS[role].password))
      if (!cached) tokenCache.put(username, res)
      finish(res, true)
    })

  const signOut = (message?: string) => {
    setUser(null)
    api.setToken(null)
    tokenCache.clear()
    localStorage.removeItem('gh_user')
    setNotice(message || null)
    window.location.hash = message ? '/login' : '/'
  }

  // The server no longer accepts the token (expired or revoked): back to sign-in.
  useEffect(() => {
    api.onUnauthorized = () => signOut('Your session has ended. Please sign in again.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, signIn, signInTestUser, signOut, isOnline, apiConnected, loading, error, notice }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
