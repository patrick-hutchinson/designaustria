import type { CollectionConfig } from 'payload'

import { isStaff, nobody } from '@/access/roles'
import { legacyWpIdField } from '@/fields/legacyWpId'
import { mediaField } from '@/fields/media'
import { slugify } from '@/lib/slugify'

// Events (exhibitions, talks, workshops, …). Migrated from the WordPress CPT `event`;
// field mapping: migration/wordpress/docs/03-events-plan.md §3.
// `visibility: hidden` events are readable through the API like all others: the frontend queries filter them out.

/** Written only by the migration (Local API), never through the admin or the API. */
const locked = { access: { create: nobody, update: nobody }, admin: { readOnly: true } }

export const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'startsAt', 'type', 'visibility'],
    listSearchableFields: ['title', 'slug'],
  },
  defaultSort: '-startsAt',
  access: {
    read: () => true, // anyone may read events (needed for the public website)
    // Writes are staff-only: members can log in too, and Payload's default allows any logged-in user.
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    beforeValidate: [
      // A slug from the title when staff leave it empty. Migrated events bring their WordPress slug.
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
      type: 'row',
      fields: [
        {
          name: 'startsAt',
          type: 'date',
          required: true,
          index: true,
          admin: { date: { pickerAppearance: 'dayAndTime', timeFormat: 'HH:mm' } },
        },
        { name: 'endsAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime', timeFormat: 'HH:mm' } } },
      ],
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'description', type: 'richText', localized: true },
            mediaField({ name: 'gallery', label: 'Gallery', hasMany: true }),
            { name: 'documents', type: 'upload', relationTo: 'media', hasMany: true },
            {
              name: 'links',
              type: 'array',
              labels: { singular: 'Link', plural: 'Links' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'url', type: 'text', required: true },
                    { name: 'label', type: 'text', admin: { description: 'Shown instead of the URL (optional).' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Venue & admission',
          fields: [
            {
              name: 'venue',
              type: 'group',
              fields: [
                { name: 'name', type: 'textarea', localized: true, admin: { description: 'Venue name, e.g. designforum Wien.' } },
                { name: 'street', type: 'text', admin: { description: 'Street and number' } },
                {
                  type: 'row',
                  fields: [
                    { name: 'zip', type: 'text' },
                    { name: 'city', type: 'text' },
                    { name: 'country', type: 'text', admin: { description: 'ISO code, e.g. AT' } },
                  ],
                },
              ],
            },
            {
              name: 'admission',
              type: 'group',
              fields: [
                { name: 'show', type: 'checkbox', label: 'Show prices', defaultValue: true },
                {
                  name: 'prices',
                  type: 'array',
                  labels: { singular: 'Price', plural: 'Prices' },
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        {
                          name: 'kind',
                          type: 'select',
                          required: true,
                          defaultValue: 'regular',
                          options: [
                            { label: 'Regular', value: 'regular' },
                            { label: 'Reduced', value: 'reduced' },
                            { label: 'designaustria members', value: 'members' },
                            { label: 'Other', value: 'other' },
                          ],
                        },
                        { name: 'label', type: 'text', localized: true, admin: { description: 'For "Other", e.g. Studierende.' } },
                        { name: 'amount', type: 'text', admin: { description: 'Free text, e.g. 90, 2 € or kostenlos.' } },
                      ],
                    },
                  ],
                },
                { name: 'note', type: 'textarea', localized: true, admin: { description: 'Prices as free text.' } },
              ],
            },
            {
              name: 'openingHours',
              type: 'group',
              fields: [
                { name: 'show', type: 'checkbox', label: 'Show opening hours', defaultValue: true },
                { name: 'text', type: 'textarea', localized: true },
              ],
            },
            { name: 'notes', type: 'textarea', localized: true },
          ],
        },
        {
          label: 'WordPress',
          description: 'Set by the migration, read-only. The ids let the media and shop steps attach files and products later.',
          fields: [
            {
              name: 'legacy',
              type: 'group',
              fields: [
                { name: 'wpStatus', type: 'text', ...locked },
                { name: 'enWpId', type: 'number', ...locked, admin: { readOnly: true, description: 'WordPress ID of the English post' } },
                { name: 'productWpId', type: 'number', ...locked },
                { name: 'imageWpIds', type: 'number', hasMany: true, ...locked },
                { name: 'inlineImageWpIds', type: 'number', hasMany: true, ...locked },
                { name: 'documentWpIds', type: 'number', hasMany: true, ...locked },
                { name: 'rawPlace', type: 'textarea', ...locked },
                { name: 'rawCosts', type: 'textarea', ...locked },
              ],
            },
          ],
        },
      ],
    },
    // Sidebar
    {
      name: 'slug',
      type: 'text',
      localized: true,
      index: true,
      unique: true,
      admin: { position: 'sidebar', description: 'URL part, per language. Filled from the title if left empty.' },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'internal',
      options: [
        { label: 'designaustria / designforum', value: 'internal' },
        { label: 'External / members', value: 'external' },
      ],
      admin: { position: 'sidebar' },
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
    { name: 'badge', type: 'text', admin: { position: 'sidebar', description: 'e.g. #DenkWeiter' } },
    legacyWpIdField('WordPress post ID (German post), set by the migration.'),
  ],
}
