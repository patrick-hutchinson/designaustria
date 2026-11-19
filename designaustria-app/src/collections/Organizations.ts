import type { CollectionConfig } from 'payload'

import { isStaff } from '@/access/roles'
import { legacyWpIdField } from '@/fields/legacyWpId'
import {
  addressesField,
  categoriesField,
  documentsField,
  linksField,
  phonesField,
  portfolioField,
  profileStatusField,
  slugField,
} from '@/fields/profile'

// A company, studio or school. Migrated from the WordPress CPT `community`.
// Organisations have no login: people act for them through `organization-members` (role member/admin).
export const Organizations: CollectionConfig = {
  slug: 'organizations',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'memberNumber', 'partnerStatus', 'profileStatus'],
    listSearchableFields: ['name', 'memberNumber'],
    group: 'Membership',
  },
  access: {
    // Staff only for now; organisation admins editing their own page comes later (plan §5).
    read: isStaff,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Profile',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'memberNumber', type: 'text', index: true },
                {
                  name: 'partnerStatus',
                  type: 'select',
                  hasMany: true,
                  options: [
                    { label: 'Partner', value: 'partner' },
                    { label: 'Premium partner', value: 'premium' },
                    { label: 'Education (Ausbildungsstätte)', value: 'education' },
                  ],
                },
              ],
            },
            { name: 'about', type: 'textarea' },
            categoriesField,
          ],
        },
        {
          label: 'Contact',
          fields: [addressesField, phonesField, linksField],
        },
        {
          label: 'People',
          fields: [
            {
              name: 'people',
              type: 'join',
              collection: 'organization-members',
              on: 'organization',
              admin: { defaultColumns: ['member', 'role'] },
            },
          ],
        },
        {
          label: 'Portfolio & documents',
          fields: [portfolioField, documentsField],
        },
        {
          label: 'Legacy',
          fields: [
            {
              name: 'legacy',
              type: 'group',
              admin: { readOnly: true },
              fields: [
                { name: 'createdAt', type: 'date', admin: { description: 'WordPress post_date' } },
                // Attached in a later media step (plan §11).
                { name: 'logoWpId', type: 'number' },
              ],
            },
          ],
        },
      ],
    },
    { ...profileStatusField },
    slugField,
    legacyWpIdField('WordPress community post ID, set by the migration.'),
  ],
}
