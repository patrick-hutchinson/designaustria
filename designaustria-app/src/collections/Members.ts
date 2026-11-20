import type { CollectionConfig } from 'payload'

import { isStaff, isStaffField, isStaffOrProfileOwnerField, isStaffUser } from '@/access/roles'
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

// A person: membership record + public profile. Migrated from the WordPress CPT `member`.
// Field mapping: migration/wordpress/docs/02-plan.md §2.4 and §3.
export const Members: CollectionConfig = {
  slug: 'members',
  admin: {
    useAsTitle: 'fullName',
    defaultColumns: ['fullName', 'memberNumber', 'tier', 'profileStatus', 'user'],
    listSearchableFields: ['fullName', 'memberNumber', 'contactEmail', 'companyName'],
    group: 'Membership',
  },
  access: {
    // Staff see everyone; a logged-in member sees only their own profile.
    // The public website reads published profiles server-side with a restricted `select`.
    read: ({ req }) => {
      if (isStaffUser(req.user)) return true
      if (req.user) return { user: { equals: req.user.id } }
      return false
    },
    create: isStaff,
    // Members edit their own profile on the website, through src/members/ownProfile.ts (a fixed set of fields).
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        const name = [data.title, data.firstName, data.lastName].filter(Boolean).join(' ').trim()
        data.fullName = name || data.companyName || data.memberNumber || undefined
        return data
      },
    ],
  },
  fields: [
    {
      name: 'fullName',
      type: 'text',
      index: true,
      admin: { readOnly: true, description: 'Title + first name + last name (set automatically).' },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Person',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'salutation',
                  type: 'select',
                  options: [
                    { label: 'Divers', value: 'd' },
                    { label: 'Frau', value: 'f' },
                    { label: 'Herr', value: 'm' },
                    { label: 'Inter', value: 'i' },
                  ],
                },
                { name: 'title', type: 'text', admin: { description: 'Academic title, e.g. Mag.' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'firstName', type: 'text' },
                { name: 'lastName', type: 'text' },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'birthdate',
                  type: 'date',
                  access: { read: isStaffOrProfileOwnerField },
                  admin: { description: 'Not public.', date: { pickerAppearance: 'dayOnly' } },
                },
                { name: 'deathYear', type: 'number' },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'contactEmail', type: 'email', admin: { description: 'Contact address; the login email is on the user.' } },
                { name: 'contactEmailPublic', type: 'checkbox', label: 'Show contact email on public profile' },
              ],
            },
          ],
        },
        {
          label: 'Profession',
          fields: [
            { name: 'companyName', type: 'text', admin: { description: 'Professional identity / company name' } },
            {
              type: 'row',
              fields: [
                { name: 'jobTitle', type: 'text' },
                {
                  name: 'employmentType',
                  type: 'select',
                  options: [
                    { label: 'Employed', value: 'employed' },
                    { label: 'Self-employed', value: 'selfEmployed' },
                  ],
                },
              ],
            },
            { name: 'about', type: 'textarea' },
            { name: 'motto', type: 'textarea', admin: { description: 'Banner on the profile' } },
            { name: 'education', type: 'textarea' },
            {
              type: 'row',
              fields: [
                { name: 'additionalQualification', type: 'text' },
                { name: 'otherFocus', type: 'text', admin: { description: 'Focus area not in the category list' } },
              ],
            },
            { name: 'keywords', type: 'text' },
            categoriesField,
          ],
        },
        {
          label: 'Contact',
          fields: [addressesField, phonesField, linksField],
        },
        {
          label: 'Membership',
          fields: [
            {
              name: 'memberNumber',
              type: 'text',
              index: true,
              admin: { description: 'Not unique: colleagues in an organisation share its number with a -N suffix.' },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'tier',
                  type: 'select',
                  options: [
                    { label: 'Standard', value: 'standard' },
                    { label: 'Young Professional', value: 'youngProfessional' },
                    { label: 'Student', value: 'student' },
                    { label: 'Retiree', value: 'retiree' },
                    { label: 'Corporate (Firmenmitglied)', value: 'corporate' },
                    { label: 'Education (Bildungsmitglied)', value: 'education' },
                  ],
                },
                {
                  name: 'honorary',
                  type: 'select',
                  options: [
                    { label: 'Honorary member', value: 'member' },
                    { label: 'Honorary president', value: 'president' },
                  ],
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'functions',
                  type: 'select',
                  hasMany: true,
                  options: [
                    { label: 'designaustria team', value: 'staff' },
                    { label: 'Board (Vorstand)', value: 'board' },
                  ],
                },
                { name: 'boardTerms', type: 'text', hasMany: true, admin: { description: 'e.g. 2022-2024' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'bildrecht', type: 'checkbox', label: 'Bildrecht' },
                { name: 'newsletter', type: 'checkbox', label: 'Newsletter' },
              ],
            },
            {
              name: 'billing',
              type: 'group',
              access: { read: isStaffOrProfileOwnerField, update: isStaffField },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'paymentType',
                      type: 'select',
                      options: [{ label: 'SEPA direct debit', value: 'sepa' }],
                    },
                    {
                      name: 'paymentFrequency',
                      type: 'select',
                      options: [
                        { label: 'Yearly', value: 'yearly' },
                        { label: 'Quarterly', value: 'quarterly' },
                      ],
                    },
                  ],
                },
                { name: 'iban', type: 'text', label: 'IBAN' },
                {
                  type: 'row',
                  fields: [
                    { name: 'feeOverride', type: 'number', admin: { description: 'EUR, only if different from the tier fee' } },
                    { name: 'feeNote', type: 'text' },
                  ],
                },
              ],
            },
            {
              name: 'organizations',
              type: 'join',
              collection: 'organization-members',
              on: 'member',
              admin: { defaultColumns: ['organization', 'role'] },
            },
          ],
        },
        {
          label: 'Portfolio & documents',
          fields: [portfolioField, documentsField],
        },
        {
          label: 'Legacy',
          description: 'Data kept from WordPress for traceability. Not shown on the website.',
          fields: [
            {
              name: 'legacy',
              type: 'group',
              admin: { readOnly: true },
              fields: [
                { name: 'createdAt', type: 'date', admin: { description: 'WordPress post_date' } },
                {
                  name: 'displayOptIns',
                  type: 'select',
                  hasMany: true,
                  options: [
                    { label: 'Show email', value: 'email' },
                    { label: 'Show on front page', value: 'frontpage' },
                  ],
                },
                { name: 'motivation', type: 'text' },
                { name: 'activeFlag', type: 'checkbox', admin: { description: 'Old status value "active"; meaning unknown.' } },
                {
                  name: 'mergedFromWpIds',
                  type: 'number',
                  hasMany: true,
                  admin: { description: 'WordPress member posts merged into this one (duplicates).' },
                },
                // Files are attached in a later media step (plan §11). Until then only the WP attachment IDs are kept.
                { name: 'avatarWpId', type: 'number' },
                { name: 'studentProofWpId', type: 'number', access: { read: isStaffField } },
              ],
            },
          ],
        },
      ],
    },
    { ...profileStatusField },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      unique: true,
      admin: { position: 'sidebar', description: 'Login account, if this person has one.' },
    },
    slugField,
    legacyWpIdField('WordPress member post ID, set by the migration.'),
  ],
}
