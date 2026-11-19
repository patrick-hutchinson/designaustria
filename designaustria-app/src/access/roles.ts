import type { Access, FieldAccess } from 'payload'

// Roles live on the `users` collection (saved to the JWT, so no DB lookup per check).
// admin  – full access, manages users and roles
// staff  – designaustria team: manages members, organisations, categories
// member – a member logging in on the website; no admin panel
export const ROLES = ['admin', 'staff', 'member'] as const
export type Role = (typeof ROLES)[number]

type MaybeUser = { id?: number | string; roles?: (Role | string)[] | null } | null | undefined

export const hasRole = (user: MaybeUser, ...roles: Role[]): boolean =>
  Boolean(user?.roles?.some((role) => (roles as string[]).includes(role)))

export const isStaffUser = (user: MaybeUser): boolean => hasRole(user, 'admin', 'staff')

export const anyone: Access = () => true
export const isAdmin: Access = ({ req }) => hasRole(req.user, 'admin')
export const isStaff: Access = ({ req }) => isStaffUser(req.user)

export const isAdminField: FieldAccess = ({ req }) => hasRole(req.user, 'admin')
export const isStaffField: FieldAccess = ({ req }) => isStaffUser(req.user)
export const nobody: FieldAccess = () => false

/** Staff, or the member whose profile this is (`doc.user` points to the logged-in user). */
export const isStaffOrProfileOwnerField: FieldAccess = ({ req, doc }) => {
  if (isStaffUser(req.user)) return true
  if (!req.user || !doc?.user) return false
  const ownerId = typeof doc.user === 'object' ? doc.user.id : doc.user
  return ownerId === req.user.id
}
