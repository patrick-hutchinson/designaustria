import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { findOwnMember, updateOwnProfile } from '@/members/ownProfile'
import type { Member, User } from '@/payload-types'

// A member editing their own profile on the website (src/members/ownProfile.ts).
// Creates and deletes documents, so it only runs against a local database (never Neon/production).
// Run: DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/payload npm run test:int
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')

const TAG = `own-profile-test-${Date.now()}`

describe.skipIf(!isLocalDb)('own profile', () => {
  let payload: Payload
  let alice: User
  let bob: User
  let loner: User
  let aliceMember: Member
  let bobMember: Member

  beforeAll(async () => {
    payload = await getPayload({ config: await config })

    const mkUser = (name: string) =>
      payload.create({
        collection: 'users',
        data: { email: `${name}-${TAG}@example.com`, password: 'test-password', roles: ['member'] },
      })
    alice = await mkUser('alice')
    bob = await mkUser('bob')
    loner = await mkUser('loner') // a login without a member profile

    const mkMember = (user: User, firstName: string) =>
      payload.create({
        collection: 'members',
        data: {
          title: 'Mag.',
          firstName,
          lastName: TAG,
          slug: `${firstName.toLowerCase()}-${TAG}`,
          profileStatus: 'draft',
          memberNumber: '1234',
          tier: 'standard',
          user: user.id,
          billing: { iban: 'AT00TEST' },
        },
      })
    aliceMember = await mkMember(alice, 'Alice')
    bobMember = await mkMember(bob, 'Bob')
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'members', where: { lastName: { equals: TAG } } })
    await payload.delete({ collection: 'users', where: { email: { like: TAG } } })
  })

  it('finds the profile linked to the login', async () => {
    expect((await findOwnMember(payload, alice))?.id).toBe(aliceMember.id)
    expect(await findOwnMember(payload, loner)).toBeNull()
  })

  it('saves the editable fields on the own profile only', async () => {
    const updated = await updateOwnProfile(payload, alice, {
      motto: '  Less is more  ',
      jobTitle: 'Designer',
      contactEmailPublic: true,
    })
    expect(updated.id).toBe(aliceMember.id)
    expect(updated.motto).toBe('Less is more')
    expect(updated.jobTitle).toBe('Designer')
    expect(updated.contactEmailPublic).toBe(true)

    const bobAfter = await payload.findByID({ collection: 'members', id: bobMember.id })
    expect(bobAfter.motto).toBeFalsy()
  })

  it('keeps the full name on a partial update', async () => {
    const updated = await updateOwnProfile(payload, alice, { companyName: 'Studio Alice' })
    expect(updated.fullName).toBe(`Mag. Alice ${TAG}`)
  })

  it('clears a field when it is emptied', async () => {
    const updated = await updateOwnProfile(payload, alice, { jobTitle: '   ' })
    expect(updated.jobTitle).toBeNull()
  })

  it('ignores every other field, even if sent', async () => {
    await updateOwnProfile(payload, alice, {
      motto: 'still allowed',
      // Not part of OwnProfileInput: what a tampered form could send.
      ...({
        firstName: 'Mallory',
        memberNumber: '1',
        tier: 'corporate',
        profileStatus: 'publish',
        slug: 'hijacked',
        user: bob.id,
        billing: { iban: 'AT99HACK' },
      } as object),
    })
    const after = await payload.findByID({ collection: 'members', id: aliceMember.id })
    expect(after.motto).toBe('still allowed')
    expect(after.firstName).toBe('Alice')
    expect(after.memberNumber).toBe('1234')
    expect(after.tier).toBe('standard')
    expect(after.profileStatus).toBe('draft')
    expect(after.slug).toBe(`alice-${TAG}`)
    expect(typeof after.user === 'object' ? after.user?.id : after.user).toBe(alice.id)
    expect(after.billing?.iban).toBe('AT00TEST')
  })

  it('refuses a login without a member profile', async () => {
    await expect(updateOwnProfile(payload, loner, { motto: 'x' })).rejects.toThrow()
  })

  it('rejects an invalid contact email', async () => {
    await expect(
      updateOwnProfile(payload, alice, { contactEmail: 'not-an-email' }),
    ).rejects.toThrow()
  })
})
