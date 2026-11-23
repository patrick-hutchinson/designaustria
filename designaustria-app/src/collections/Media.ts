import type { CollectionConfig } from 'payload'

import { imageSizes } from '../images'

import { isStaff } from '@/access/roles'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    imageSizes: [
      { name: 'placeholder', width: 16 }, // tiny version for a blurred placeholder (LQIP)
      ...imageSizes, // the responsive widths, defined in src/images.ts
    ],
    adminThumbnail: 'sm',
    mimeTypes: ['image/*'], // images only – videos go to Mux (mux-video collection)
  },
}
