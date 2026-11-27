import type { CollectionConfig } from 'payload'

import { isStaff, nobody } from '@/access/roles'
import { legacyWpIdField } from '@/fields/legacyWpId'
import { mediaField } from '@/fields/media'
import { slugify } from '@/lib/slugify'

// Posts: the news ("Neues" on the old site, "News" in the admin and at /<locale>/news). Migrated from WordPress posts;
// field mapping: migration/wordpress/docs/04-news-plan.md §3.
// `visibility: hidden` posts are readable through the API like all others: the frontend queries filter them out.

/** Written only by the migration (Local API), never through the admin or the API. */
const locked = { access: { create: nobody, update: nobody }, admin: { readOnly: true } }

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: 'News post', plural: 'News' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'publishedAt', 'visibility'],
    listSearchableFields: ['title', 'slug'],
  },
  defaultSort: '-publishedAt',
  access: {
    read: () => true, // anyone may read posts (needed for the public website)
    // Writes are staff-only: members can log in too, and Payload's default allows any logged-in user.
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    beforeValidate: [
      // A slug from the title when staff leave it empty. Migrated posts bring their WordPress slug.
      ({ data, context }) => {
        if (!data || context.isMigration) return data
        if (!data.slug && typeof data.title === 'string') data.slug = slugify(data.title) || undefined
        return data
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'excerpt',
              type: 'textarea',
              localized: true,
              admin: { description: 'Teaser for lists (optional). Without one, the start of the text is used.' },
            },
            { name: 'body', type: 'richText', localized: true },
            mediaField({ name: 'cover', label: 'Cover image' }),
            mediaField({ name: 'gallery', label: 'Gallery', hasMany: true }),
            { name: 'documents', type: 'upload', relationTo: 'media', hasMany: true },
          ],
        },
        {
          label: 'WordPress',
          description: 'Set by the migration, read-only. The ids let the media step attach files later.',
          fields: [
            {
              name: 'legacy',
              type: 'group',
              fields: [
                { name: 'wpStatus', type: 'text', ...locked },
                { name: 'enWpId', type: 'number', ...locked, admin: { readOnly: true, description: 'WordPress ID of the English post' } },
                { name: 'authorWpId', type: 'number', ...locked, admin: { readOnly: true, description: 'WordPress user who wrote the post' } },
                { name: 'thumbnailWpId', type: 'number', ...locked, admin: { readOnly: true, description: 'Featured image' } },
                { name: 'imageWpIds', type: 'number', hasMany: true, ...locked },
                { name: 'inlineImageWpIds', type: 'number', hasMany: true, ...locked },
                { name: 'documentWpIds', type: 'number', hasMany: true, ...locked },
              ],
            },
          ],
        },
      ],
    },
    // Sidebar
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
      index: true,
      defaultValue: () => new Date().toISOString(),
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime', timeFormat: 'HH:mm' } },
    },
    {
      name: 'slug',
      type: 'text',
      localized: true,
      index: true,
      unique: true,
      admin: { position: 'sidebar', description: 'URL part, per language. Filled from the title if left empty.' },
    },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'everywhere',
      index: true,
      options: [
        { label: 'Everywhere', value: 'everywhere' },
        { label: 'Not on the homepage', value: 'notOnHome' },
        { label: 'Hidden', value: 'hidden' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true, admin: { position: 'sidebar' } },
    { name: 'tags', type: 'text', hasMany: true, admin: { position: 'sidebar' } },
    { name: 'badge', type: 'text', admin: { position: 'sidebar', description: 'e.g. DA' } },
    legacyWpIdField('WordPress post ID (German post), set by the migration.'),
  ],
}
