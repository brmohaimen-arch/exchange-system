"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Circle, AlertCircle, ArrowRight } from "lucide-react"

export type WorkflowType = "incident" | "preventive" | "meter-based"

export interface WorkflowStep {
  id: string
  name: string
  status: "pending" | "in-progress" | "completed" | "skipped"
  timestamp?: string
  actor?: string
}

export interface WorkflowState {
  id: string
  type: WorkflowType
  title: string
  status: "active" | "completed" | "failed"
  currentStep: number
  steps: WorkflowStep[]
  createdAt: string
  completedAt?: string
  resources?: {
    equipment?: string
    claim?: string
    workOrder?: string
  }
}

const getWorkflowDefinition = (type: WorkflowType) => {
  const definitions: Record<WorkflowType, string[]> = {
    incident: [
      "Réclamation",
      "Qualification",
      "Affectation",
      "OT",
      "Intervention",
      "Clôture",
      "KPI",
    ],
    preventive: [
      "Planification",
      "OT Automatique",
      "Affectation",
      "Exécution",
      "Clôture",
    ],
    "meter-based": [
      "Seuil Détecté",
      "OT Généré",
      "Affectation",
      "Exécution",
      "Clôture",
    ],
  }
  return definitions[type]
}

const getStepIcon = (status: string) => {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
    case "in-progress":
      return <AlertCircle className="h-5 w-5 text-blue-500" />
    case "skipped":
      return <Circle className="h-5 w-5 text-muted-foreground" />
    default:
      return <Circle className="h-5 w-5 text-muted-foreground" />
  }
}

const getStepColor = (status: string, isActive: boolean) => {
  if (isActive) return "bg-blue-50 border-blue-200"
  switch (status) {
    case "completed":
      return "bg-emerald-50 border-emerald-200"
    case "in-progress":
      return "bg-blue-50 border-blue-200"
    case "skipped":
      return "bg-muted border-border"
    default:
      return "bg-background border-border"
  }
}

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
}

interface WorkflowTrackerProps {
  workflow: WorkflowState
}

export function WorkflowTracker({ workflow }: WorkflowTrackerProps) {
  const definition = getWorkflowDefinition(workflow.type)
  const workflowTypeLabel: Record<WorkflowType, string> = {
    incident: "Incident Workflow",
    preventive: "Preventive Maintenance",
    "meter-based": "Meter-based Maintenance",
  }

  return (
    <motion.div initial="initial" animate="animate" variants={fadeInUp}>
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{workflow.title}</CardTitle>
              <CardDescription className="mt-1">
                {workflowTypeLabel[workflow.type]}
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={
                workflow.status === "completed"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : workflow.status === "failed"
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-blue-50 text-blue-700 border-blue-200"
              }
            >
              {workflow.status === "active" ? "In Progress" : workflow.status}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Workflow Steps */}
          <div className="space-y-0">
            {definition.map((stepName, index) => {
              const step = workflow.steps[index]
              const isActive = workflow.currentStep === index
              const isCompleted =
                step?.status === "completed" ||
                workflow.currentStep > index

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex items-start gap-2 md:gap-3 pb-6 last:pb-0">
                    {/* Step Icon and Line */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-8 w-10 items-center justify-center rounded-full border-2 transition-all ${
                          isCompleted
                            ? "border-emerald-500 bg-emerald-50"
                            : isActive
                            ? "border-blue-500 bg-blue-50"
                            : "border-border bg-background"
                        }`}
                      >
                        {getStepIcon(step?.status || "pending")}
                      </div>
                      {index < definition.length - 1 && (
                        <div
                          className={`mt-2 w-0.5 h-12 transition-colors ${
                            isCompleted
                              ? "bg-emerald-300"
                              : isActive
                              ? "bg-blue-300"
                              : "bg-border"
                          }`}
                        />
                      )}
                    </div>

                    {/* Step Content */}
                    <div
                      className={`flex-1 rounded-lg border-2 p-3 transition-all ${getStepColor(
                        step?.status || "pending",
                        isActive
                      )}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-foreground">
                            {stepName}
                          </h4>
                          {step && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Status:{" "}
                              <span className="font-medium capitalize">
                                {step.status.replace(/-/g, " ")}
                              </span>
                            </p>
                          )}
                          {step?.actor && (
                            <p className="text-xs text-muted-foreground">
                              By: <span className="font-medium">{step.actor}</span>
                            </p>
                          )}
                          {step?.timestamp && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(step.timestamp).toLocaleString()}
                            </p>
                          )}
                        </div>
                        {isCompleted && (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Resource Links */}
          {workflow.resources && Object.values(workflow.resources).some(Boolean) && (
            <div className="border-t pt-4 space-y-2">
              <h4 className="font-semibold text-xs text-foreground">
                Related Resources
              </h4>
              <div className="flex flex-wrap gap-2">
                {workflow.resources.equipment && (
                  <Badge variant="secondary">Equip: {workflow.resources.equipment}</Badge>
                )}
                {workflow.resources.claim && (
                  <Badge variant="secondary">Claim: {workflow.resources.claim}</Badge>
                )}
                {workflow.resources.workOrder && (
                  <Badge variant="secondary">WO: {workflow.resources.workOrder}</Badge>
                )}
              </div>
            </div>
          )}

          {/* Timeline Info */}
          <div className="border-t pt-4 grid grid-cols-2 gap-2 md:gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium text-foreground">
                {new Date(workflow.createdAt).toLocaleDateString()}
              </p>
            </div>
            {workflow.completedAt && (
              <div>
                <p className="text-muted-foreground">Completed</p>
                <p className="font-medium text-foreground">
                  {new Date(workflow.completedAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
