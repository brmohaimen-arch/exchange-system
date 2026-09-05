export const getStatusColorVar = (status: string, scope: string = "GLOBAL") => {
  const slug = status.toLowerCase().replace(/_/g, '-');
  if (scope === "GLOBAL") return `var(--color-status-${slug}, #3B82F6)`;
  
  const scopeSlug = scope.toLowerCase().replace(/_/g, '-');
  return `var(--color-status-${slug}-${scopeSlug}, var(--color-status-${slug}, #3B82F6))`;
};

export const getStatusTextColorVar = (status: string, scope: string = "GLOBAL") => {
  const slug = status.toLowerCase().replace(/_/g, '-');
  if (scope === "GLOBAL") return `var(--color-status-${slug}-text, #FFFFFF)`;
  
  const scopeSlug = scope.toLowerCase().replace(/_/g, '-');
  return `var(--color-status-${slug}-${scopeSlug}-text, var(--color-status-${slug}-text, #FFFFFF))`;
};

export const getStatusColorClass = (status: string, scope: string = "GLOBAL") => {
  const slug = status.toLowerCase().replace(/_/g, '-');
  const scopeSuffix = scope === "GLOBAL" ? "" : `-${scope.toLowerCase().replace(/_/g, '-')}`;
  return `status-${slug}${scopeSuffix}`;
};

export const getMaintenanceColorVar = (type: string, scope: string = "GLOBAL") => {
  const slug = type.toLowerCase().replace(/_/g, '-');
  if (scope === "GLOBAL") return `var(--color-maintenance-type-${slug}, #6366F1)`;
  
  const scopeSlug = scope.toLowerCase().replace(/_/g, '-');
  return `var(--color-maintenance-type-${slug}-${scopeSlug}, var(--color-maintenance-type-${slug}, #6366F1))`;
};

export const getNotificationColorVar = (type: string, scope: string = "GLOBAL") => {
  const slug = type.toLowerCase().replace(/_/g, '-');
  if (scope === "GLOBAL") return `var(--color-notification-${slug}, #6B7280)`;
  
  const scopeSlug = scope.toLowerCase().replace(/_/g, '-');
  return `var(--color-notification-${slug}-${scopeSlug}, var(--color-notification-${slug}, #6B7280))`;
};
