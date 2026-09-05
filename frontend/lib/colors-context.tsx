"use client"

import React, { createContext, useContext, useEffect, useState, useMemo } from "react"
import { useAuth } from "./auth-context"
import { getApiBaseUrl, requestJson } from "./api/client"

export interface ColorSettings {
  id: number
  category: string
  itemKey: string
  scope: string
  colorHex: string
  textColorHex: string
  defaultColorHex: string
  defaultTextColorHex: string
  isSystemDefault: boolean
  active: boolean
}

interface ColorsContextType {
  colors: ColorSettings[]
  isLoading: boolean
  refreshColors: () => Promise<void>
  getColor: (category: string, itemKey: string, scope?: string) => string | undefined
  getTextColor: (category: string, itemKey: string, scope?: string) => string | undefined
}

const ColorsContext = createContext<ColorsContextType | undefined>(undefined)

export function ColorsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [colors, setColors] = useState<ColorSettings[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadColors = async () => {
    try {
      const data = await requestJson<ColorSettings[]>('/settings/colors')
      if (data) {
        setColors(data)
      }
    } catch (error) {
      console.error("Failed to load color settings:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadColors()
    } else {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  const getColor = (category: string, itemKey: string, scope: string = "GLOBAL") => {
    const setting = colors.find(c => c.category === category && c.itemKey === itemKey && (c.scope === scope || c.scope === "GLOBAL"))
    return setting?.colorHex
  }

  const getTextColor = (category: string, itemKey: string, scope: string = "GLOBAL") => {
    const setting = colors.find(c => c.category === category && c.itemKey === itemKey && (c.scope === scope || c.scope === "GLOBAL"))
    return setting?.textColorHex
  }

  // Inject CSS variables for colors
  useEffect(() => {
    if (colors.length === 0) return

    const styleEl = document.getElementById("dynamic-color-settings")
    let styleSheet = styleEl as HTMLStyleElement
    
    if (!styleSheet) {
      styleSheet = document.createElement("style")
      styleSheet.id = "dynamic-color-settings"
      document.head.appendChild(styleSheet)
    }

    let cssText = ":root {\n"
    
    colors.forEach(c => {
      if (!c.active) return
      
      const categorySlug = c.category.toLowerCase().replace(/_/g, '-')
      const itemSlug = c.itemKey.toLowerCase().replace(/_/g, '-')
      const scopeSuffix = c.scope === "GLOBAL" ? "" : `-${c.scope.toLowerCase().replace(/_/g, '-')}`
      
      const varNameBase = `--color-${categorySlug}-${itemSlug}${scopeSuffix}`
      cssText += `  ${varNameBase}: ${c.colorHex};\n`
      cssText += `  ${varNameBase}-text: ${c.textColorHex};\n`
      
      // Attempt to parse hex to rgb for opacity utilities
      const hex = c.colorHex.replace('#', '')
      if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16)
        const g = parseInt(hex.substring(2, 4), 16)
        const b = parseInt(hex.substring(4, 6), 16)
        cssText += `  ${varNameBase}-rgb: ${r}, ${g}, ${b};\n`
      }
    })
    
    cssText += "}\n"
    styleSheet.textContent = cssText

  }, [colors])

  const value = useMemo(() => ({
    colors,
    isLoading,
    refreshColors: loadColors,
    getColor,
    getTextColor
  }), [colors, isLoading])

  return (
    <ColorsContext.Provider value={value}>
      {children}
    </ColorsContext.Provider>
  )
}

export function useColors() {
  const context = useContext(ColorsContext)
  if (context === undefined) {
    throw new Error("useColors must be used within a ColorsProvider")
  }
  return context
}
