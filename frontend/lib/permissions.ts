/**
 * Role-Based Access Control (RBAC) configuration.
 * Defines which roles are allowed to access specific routes and actions.
 */

export const ROLES = {
  ADMIN: 'ADMIN',
  MAINTENANCE_MANAGER: 'MAINTENANCE_MANAGER',
  TECHNICIAN: 'TECHNICIAN',
  FINANCE_MANAGER: 'FINANCE_MANAGER',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * Route-level permission mapping.
 * Each key is a route pattern, and the value is an array of allowed roles.
 */
export const PAGE_PERMISSIONS: Record<string, string[]> = {
  '/work-orders':         [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER, ROLES.TECHNICIAN],
  '/work-orders/[woId]':  [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER, ROLES.TECHNICIAN],
  '/claims':              [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER],
  '/planning':            [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER],
  '/planning/kanban':     [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER],
  '/planning/calendar':   [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER],
  '/planning/regulatory': [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER],
  '/planning/gantt':      [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER],
  '/bi':                  [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER, ROLES.FINANCE_MANAGER],
  '/bi/executive':        [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER, ROLES.FINANCE_MANAGER],
  '/bi/maintenance':      [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER, ROLES.FINANCE_MANAGER],
  '/ai':                  [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER, ROLES.FINANCE_MANAGER],
  '/ai/prioritization':   [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER, ROLES.FINANCE_MANAGER],
  '/ai/predictive':       [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER, ROLES.FINANCE_MANAGER],
  '/ai/failure-analysis': [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER, ROLES.FINANCE_MANAGER],
  '/chatbot':             [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER, ROLES.FINANCE_MANAGER],
  '/admin/users':         [ROLES.ADMIN],
  '/admin/roles':         [ROLES.ADMIN],
  '/admin/reference-data':[ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER],
  '/admin/rules-thresholds':[ROLES.ADMIN],
  '/admin/audit-logs':    [ROLES.ADMIN],
  '/inventory':           [ROLES.ADMIN, ROLES.MAINTENANCE_MANAGER, ROLES.TECHNICIAN],
};

/**
 * Helper to check if a user with given roles can access a specific route.
 */
export function canAccessRoute(userRoles: string[], route: string): boolean {
  // Public routes (not in the map)
  if (!PAGE_PERMISSIONS[route]) {
    // Check for parent route permissions (e.g., /bi/executive matches /bi)
    const parentRoute = Object.keys(PAGE_PERMISSIONS).find(p => route.startsWith(p) && route !== p);
    if (parentRoute) {
      return userRoles.some(role => PAGE_PERMISSIONS[parentRoute].includes(role));
    }
    return true; 
  }

  return userRoles.some(role => PAGE_PERMISSIONS[route].includes(role));
}
