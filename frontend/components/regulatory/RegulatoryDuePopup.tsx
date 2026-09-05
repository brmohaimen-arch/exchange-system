"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  ShieldAlert, 
  ArrowRight, 
  X, 
  Calendar, 
  Clock,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  Wrench
} from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { regulatoryApi, type RegulatoryPlanResponse } from "@/lib/api/regulatory"
import { useI18n } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

export function RegulatoryDuePopup() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const { language, t } = useI18n()
  const router = useRouter()
  const [plans, setPlans] = useState<RegulatoryPlanResponse[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return

    // Restriction: Only Admins and Maintenance Managers see this compliance popup
    const allowedRoles = ['ADMIN', 'MAINTENANCE_MANAGER']
    if (!user || !user.roleName || !allowedRoles.includes(user.roleName.toUpperCase())) {
      return
    }

    // Only show once per session unless a new critical plan appears
    const dismissed = sessionStorage.getItem('regulatory-popup-dismissed')
    if (dismissed) return

    const load = async () => {
      try {
        const data = await regulatoryApi.list()
        const duePlans = data.filter(p => p.isActive && (p.status === 'OVERDUE' || p.status === 'DUE_SOON'))
        
        if (duePlans.length > 0) {
          setPlans(duePlans)
          setIsOpen(true)
        }
      } catch (err) {
        console.error("Failed to check regulatory plans", err)
      }
    }
    load()
  }, [isAuthenticated, isAuthLoading])

  const handleDismiss = () => {
    setIsOpen(false)
    sessionStorage.setItem('regulatory-popup-dismissed', 'true')
  }

  const handleView = (id: number) => {
    handleDismiss()
    router.push(`/planning/regulatory/${id}`)
  }

  const handleGenerateWO = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    try {
      await regulatoryApi.generateWorkOrder(id)
      setPlans(prev => prev.filter(p => p.planId !== id))
      // If no plans left, close the popup
      if (plans.length <= 1) {
        handleDismiss()
      }
    } catch (err) {
      console.error("Failed to generate work order", err)
      alert("Failed to generate work order")
    }
  }

  if (plans.length === 0) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      // Prevent closing by clicking outside or ESC
      if (!open) return;
      setIsOpen(open);
    }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border shadow-2xl p-0 overflow-hidden rounded-3xl">
        <div className="h-2 w-full bg-primary" />
        <div className="p-3 space-y-6">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3 text-primary mb-2">
                <div className="bg-primary/10 p-2 rounded-xl">
                    <ShieldAlert className="h-6 w-6" />
                </div>
                <DialogTitle className="text-lg sm:text-xl font-black uppercase tracking-tight">
                    {language === 'fr' ? 'Maintenance Réglementaire Échue' : 'Regulatory Maintenance Due'}
                </DialogTitle>
            </div>
            <DialogDescription className="text-xs font-medium text-muted-foreground">
                {language === 'fr' 
                  ? 'Des interventions obligatoires ont atteint leur date d’échéance. Veuillez les traiter pour assurer la conformité.' 
                  : 'Mandatory interventions have reached their due date. Please address them to ensure compliance.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {plans.map(plan => (
              <div 
                key={plan.planId} 
                className="group p-3 rounded-2xl bg-muted/40 border border-border/50 hover:bg-muted/60 hover:border-primary/30 transition-all relative overflow-hidden"
              >
                <div className="flex justify-between items-start relative z-10">
                    <div className="space-y-1 flex-1 min-w-0" onClick={() => handleView(plan.planId)} style={{cursor: 'pointer'}}>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-primary">{plan.planCode}</span>
                            <Badge className={cn("text-[9px] h-4 px-1.5", plan.status === 'OVERDUE' ? 'bg-rose-500' : 'bg-amber-500')}>
                                {plan.status}
                            </Badge>
                        </div>
                        <h4 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">{plan.title}</h4>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-medium">
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(plan.nextDueDate).toLocaleDateString()}</span>
                            <span className="bg-amber-500/10 text-amber-600 px-1.5 rounded">{plan.equipmentName}</span>
                        </div>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={(e) => handleGenerateWO(e, plan.planId)}
                      className="ml-2 bg-primary hover:bg-primary/90 text-primary-foreground h-9 shadow-lg shadow-primary/20"
                    >
                      <Wrench className="h-3.5 w-3.5 mr-2" />
                      {language === 'fr' ? 'Générer OT' : 'Generate WO'}
                    </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>

  )
}
