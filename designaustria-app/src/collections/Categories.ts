import type { CollectionConfig } from 'payload'

import { anyone, isStaff } from '@/access/roles'
import { legacyWpIdField } from '@/fields/legacyWpId'

// Focus areas, programme types and regions (e.g. "Grafikdesign", "Ausstellung", "Wien"). Migrated from the WordPress
// `category` taxonomy: the terms used by members, organisations and events. News can reuse this collection later.
export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'parent', 'slug'],
    group: 'Membership',
  },
  access: {
    read: anyone,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', index: true, admin: { position: 'sidebar' } },
    { name: 'parent', type: 'relationship', relationTo: 'categories', admin: { position: 'sidebar' } },
    legacyWpIdField('WordPress term ID, set by the migration.'),
  ],
}
