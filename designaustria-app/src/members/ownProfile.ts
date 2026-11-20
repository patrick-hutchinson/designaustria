import type { Payload, PopulateType, SelectType } from 'payload'

import type { Member, User } from '@/payload-types'

// A logged-in member editing their own profile on the website.
//
// The `members` collection stays staff-only for updates (see access in src/collections/Members.ts), so the REST
// and GraphQL APIs don't let members change anything. Self-editing goes through updateOwnProfile() only:
// it finds the profile from the logged-in user (never from an ID sent by the browser) and saves only the
// fields listed here. Everything else (name, membership, billing, status, slug...) stays with the team.

/** Text fields a member may edit. Empty input clears the field. */
export const EDITABLE_TEXT_FIELDS = [
  'companyName',
  'jobTitle',
  'about',
  'motto',
  'education',
  'contactEmail',
] as const

export type OwnProfileInput = Partial<
  Record<(typeof EDITABLE_TEXT_FIELDS)[number], string | null>
> & {
  contactEmailPublic?: boolean
}

/** The member profile linked to this login, or null. Read with the user's own access rights. */
export async function findOwnMember(
  payload: Payload,
  user: User,
  options: {
    select?: SelectType
    populate?: PopulateType
    depth?: number
    locale?: 'de' | 'en'
  } = {},
): Promise<Member | null> {
  const { docs } = await payload.find({
    collection: 'members',
    where: { user: { equals: user.id } },
    limit: 1,
    depth: 0,
    ...options,
    user,
    overrideAccess: false,
  })
  return (docs[0] as Member | undefined) ?? null
}

export async function updateOwnProfile(
  payload: Payload,
  user: User,
  input: OwnProfileInput,
): Promise<Member> {
  const member = await findOwnMember(payload, user)
  if (!member) throw new Error('No member profile is linked to this login.')

  const data: Partial<Member> = {}
  for (const field of EDITABLE_TEXT_FIELDS) {
    if (!(field in input)) continue
    const value = input[field]
    data[field] = typeof value === 'string' && value.trim() !== '' ? value.trim() : null
  }
  if (typeof input.contactEmailPublic === 'boolean')
    data.contactEmailPublic = input.contactEmailPublic

  // overrideAccess: the collection only lets staff update. The member and the fields are fixed above.
  return payload.update({
    collection: 'members',
    id: member.id,
    data,
    depth: 0,
    overrideAccess: true,
  })
}
