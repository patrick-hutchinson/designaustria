import type { ArrayField, Field, SelectField } from 'payload'

// Building blocks shared by `members` and `organizations`.
// They mirror the WordPress ACF repeaters da_address, da_number, da_online, da_portfolio and da_documents.

/** Who may see an entry on the public profile. Mirrors ACF `*_show` (public / private). */
const visibilityField = (defaultValue: 'public' | 'private' = 'private'): SelectField => ({
  name: 'visibility',
  type: 'select',
  defaultValue,
  options: [
    { label: 'Public profile', value: 'public' },
    { label: 'designaustria only', value: 'private' },
  ],
})

/** WordPress post_status, copied 1:1. What `pending` means is still unknown (see migration plan §3.1). */
export const profileStatusField: SelectField = {
  name: 'profileStatus',
  type: 'select',
  required: true,
  defaultValue: 'draft',
  index: true,
  options: [
    { label: 'Published', value: 'publish' },
    { label: 'Pending', value: 'pending' },
    { label: 'Draft', value: 'draft' },
    { label: 'Private', value: 'private' },
  ],
  admin: {
    position: 'sidebar',
    description: 'Only "Published" profiles are public. Copied as-is from WordPress.',
  },
}

export const slugField: Field = {
  name: 'slug',
  type: 'text',
  index: true,
  admin: { position: 'sidebar', description: 'URL part of the public profile.' },
}

export const addressesField: ArrayField = {
  name: 'addresses',
  type: 'array',
  labels: { singular: 'Address', plural: 'Addresses' },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          options: [
            { label: 'Office', value: 'office' },
            { label: 'Postal / private', value: 'private' },
          ],
        },
        visibilityField(),
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'street', type: 'text' },
        { name: 'number', type: 'text', admin: { description: 'House number / staircase / door' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'zip', type: 'text' },
        { name: 'city', type: 'text' },
        { name: 'country', type: 'text', admin: { description: 'ISO code, e.g. AT' } },
      ],
    },
  ],
}

export const phonesField: ArrayField = {
  name: 'phones',
  type: 'array',
  labels: { singular: 'Phone number', plural: 'Phone numbers' },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          options: [
            { label: 'Office', value: 'office' },
            { label: 'Mobile', value: 'mobile' },
          ],
        },
        { name: 'number', type: 'text' },
        visibilityField(),
      ],
    },
  ],
}

export const linksField: ArrayField = {
  name: 'links',
  type: 'array',
  labels: { singular: 'Link', plural: 'Websites and social media' },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          defaultValue: 'web',
          options: [
            { label: 'Website', value: 'web' },
            { label: 'Instagram', value: 'instagram' },
            { label: 'Facebook', value: 'facebook' },
            { label: 'Behance', value: 'behance' },
            { label: 'LinkedIn', value: 'linkedin' },
            { label: 'X (Twitter)', value: 'x' },
            { label: 'Xing', value: 'xing' },
            { label: 'Blog', value: 'blog' },
          ],
        },
        { name: 'url', type: 'text' },
      ],
    },
  ],
}

export const portfolioField: ArrayField = {
  name: 'portfolio',
  type: 'array',
  labels: { singular: 'Project', plural: 'Portfolio' },
  fields: [
    {
      type: 'row',
      fields: [{ name: 'name', type: 'text' }, visibilityField('public')],
    },
    {
      // Images are attached in a later media step (plan §11). Until then only the WP attachment IDs are kept.
      name: 'imageWpIds',
      type: 'number',
      hasMany: true,
      admin: { hidden: true },
    },
  ],
}

export const documentsField: ArrayField = {
  name: 'documents',
  type: 'array',
  labels: { singular: 'Document', plural: 'Documents' },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          options: [
            { label: 'Dissertation', value: 'dissertation' },
            { label: 'Thesis (Diplomarbeit)', value: 'thesis' },
            { label: 'Scientific paper', value: 'paper' },
            { label: 'Publication', value: 'publication' },
            { label: 'Book', value: 'book' },
            { label: 'Other', value: 'misc' },
          ],
        },
        { name: 'name', type: 'text' },
      ],
    },
    {
      // File is attached in a later media step (plan §11).
      name: 'fileWpId',
      type: 'number',
      admin: { hidden: true },
    },
  ],
}

export const categoriesField: Field = {
  name: 'categories',
  type: 'relationship',
  relationTo: 'categories',
  hasMany: true,
  admin: { description: 'Focus areas and regions' },
}
