"use client"

import { useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Spinner } from "@/components/ui/spinner"
import { ShieldAlert } from "lucide-react"
import { motion } from "framer-motion"
import { useI18n } from "@/lib/i18n"

interface RouteGuardProps {
  children: ReactNode
  allowedRoles?: string[]
}

export function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const { t } = useI18n()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login")
    }
  }, [isLoading, isAuthenticated, router])

  if (isLoading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Spinner size="lg" className="text-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  // If roles are specified, check if user has at least one of them
  if (allowedRoles && allowedRoles.length > 0) {
    const hasPermission = user?.hasRole(...allowedRoles)
    
    if (!hasPermission) {
      return (
        <div className="flex h-[80vh] w-full items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full bg-card border border-border rounded-xl p-8 shadow-xl text-center space-y-6"
          >
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                {t("accessDenied") || "Access Denied"}
              </h2>
              <p className="text-muted-foreground">
                {t("noPermissionMessage") || "You do not have the required permissions to access this page. Please contact your administrator if you believe this is an error."}
              </p>
            </div>
            <button 
              onClick={() => router.push("/dashboard")}
              className="w-full inline-flex justify-center items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-all duration-200"
            >
              {t("backToDashboard") || "Back to Dashboard"}
            </button>
          </motion.div>
        </div>
      )
    }
  }

  return <>{children}</>
}
