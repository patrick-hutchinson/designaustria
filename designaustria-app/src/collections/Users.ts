import type { CollectionConfig } from 'payload'

import { ROLES, hasRole, isAdmin, isAdminField, isStaffUser, nobody } from '@/access/roles'
import { legacyWpIdField } from '@/fields/legacyWpId'

// Login accounts only. A person's data (name, address, membership) lives on `members`,
// which points here via `members.user`. See migration/wordpress/docs/02-plan.md §2.2.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'roles', 'member'],
    group: 'Admin',
  },
  auth: true,
  access: {
    // Only the designaustria team gets into /admin; members use the website.
    admin: ({ req }) => isStaffUser(req.user),
    read: ({ req }) => {
      if (isStaffUser(req.user)) return true
      if (req.user) return { id: { equals: req.user.id } }
      return false
    },
    create: isAdmin,
    update: ({ req }) => {
      if (hasRole(req.user, 'admin')) return true
      if (req.user) return { id: { equals: req.user.id } }
      return false
    },
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      // The very first account (create-first-user screen) becomes admin.
      // Not for the WordPress import, which sets roles itself (and may start on an empty database).
      async ({ context, data, operation, req }) => {
        if (operation !== 'create' || context?.isMigration) return data
        const { totalDocs } = await req.payload.count({ collection: 'users', req })
        if (totalDocs === 0) data.roles = ['admin']
        return data
      },
    ],
  },
  fields: [
    // Email and password are added by `auth: true`.
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['member'],
      saveToJWT: true,
      options: ROLES.map((role) => ({ label: role[0].toUpperCase() + role.slice(1), value: role })),
      access: { create: isAdminField, update: isAdminField },
    },
    {
      name: 'member',
      type: 'join',
      collection: 'members',
      on: 'user',
      admin: { description: 'The member profile linked to this login.' },
    },
    {
      // WordPress password hash (phpass `$P$…` or `$wp$2y$…`), checked once on first login and then cleared.
      // See plan §6. Never exposed through the API or admin.
      name: 'legacyPasswordHash',
      type: 'text',
      hidden: true,
      access: { read: nobody, create: nobody, update: nobody },
    },
    legacyWpIdField('WordPress user ID, set by the migration.'),
  ],
}
