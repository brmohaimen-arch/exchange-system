"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  CheckCircle2, 
  Circle, 
  AlertCircle,
  Clock,
  Save,
  ShieldCheck,
  FileCheck2,
  ListTodo
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { regulatoryApi, type WoChecklist } from "@/lib/api/regulatory"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { useToast } from "@/components/ui/use-toast"

interface ChecklistItem {
  label: string
  status: 'PENDING' | 'DONE' | 'FAIL'
  mandatory: boolean
  notes?: string
}

interface ChecklistExecutionProps {
  woId: number
  isEditable?: boolean
}

export function ChecklistExecution({ woId, isEditable = true }: ChecklistExecutionProps) {
  const { language, t } = useI18n()
  const { toast } = useToast()
  
  const [checklist, setChecklist] = useState<WoChecklist | null>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        const data = await regulatoryApi.getChecklist(woId)
        setChecklist(data)
        setItems(JSON.parse(data.itemsJson))
      } catch (err) {
        console.error("No checklist found for this WO", err)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [woId])

  const handleToggle = (index: number) => {
    if (!isEditable) return
    const newItems = [...items]
    const item = newItems[index]
    item.status = item.status === 'DONE' ? 'PENDING' : 'DONE'
    setItems(newItems)
  }

  const handleNoteChange = (index: number, notes: string) => {
    if (!isEditable) return
    const newItems = [...items]
    newItems[index].notes = notes
    setItems(newItems)
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      const json = JSON.stringify(items)
      await regulatoryApi.updateChecklist(woId, json)
      toast({ title: "Success", description: "Checklist progress saved" })
    } catch (err) {
      toast({ title: "Error", description: "Failed to save checklist", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <div className="py-10 text-center animate-pulse">Loading checklist...</div>
  if (!checklist) return null

  const completionRate = items.length > 0 ? Math.round((items.filter(i => i.status === 'DONE').length / items.length) * 100) : 0

  return (
    <Card className="border-border shadow-xl rounded-2xl bg-card/40 backdrop-blur-sm overflow-hidden">
      <div className="h-1.5 w-full bg-indigo-500" />
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-indigo-500" />
            {language === 'fr' ? 'Liste de Contrôle Réglementaire' : 'Regulatory Checklist'}
          </CardTitle>
          <CardDescription>
            {language === 'fr' ? 'Validez chaque étape pour assurer la conformité.' : 'Complete every step to ensure regulatory compliance.'}
          </CardDescription>
        </div>
        <div className="text-right">
            <div className="text-xl font-black text-indigo-500">{completionRate}%</div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">{language === 'fr' ? 'Terminé' : 'Completed'}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          {items.map((item, index) => (
            <div 
                key={index} 
                className={cn(
                    "p-3 rounded-2xl border transition-all flex flex-col gap-3",
                    item.status === 'DONE' ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/30 border-border/40"
                )}
            >
              <div className="flex items-start gap-3">
                <Checkbox 
                  id={`item-${index}`}
                  checked={item.status === 'DONE'}
                  onCheckedChange={() => handleToggle(index)}
                  disabled={!isEditable}
                  className="mt-1 h-5 w-5 rounded-md"
                />
                <div className="flex-1 space-y-1">
                  <Label 
                    htmlFor={`item-${index}`}
                    className={cn(
                        "text-xs font-bold cursor-pointer transition-colors",
                        item.status === 'DONE' ? "line-through text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {item.label}
                    {item.mandatory && <span className="ml-1 text-rose-500">*</span>}
                  </Label>
                  <AnimatePresence>
                    {item.status === 'DONE' && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="pt-2"
                        >
                            <Textarea 
                                placeholder={language === 'fr' ? 'Notes / Observations...' : 'Observations / Technical notes...'}
                                className="text-xs rounded-xl bg-white/50 dark:bg-black/20 min-h-[60px]"
                                value={item.notes || ""}
                                onChange={(e) => handleNoteChange(index, e.target.value)}
                                disabled={!isEditable}
                            />
                        </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          ))}
        </div>

        {isEditable && (
            <div className="flex justify-end pt-4 border-t border-border/50">
                <Button onClick={handleSave} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-3 shadow-lg shadow-indigo-600/20">
                    {isSaving ? <Clock className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    {language === 'fr' ? 'Enregistrer la Progression' : 'Save Progress'}
                </Button>
            </div>
        )}
      </CardContent>
    </Card>
  )
}
