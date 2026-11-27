import type { Block, CollectionConfig } from 'payload'

import { isStaff, nobody } from '@/access/roles'
import { legacyWpIdField } from '@/fields/legacyWpId'
import { mediaField } from '@/fields/media'
import { slugify } from '@/lib/slugify'

// Products: the pages of things designaustria sells or gives away, starting with the publications. Every product has the
// same fields; what kind it is comes from its categories (publications are in "Publikationen") and its `details` blocks.
// Price, tax and stock live in the shop (Vendure): `shopSku` is the link, empty = not for sale.
// Field mapping: migration/wordpress/docs/06-products-plan.md §3.1.
// `visibility: hidden` products are readable through the API like all others: the frontend queries filter them out.

/** Written only by the migration (Local API), never through the admin or the API. */
const locked = { access: { create: nobody, update: nobody }, admin: { readOnly: true } }

/** Facts about a publication, shown as a list next to the price. */
const PublicationDetails: Block = {
  slug: 'publicationDetails',
  labels: { singular: 'Publication details', plural: 'Publication details' },
  fields: [
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'members',
      hasMany: true,
      admin: { description: 'Authors with a member profile. Others go in "Other authors".' },
    },
    { name: 'authorsText', type: 'text', label: 'Other authors', admin: { description: 'Shown after the linked authors.' } },
    { name: 'year', type: 'number', min: 1800, max: 2100 },
    { name: 'publisher', type: 'text' },
    { name: 'isbn', type: 'text', label: 'ISBN / ISSN' },
    { name: 'pages', type: 'number', min: 1 },
    { name: 'format', type: 'text', admin: { description: 'e.g. Hardcover, 21 × 28 cm' } },
  ],
}

export const Products: CollectionConfig = {
  slug: 'products',
  labels: { singular: 'Product', plural: 'Products' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'categories', 'shopSku', 'publishedAt', 'visibility'],
    listSearchableFields: ['title', 'slug', 'shopSku'],
  },
  defaultSort: '-publishedAt',
  access: {
    read: () => true, // anyone may read products (needed for the public website)
    // Writes are staff-only: members can log in too, and Payload's default allows any logged-in user.
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    beforeValidate: [
      // A slug from the title when staff leave it empty. Migrated products bring their WordPress slug.
      ({ data, context }) => {
        if (!data || context.isMigration) return data
        if (!data.slug && typeof data.title === 'string') data.slug = slugify(data.title) || undefined
        return data
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    { name: 'subtitle', type: 'text', localized: true },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'body', type: 'richText', localized: true },
            mediaField({ name: 'cover', label: 'Cover image' }),
            mediaField({ name: 'gallery', label: 'Gallery', hasMany: true }),
            { name: 'documents', type: 'upload', relationTo: 'media', hasMany: true },
            {
              name: 'details',
              type: 'blocks',
              blocks: [PublicationDetails],
              admin: { description: 'Facts that only some kinds of product have, e.g. ISBN and pages of a publication.' },
            },
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
                { name: 'wpPostType', type: 'text', ...locked, admin: { readOnly: true, description: 'e.g. publication' } },
                { name: 'wpStatus', type: 'text', ...locked },
                { name: 'enWpId', type: 'number', ...locked, admin: { readOnly: true, description: 'WordPress ID of the English post' } },
                { name: 'wcProductWpId', type: 'number', ...locked, admin: { readOnly: true, description: 'WooCommerce product' } },
                { name: 'imageWpIds', type: 'number', hasMany: true, ...locked },
                { name: 'inlineImageWpIds', type: 'number', hasMany: true, ...locked },
                { name: 'documentWpIds', type: 'number', hasMany: true, ...locked },
                {
                  name: 'memberAuthorWpIds',
                  type: 'number',
                  hasMany: true,
                  ...locked,
                  admin: { readOnly: true, description: 'All member authors in WordPress, also those not migrated' },
                },
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
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      admin: { position: 'sidebar', description: 'Publications are in "Publikationen" or one of its subcategories.' },
    },
    {
      name: 'shopSku',
      label: 'Shop SKU',
      type: 'text',
      index: true,
      admin: { position: 'sidebar', description: 'SKU of the product variant in the shop. Empty = not for sale.' },
    },
    {
      name: 'membersOnly',
      type: 'group',
      admin: { position: 'sidebar', description: 'Only for logged-in members.' },
      fields: [
        {
          name: 'content',
          type: 'checkbox',
          label: 'Full page',
          admin: { description: 'Others only see title, subtitle, cover and authors.' },
        },
        { name: 'documents', type: 'checkbox', label: 'Documents' },
      ],
    },
    legacyWpIdField('WordPress post ID (German post), set by the migration.'),
  ],
}
