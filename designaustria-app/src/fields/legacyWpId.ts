import type { NumberField } from 'payload'

import { nobody } from '@/access/roles'

/**
 * The WordPress ID a document was migrated from.
 * The WordPress import (migration/wordpress) upserts by this field, so reruns update instead of duplicating.
 * Not editable through the admin or the API; only the Local API (overrideAccess) writes it.
 */
export const legacyWpIdField = (description = 'WordPress ID, set by the migration.'): NumberField => ({
  name: 'legacyWpId',
  type: 'number',
  unique: true,
  index: true,
  access: { create: nobody, update: nobody },
  admin: {
    readOnly: true,
    position: 'sidebar',
    description,
  },
})
