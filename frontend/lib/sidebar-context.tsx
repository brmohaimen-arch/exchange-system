'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface SidebarContextValue {
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <SidebarContext.Provider value={{ mobileOpen, setMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebarState() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebarState must be used within SidebarProvider')
  return ctx
}
