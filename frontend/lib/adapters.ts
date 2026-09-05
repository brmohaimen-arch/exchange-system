import type { AuditLog, EquipmentResponse, MeterResponse, UserResponse } from '@/lib/api/types'
import type { AuditEntry } from '@/components/audit-trail'

export function formatDisplayId(prefix: string, numericId: number, width: number = 3) {
  const padded = String(numericId).padStart(width, '0')
  return `${prefix}-${padded}`
}

export type UiRole = string

export function getRoleLabel(roleName: UiRole | null | undefined, lang: 'en' | 'fr' | 'ar' = 'en'): string {
  const normalized = (roleName ?? '').toUpperCase()

  const labels: Record<string, { en: string; fr: string; ar: string }> = {
    ADMIN: { en: 'Administrator', fr: 'Administrateur', ar: 'مسؤول' },
    MAINTENANCE_MANAGER: { en: 'Maintenance Manager', fr: 'Responsable maintenance', ar: 'مدير الصيانة' },
    TECHNICIAN: { en: 'Technician', fr: 'Technicien', ar: 'تقني' },
    FINANCE_MANAGER: { en: 'Finance Manager', fr: 'Responsable Finance', ar: 'مدير مالي' },
  }

  return (labels[normalized] ?? { en: roleName ?? 'User', fr: roleName ?? 'Utilisateur', ar: roleName ?? 'مستخدم' })[lang]
}

export interface AuthUser {
  id: number
  name: string
  email: string
  /** Primary role name (first role, for backwards-compat display) */
  roleName: string | null
  roleId: number | null
  /** All assigned roles */
  roles: { roleId: number; roleName: string }[]
  departmentName: string | null
  departmentId: number | null
  isActive: boolean
  /** Checks if the user has ANY of the given role names */
  hasRole: (...roleNames: string[]) => boolean
}

export function mapUserResponseToAuthUser(user: UserResponse): AuthUser {
  const roles = user.roles ?? []
  const primary = roles[0] ?? null
  const hasRole = (...roleNames: string[]) =>
    roleNames.some((rn) => roles.some((r) => r.roleName.toUpperCase() === rn.toUpperCase()))
  return {
    id: user.userId,
    name: user.fullName,
    email: user.email,
    roleName: primary?.roleName ?? null,
    roleId: primary?.roleId ?? null,
    roles,
    departmentName: user.departmentName,
    departmentId: user.departmentId,
    isActive: user.isActive,
    hasRole,
  }
}

export type UiEquipmentStatus = 'OPERATIONAL' | 'UNDER_REPAIR' | 'ARCHIVED' | 'UNKNOWN'

export function mapEquipmentStatusToUi(status: string | null | undefined): UiEquipmentStatus {
  const normalized = (status ?? '').toUpperCase()
  switch (normalized) {
    case 'OPERATIONAL':
      return 'OPERATIONAL'
    case 'UNDER_REPAIR':
      return 'UNDER_REPAIR'
    case 'ARCHIVED':
      return 'ARCHIVED'
    default:
      return 'UNKNOWN'
  }
}

export function mapUiEquipmentStatusToApi(status: string): string | undefined {
  const normalized = status.toUpperCase()
  switch (normalized) {
    case 'OPERATIONAL':
    case 'UNDER_REPAIR':
    case 'ARCHIVED':
      return normalized

    // Backwards-compatible UI labels
    case 'ACTIVE':
      return 'OPERATIONAL'
    case 'OUT OF SERVICE':
      return 'UNDER_REPAIR'
    case 'RETIRED':
      return 'ARCHIVED'

    default:
      return undefined
  }
}

export type UiCriticality = 'CRITICAL' | 'MEDIUM' | 'LOW' | 'UNKNOWN'

export function mapEquipmentCriticalityToUi(criticality: string | null | undefined): UiCriticality {
  const normalized = (criticality ?? '').toUpperCase()
  switch (normalized) {
    case 'CRITICAL':
      return 'CRITICAL'
    case 'MEDIUM':
      return 'MEDIUM'
    case 'LOW':
      return 'LOW'
    default:
      return 'UNKNOWN'
  }
}

export interface UiEquipmentListItem {
  id: number
  displayId: string
  name: string
  serialNumber: string
  classification: string
  criticality: UiCriticality
  status: UiEquipmentStatus
  location: string
  departmentName: string
  createdAt?: string
}

export function mapEquipmentResponseToUiListItem(
  equipment: EquipmentResponse,
  departmentNameById: Record<number, string>
): UiEquipmentListItem {
  return {
    id: equipment.equipmentId,
    displayId: formatDisplayId('EQ', equipment.equipmentId),
    name: equipment.name,
    serialNumber: equipment.serialNumber,
    classification: equipment.classification ?? '—',
    criticality: mapEquipmentCriticalityToUi(equipment.criticality),
    status: mapEquipmentStatusToUi(equipment.status),
    location: equipment.location,
    departmentName: departmentNameById[equipment.departmentId] ?? '—',
    createdAt: equipment.createdAt,
  }
}

export type UiMeterStatus = 'normal' | 'warning' | 'critical'

export interface UiMeterCard {
  id: number
  equipmentId: number
  displayId: string
  name: string
  equipmentLabel: string
  value: number
  unit: string
  thresholds: number[]
  thresholdDetails: import('@/lib/api/types').MeterThreshold[]
  primaryThreshold: number | null
  status: UiMeterStatus
  lastReading: string | null
}

export function mapMeterResponseToUiCard(meter: MeterResponse): UiMeterCard {
  const safeName = typeof meter.name === 'string' && meter.name.trim() ? meter.name : '—'
  const safeUnit = typeof meter.unit === 'string' ? meter.unit : ''
  const safeValue = Number.isFinite(meter.value) ? meter.value : 0

  const thresholds = (meter.thresholds ?? []).filter((t) => typeof t === 'number' && Number.isFinite(t))
  const primaryThreshold = thresholds.length > 0 ? Math.max(...thresholds) : null
  const thresholdDetails = meter.thresholdDetails ?? []

  let status: UiMeterStatus = 'normal'
  
  if (thresholdDetails.length > 0) {
    let highestRatio = 0;
    for (const th of thresholdDetails) {
      if (th.thresholdValue > 0) {
        const cVal = th.currentValue ?? 0;
        const ratio = cVal / th.thresholdValue;
        if (ratio > highestRatio) highestRatio = ratio;
      }
    }
    if (highestRatio >= 1) status = 'critical'
    else if (highestRatio >= 0.8) status = 'warning'
  } else if (primaryThreshold && primaryThreshold > 0) {
    const ratio = safeValue / primaryThreshold
    if (ratio >= 1) status = 'critical'
    else if (ratio >= 0.8) status = 'warning'
  }

  return {
    id: meter.meterId,
    equipmentId: meter.equipmentId,
    displayId: formatDisplayId('MTR', meter.meterId),
    name: safeName,
    equipmentLabel: meter.equipmentName ? `${meter.equipmentName}` : `Equipment #${meter.equipmentId}`,
    value: safeValue,
    unit: safeUnit,
    thresholds,
    thresholdDetails,
    primaryThreshold,
    status,
    lastReading: meter.lastReadingAt ?? null,
  }
}

export function mapAuditLogToAuditEntry(log: AuditLog): AuditEntry {
  const actionType = (log.actionType ?? '').toUpperCase()

  let action: AuditEntry['action'] = 'update'
  if (actionType.includes('CREATE')) action = 'create'
  else if (actionType.includes('UPDATE')) action = 'update'
  else if (actionType.includes('DELETE')) action = 'delete'
  else if (actionType.includes('EXPORT')) action = 'export'
  else if (actionType.includes('STATUS')) action = 'status_change'
  else if (actionType.includes('LOGIN')) action = 'view'

  const user = log.userId ? `User #${log.userId}` : 'System'

  return {
    id: String(log.id),
    timestamp: log.createdAt,
    user,
    userRole: '—',
    action,
    description: log.details ?? actionType,
    resource: log.entityName ?? 'System',
    details: log.details,
  }
}
