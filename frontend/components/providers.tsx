"use client"

import type { ReactNode } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { I18nProvider } from "@/lib/i18n"
import { AuthProvider } from "@/lib/auth-context"
import { ColorsProvider } from "@/lib/colors-context"
import { Toaster } from "@/components/ui/sonner"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <I18nProvider>
        <AuthProvider>
          <ColorsProvider>
            {children}
          </ColorsProvider>
          <Toaster richColors closeButton position="top-right" />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
