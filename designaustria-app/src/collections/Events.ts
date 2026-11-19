import type { CollectionConfig } from 'payload'

// A collection = a content type. Payload creates the database table,
// the admin UI ("Events" in the sidebar) and the API from this one file.
export const Events: CollectionConfig = {
  slug: 'events', // used in the API (/api/events) and in code: collection: 'events'
  admin: {
    useAsTitle: 'title', // which field names each entry in the admin list
    defaultColumns: ['title', 'date', 'location'],
  },
  access: {
    read: () => true, // anyone may read events (needed for the public website)
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true, // separate German and English value
    },
    {
      name: 'date',
      type: 'date',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'location',
      type: 'text',
      required: true,
      localized: true, // separate German and English value
    },
    {
      name: 'media',
      type: 'upload', // pick or upload a file from the Media collection
      relationTo: 'media',
    },
    {
      name: 'description',
      type: 'richText', // Lexical editor (set in payload.config.ts), stored as JSON
      localized: true,
    },
  ],
}
