import type { CollectionConfig } from 'payload'

import { isStaff, nobody } from '@/access/roles'

// Who belongs to which organisation, and who administers it.
// One row per (organisation, member). In WordPress this was two ACF fields on the member
// (da_member_community / da_member_community_admin); admin implies member.
export const OrganizationMembers: CollectionConfig = {
  slug: 'organization-members',
  labels: { singular: 'Organisation membership', plural: 'Organisation memberships' },
  admin: {
    defaultColumns: ['organization', 'member', 'role'],
    group: 'Membership',
  },
  access: {
    read: isStaff,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  indexes: [{ fields: ['organization', 'member'], unique: true }],
  fields: [
    { name: 'organization', type: 'relationship', relationTo: 'organizations', required: true, index: true },
    { name: 'member', type: 'relationship', relationTo: 'members', required: true, index: true },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'member',
      options: [
        { label: 'Member', value: 'member' },
        { label: 'Admin', value: 'admin' },
      ],
    },
    {
      // "<memberWpId>:<communityWpId>", the upsert key for the WordPress import.
      name: 'legacyKey',
      type: 'text',
      unique: true,
      index: true,
      access: { create: nobody, update: nobody },
      admin: { readOnly: true, position: 'sidebar', description: 'Set by the WordPress migration.' },
    },
  ],
}
