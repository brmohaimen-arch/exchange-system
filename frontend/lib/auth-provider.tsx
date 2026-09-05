'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError, CurrentUser, MfaRequiredError } from './api-client'

interface AuthContextValue {
  user: CurrentUser | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  completeMfaLogin: (userId: string, code: string) => Promise<void>
  refreshUser: () => Promise<void>
  logout: () => void
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

type LoginResult = (CurrentUser & { token: string }) | { mfaRequired: true; userId: string }

function isMfaRequired(data: LoginResult): data is { mfaRequired: true; userId: string } {
  return (data as { mfaRequired?: boolean }).mfaRequired === true
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const refreshMe = useCallback(async () => {
    try {
      const me = await api.get<CurrentUser>('/auth/me')
      setUser(me)
      localStorage.setItem('auth_user', JSON.stringify(me))
    } catch {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      setUser(null)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      setIsLoading(false)
      return
    }
    refreshMe().finally(() => setIsLoading(false))
  }, [refreshMe])

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.post<LoginResult>('/auth/login', { username, password })
    if (isMfaRequired(data)) {
      throw new MfaRequiredError(data.userId)
    }
    localStorage.setItem('auth_token', data.token)
    localStorage.setItem('auth_user', JSON.stringify(data))
    setUser(data)
    await refreshMe()
  }, [refreshMe])

  const completeMfaLogin = useCallback(async (userId: string, code: string) => {
    const data = await api.post<CurrentUser & { token: string }>('/auth/mfa/login-verify', { userId, code })
    localStorage.setItem('auth_token', data.token)
    localStorage.setItem('auth_user', JSON.stringify(data))
    setUser(data)
    await refreshMe()
  }, [refreshMe])

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    setUser(null)
    router.push('/login')
  }, [router])

  const hasPermission = useCallback(
    (permission: string) => !!user?.permissions?.includes(permission),
    [user]
  )

  return (
    <AuthContext.Provider value={{ user, isLoading, login, completeMfaLogin, refreshUser: refreshMe, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export { ApiError, MfaRequiredError }
