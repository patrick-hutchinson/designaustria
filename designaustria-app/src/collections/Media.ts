import type { CollectionConfig } from 'payload'

import { imageSizes } from '../images'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    staticDir: 'media',
    imageSizes: [
      { name: 'placeholder', width: 16 }, // tiny version for a blurred placeholder (LQIP)
      ...imageSizes, // the responsive widths, defined in src/images.ts
    ],
    adminThumbnail: 'sm',
    mimeTypes: ['image/*', 'video/*'], // only images and videos can be uploaded
  },
}
