import { Language } from "./i18n"

export type StatusKey = 
  | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED' | 'CREATED' | 'ASSIGNED' 
  | 'UNDER_CONTROL' | 'OVERDUE' | 'OPEN' | 'QUALIFIED' | 'UNDER_REPAIR' 
  | 'OPERATIONAL' | 'ARCHIVED' | 'RETIRED' | 'OUT_OF_SERVICE' | 'IN_SERVICE'

export type PriorityKey = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type WorkOrderTypeKey = 'CORRECTIVE' | 'PREVENTIVE' | 'REGULATORY' | 'PREDICTIVE'
export type EquipmentTypeKey = 'BIOMEDICAL' | 'TECHNICAL' | 'IT' | 'UNKNOWN'
export type TaskStatusKey = 'PENDING' | 'COMPLETED' | 'SKIPPED'
export type AIDecisionKey = 'EARLY_WARNING' | 'NORMAL_MONITORING'
export type PredictiveRiskKey = 'HIGH' | 'MEDIUM' | 'LOW'

export const ENUM_TRANSLATIONS: Record<string, Record<string, Record<Language, string>>> = {
  status: {
    PENDING: { en: "Pending", fr: "En attente", ar: "قيد الانتظار" },
    IN_PROGRESS: { en: "In Progress", fr: "En cours", ar: "قيد التنفيذ" },
    COMPLETED: { en: "Completed", fr: "Terminé", ar: "مكتمل" },
    CLOSED: { en: "Closed", fr: "Fermé", ar: "مغلق" },
    CREATED: { en: "Created", fr: "Créé", ar: "تم الإنشاء" },
    ASSIGNED: { en: "Assigned", fr: "Assigné", ar: "تم التعيين" },
    UNDER_CONTROL: { en: "Under Control", fr: "Sous contrôle", ar: "تحت السيطرة" },
    OVERDUE: { en: "Overdue", fr: "En retard", ar: "متأخر" },
    OPEN: { en: "Open", fr: "Ouvert", ar: "مفتوح" },
    QUALIFIED: { en: "Qualified", fr: "Qualifié", ar: "مؤهل" },
    UNDER_REPAIR: { en: "Under Repair", fr: "En réparation", ar: "قيد الإصلاح" },
    OPERATIONAL: { en: "Operational", fr: "Opérationnel", ar: "جاهز للعمل" },
    ARCHIVED: { en: "Archived", fr: "Archivé", ar: "مؤرشف" },
    RETIRED: { en: "Retired", fr: "Retiré", ar: "خارج الخدمة" },
    OUT_OF_SERVICE: { en: "Out of Service", fr: "Hors service", ar: "خارج الخدمة" },
    IN_SERVICE: { en: "In Service", fr: "En service", ar: "في الخدمة" },
    NEW: { en: "New", fr: "Nouveau", ar: "جديد" },
    RESOLVED: { en: "Resolved", fr: "Résolu", ar: "تم الحل" },
    REJECTED: { en: "Rejected", fr: "Rejeté", ar: "مرفوض" },
    CONVERTED_TO_WORK_ORDER: { en: "In WO", fr: "En OT", ar: "في أمر عمل" },
    // Task statuses
    TODO: { en: "To Do", fr: "À faire", ar: "للقيام به" },
    DONE: { en: "Done", fr: "Terminé", ar: "منجز" },
    PASS: { en: "Pass", fr: "Réussi", ar: "ناجح" },
    FAIL: { en: "Fail", fr: "Échoué", ar: "فاشل" },
    BLOCKED: { en: "Blocked", fr: "Bloqué", ar: "معطل" },
    APPROVED: { en: "Approved", fr: "Approuvé", ar: "موافق عليه" },
    SCHEDULED: { en: "Scheduled", fr: "Planifié", ar: "مجدول" },
    VALIDATED: { en: "Validated", fr: "Validé", ar: "تم التحقق" },
    CANCELLED: { en: "Cancelled", fr: "Annulé", ar: "ملغى" },
    ON_HOLD: { en: "On Hold", fr: "En attente", ar: "معلق" },
    // Regulatory plan statuses
    DUE_SOON: { en: "Due Soon", fr: "Bientôt dû", ar: "قريب الاستحقاق" },
    UPCOMING: { en: "Upcoming", fr: "À venir", ar: "قادم" },
  },
  priority: {
    CRITICAL: { en: "Critical", fr: "Critique", ar: "حرجة" },
    HIGH: { en: "High", fr: "Haute", ar: "عالية" },
    MEDIUM: { en: "Medium", fr: "Moyenne", ar: "متوسطة" },
    LOW: { en: "Low", fr: "Basse", ar: "منخفضة" },
  },
  woType: {
    CORRECTIVE: { en: "Corrective", fr: "Correctif", ar: "تصحيحي" },
    PREVENTIVE: { en: "Preventive", fr: "Préventif", ar: "وقائي" },
    REGULATORY: { en: "Regulatory", fr: "Réglementaire", ar: "تنظيمي" },
    PREDICTIVE: { en: "Predictive", fr: "Prédictif", ar: "تنبؤي" },
  },
  equipmentType: {
    BIOMEDICAL: { en: "Biomedical", fr: "Biomédical", ar: "بيولوجي طبي" },
    TECHNICAL: { en: "Technical", fr: "Technique", ar: "تقني" },
    IT: { en: "IT", fr: "Informatique", ar: "معلوماتي" },
    UNKNOWN: { en: "Unknown", fr: "Inconnu", ar: "غير معروف" },
  },
  taskStatus: {
    PENDING: { en: "Pending", fr: "En attente", ar: "قيد الانتظار" },
    COMPLETED: { en: "Completed", fr: "Terminé", ar: "مكتمل" },
    SKIPPED: { en: "Skipped", fr: "Ignoré", ar: "تخطي" },
  },
  aiDecision: {
    EARLY_WARNING: { en: "Early Warning", fr: "Alerte précoce", ar: "تحذير مبكر" },
    NORMAL_MONITORING: { en: "Normal Monitoring", fr: "Surveillance normale", ar: "مراقبة عادية" },
  },
  predictiveRisk: {
    HIGH: { en: "High Risk", fr: "Risque élevé", ar: "خطر عالٍ" },
    MEDIUM: { en: "Medium Risk", fr: "Risque moyen", ar: "خطر متوسط" },
    LOW: { en: "Low Risk", fr: "Risque faible", ar: "خطر منخفض" },
  },
  criticality: {
    CRITICAL: { en: "Critical", fr: "Critique", ar: "حرج" },
    HIGH: { en: "High", fr: "Élevé", ar: "عالي" },
    MEDIUM: { en: "Medium", fr: "Moyen", ar: "متوسط" },
    LOW: { en: "Low", fr: "Faible", ar: "منخفض" },
  },
  classification: {
    BIOMEDICAL: { en: "Biomedical", fr: "Biomédical", ar: "طبي حيوي" },
    TECHNICAL: { en: "Technical", fr: "Technique", ar: "تقني" },
    IT: { en: "IT", fr: "Informatique", ar: "تقنية المعلومات" },
    IMAGING: { en: "Imaging", fr: "Imagerie", ar: "تصوير" },
    LABORATORY: { en: "Laboratory", fr: "Laboratoire", ar: "مختبر" },
    LIFE_SUPPORT: { en: "Life Support", fr: "Assistance vitale", ar: "دعم الحياة" },
    MONITORING: { en: "Monitoring", fr: "Surveillance", ar: "مراقبة" },
    SURGICAL: { en: "Surgical", fr: "Chirurgical", ar: "جراحي" },
    NEONATAL: { en: "Neonatal", fr: "Néonatal", ar: "حديثي الولادة" },
    DENTAL: { en: "Dental", fr: "Dentaire", ar: "أسنان" },
    OPHTHALMOLOGY: { en: "Ophthalmology", fr: "Ophtalmologie", ar: "طب العيون" },
    ENT: { en: "ENT", fr: "ORL", ar: "أنف وأذن وحنجرة" },
    REHABILITATION: { en: "Rehabilitation", fr: "Rééducation", ar: "إعادة تأهيل" },
    STERILIZATION: { en: "Sterilization", fr: "Stérilisation", ar: "تعقيم" },
    INFORMATION_SYSTEM: { en: "Information System", fr: "Système d'information", ar: "نظام معلومات" },
    LOGISTICS: { en: "Logistics", fr: "Logistique", ar: "لوجستيات" },
  },
  recurrenceUnit: {
    DAYS: { en: "Days", fr: "Jours", ar: "أيام" },
    WEEKS: { en: "Weeks", fr: "Semaines", ar: "أسابيع" },
    MONTHS: { en: "Months", fr: "Mois", ar: "أشهر" },
    YEARS: { en: "Years", fr: "Années", ar: "سنوات" },
  }
}

export function translateEnum(category: string, key: string | undefined | null, lang: Language): string {
  if (!key) return ""
  const normalizedKey = key.toUpperCase().replace(/\s+/g, '_')
  return ENUM_TRANSLATIONS[category]?.[normalizedKey]?.[lang] || key
}

export const translateStatus = (val: string | undefined | null, lang: Language) => translateEnum('status', val, lang)
export const translatePriority = (val: string | undefined | null, lang: Language) => translateEnum('priority', val, lang)
export const translateWorkOrderType = (val: string | undefined | null, lang: Language) => translateEnum('woType', val, lang)
export const translateEquipmentType = (val: string | undefined | null, lang: Language) => translateEnum('equipmentType', val, lang)
export const translateTaskStatus = (val: string | undefined | null, lang: Language) => translateEnum('taskStatus', val, lang)
export const translateAIDecision = (val: string | undefined | null, lang: Language) => translateEnum('aiDecision', val, lang)
export const translatePredictiveRisk = (val: string | undefined | null, lang: Language) => translateEnum('predictiveRisk', val, lang)
export const translateCriticality = (val: string | undefined | null, lang: Language) => translateEnum('criticality', val, lang)
export const translateClassification = (val: string | undefined | null, lang: Language) => translateEnum('classification', val, lang)
export const translateRecurrenceUnit = (val: string | undefined | null, lang: Language) => translateEnum('recurrenceUnit', val, lang)
