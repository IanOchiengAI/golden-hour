import React, { createContext, useContext, useState, useEffect } from 'react'
import type { User } from '../types'
import { api, DEMO_CREDENTIALS } from '../api/client'

interface AuthContextType {
  user: User | null
  loginAs: (roleKey: keyof typeof DEMO_CREDENTIALS) => Promise<void>
  logout: () => void
  isOnline: boolean
  lowDataMode: boolean
  setLowDataMode: (enabled: boolean) => void
  loading: boolean
  error: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('gh_user')
    return saved ? JSON.parse(saved) : null
  })
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine)
  const [lowDataMode, setLowDataMode] = useState<boolean>(() => {
    return localStorage.getItem('gh_low_data') === 'true'
  })
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

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

  const handleLowDataChange = (enabled: boolean) => {
    setLowDataMode(enabled)
    localStorage.setItem('gh_low_data', enabled ? 'true' : 'false')
  }

  const loginAs = async (roleKey: keyof typeof DEMO_CREDENTIALS) => {
    setLoading(true)
    setError(null)
    const cred = DEMO_CREDENTIALS[roleKey]
    try {
      const res = await api.login(cred.username, cred.password)
      const newUser: User = {
        username: res.username,
        role: res.role,
        facility_id: res.facility_id || cred.facility_id,
        facility_name: cred.title,
        token: res.token,
      }
      setUser(newUser)
      localStorage.setItem('gh_user', JSON.stringify(newUser))
    } catch (err: unknown) {
      console.warn('Backend login unavailable, falling back to simulated session for demo:', err)
      const simulatedToken = 'demo-token-' + roleKey
      api.setToken(simulatedToken)
      const newUser: User = {
        username: cred.username,
        role: cred.role,
        facility_id: cred.facility_id,
        facility_name: cred.title,
        token: simulatedToken,
      }
      setUser(newUser)
      localStorage.setItem('gh_user', JSON.stringify(newUser))
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    api.setToken(null)
    localStorage.removeItem('gh_user')
  }

  useEffect(() => {
    if (!user) {
      loginAs('clinician')
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loginAs,
        logout,
        isOnline,
        lowDataMode,
        setLowDataMode: handleLowDataChange,
        loading,
        error,
      }}
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
