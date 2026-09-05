"use client"

import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { authApi } from "@/lib/api/auth"
import { clearAuthToken, getAuthToken, setAuthToken } from "@/lib/api/client"
import { getRoleLabel as getRoleLabelImpl, mapUserResponseToAuthUser, type AuthUser } from "@/lib/adapters"

export interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = async () => {
    const token = getAuthToken()
    if (!token) {
      setUser(null)
      return
    }
    const me = await authApi.me()
    setUser(mapUserResponseToAuthUser(me))
  }

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        if (!getAuthToken()) {
          if (!cancelled) setUser(null)
          return
        }
        const me = await authApi.me()
        if (!cancelled) setUser(mapUserResponseToAuthUser(me))
      } catch {
        clearAuthToken()
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  const login = async (email: string, password: string) => {
    const response = await authApi.login({ email, password })
    setAuthToken(response.accessToken)
    setUser(mapUserResponseToAuthUser(response.user))
  }

  const logout = () => {
    clearAuthToken()
    setUser(null)
  }

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      refresh,
    }),
    [user, isLoading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export function getRoleLabel(roleName: string | null | undefined, lang: "en" | "fr" | "ar" = "en"): string {
  return getRoleLabelImpl(roleName, lang)
}
