"use client"

import { useState, useMemo, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { EquipmentResponse } from "@/lib/api/types"
import { useI18n } from "@/lib/i18n"

interface EquipmentSelectorProps {
  equipmentList: EquipmentResponse[]
  value: string // equipmentId
  onChange: (equipmentId: string) => void
  disabled?: boolean
}

export function EquipmentSelector({ equipmentList, value, onChange, disabled }: EquipmentSelectorProps) {
  const { t, language } = useI18n()

  // Derived from current value
  const selectedEq = useMemo(() => equipmentList.find(e => String(e.equipmentId) === value), [equipmentList, value])

  const [name, setName] = useState<string>(selectedEq?.name ?? "all")
  const [assetCode, setAssetCode] = useState<string>(selectedEq?.assetCode ?? "all")
  const [location, setLocation] = useState<string>(selectedEq?.location ?? "all")

  // Sync internal state if value changes externally
  useEffect(() => {
    if (selectedEq) {
      setName(selectedEq.name ?? "all")
      setAssetCode(selectedEq.assetCode ?? "all")
      setLocation(selectedEq.location ?? "all")
    } else {
      setName("all")
      setAssetCode("all")
      setLocation("all")
    }
  }, [selectedEq])

  // Get unique names
  const uniqueNames = useMemo(() => {
    const names = new Set<string>()
    equipmentList.forEach(e => { if (e.name) names.add(e.name) })
    return Array.from(names).sort()
  }, [equipmentList])

  // Filter equipments based on selected name
  const equipmentsByName = useMemo(() => {
    if (name === "all") return []
    return equipmentList.filter(e => e.name === name)
  }, [equipmentList, name])

  // Get unique asset codes for the selected name
  const uniqueAssetCodes = useMemo(() => {
    const codes = new Set<string>()
    equipmentsByName.forEach(e => { if (e.assetCode) codes.add(e.assetCode) })
    return Array.from(codes).sort()
  }, [equipmentsByName])

  // Get unique locations for the selected name
  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>()
    equipmentsByName.forEach(e => { if (e.location) locs.add(e.location) })
    return Array.from(locs).sort()
  }, [equipmentsByName])

  const handleNameChange = (newName: string) => {
    setName(newName)
    setAssetCode("all")
    setLocation("all")
    
    // Auto-select if only one matches
    const matches = equipmentList.filter(e => e.name === newName)
    if (matches.length === 1) {
      onChange(String(matches[0].equipmentId))
    } else {
      onChange("")
    }
  }

  const handleAssetCodeChange = (newCode: string) => {
    setAssetCode(newCode)
    const matches = equipmentsByName.filter(e => 
      (newCode === "all" || e.assetCode === newCode) && 
      (location === "all" || e.location === location)
    )
    if (matches.length === 1) {
      onChange(String(matches[0].equipmentId))
      if (matches[0].location) setLocation(matches[0].location)
    } else {
      onChange("")
    }
  }

  const handleLocationChange = (newLoc: string) => {
    setLocation(newLoc)
    const matches = equipmentsByName.filter(e => 
      (assetCode === "all" || e.assetCode === assetCode) && 
      (newLoc === "all" || e.location === newLoc)
    )
    if (matches.length === 1) {
      onChange(String(matches[0].equipmentId))
      if (matches[0].assetCode) setAssetCode(matches[0].assetCode)
    } else {
      onChange("")
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("equipment")} *</label>
        <Select value={name} onValueChange={handleNameChange} disabled={disabled}>
          <SelectTrigger className="w-full bg-background border-input">
            <SelectValue placeholder={language === 'fr' ? 'Sélectionner le nom' : 'Select Name'} />
          </SelectTrigger>
          <SelectContent>
            {uniqueNames.map(n => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ID / Asset Code</label>
        <Select value={assetCode} onValueChange={handleAssetCodeChange} disabled={disabled || name === "all" || uniqueAssetCodes.length === 0}>
          <SelectTrigger className="w-full bg-background border-input">
            <SelectValue placeholder={language === 'fr' ? 'Optionnel' : 'Optional'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{language === 'fr' ? 'Tous les IDs' : 'Any ID'}</SelectItem>
            {uniqueAssetCodes.map(code => (
              <SelectItem key={code} value={code}>{code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</label>
        <Select value={location} onValueChange={handleLocationChange} disabled={disabled || name === "all" || uniqueLocations.length === 0}>
          <SelectTrigger className="w-full bg-background border-input">
            <SelectValue placeholder={language === 'fr' ? 'Optionnel' : 'Optional'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{language === 'fr' ? 'Toutes les localisations' : 'Any Location'}</SelectItem>
            {uniqueLocations.map(loc => (
              <SelectItem key={loc} value={loc}>{loc}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
