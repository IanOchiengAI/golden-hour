import React, { createContext, useContext, useState, useEffect } from 'react'
import type { User } from '../types'
import { api, DEMO_CREDENTIALS } from '../api/client'

interface AuthContextType {
  user: User | null
  loginAs: (roleKey: keyof typeof DEMO_CREDENTIALS) => Promise<void>
  loginWithFacility: (facilityId: string) => Promise<void>
  logout: () => void
  isOnline: boolean
  apiConnected: boolean
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
  const [apiConnected, setApiConnected] = useState<boolean>(true)
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
      setApiConnected(true)
      localStorage.setItem('gh_user', JSON.stringify(newUser))
    } catch (err: unknown) {
      console.warn('Backend login unavailable:', err)
      setApiConnected(false)
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(`Cannot reach backend (${errMsg}). Please check if server is running on port 8000.`)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const loginWithFacility = async (facilityId: string) => {
    setLoading(true)
    setError(null)
    const norm = facilityId.toLowerCase()
    const username = `lab.${norm}@goldenhour.health`
    try {
      const res = await api.login(username, 'demo2026')
      const newUser: User = {
        username: res.username,
        role: res.role,
        facility_id: res.facility_id || facilityId.toUpperCase(),
        facility_name: `Lab Station (${facilityId.toUpperCase()})`,
        token: res.token,
      }
      setUser(newUser)
      setApiConnected(true)
      localStorage.setItem('gh_user', JSON.stringify(newUser))
    } catch (err: unknown) {
      setApiConnected(false)
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(`Cannot login as lab staff for ${facilityId}: ${errMsg}`)
      throw err
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
      loginAs('clinician').catch(() => {
        // Handled via state
      })
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loginAs,
        loginWithFacility,
        logout,
        isOnline,
        apiConnected,
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
