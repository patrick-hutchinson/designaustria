import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Member, User } from '@/payload-types'

// Creates and deletes documents, so it only runs against a local database (never Neon/production).
// Run: DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/payload npm run test:int
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')

const TAG = `access-test-${Date.now()}`

describe.skipIf(!isLocalDb)('membership access control', () => {
  let payload: Payload
  let staff: User
  let alice: User
  let bob: User
  let aliceMember: Member
  let bobMember: Member
  let orgId: number

  beforeAll(async () => {
    payload = await getPayload({ config: await config })

    const mkUser = (name: string, roles: User['roles']) =>
      payload.create({
        collection: 'users',
        data: { email: `${name}-${TAG}@example.com`, password: 'test-password', roles },
      })
    staff = await mkUser('staff', ['staff'])
    alice = await mkUser('alice', ['member'])
    bob = await mkUser('bob', ['member'])

    const mkMember = (user: User, firstName: string) =>
      payload.create({
        collection: 'members',
        data: {
          firstName,
          lastName: TAG,
          profileStatus: 'publish',
          user: user.id,
          birthdate: '1990-01-01',
          billing: { iban: 'AT00TEST', paymentFrequency: 'yearly' },
          addresses: [{ type: 'office', city: 'Wien', visibility: 'public' }],
        },
      })
    aliceMember = await mkMember(alice, 'Alice')
    bobMember = await mkMember(bob, 'Bob')

    const org = await payload.create({ collection: 'organizations', data: { name: `Org ${TAG}`, profileStatus: 'publish' } })
    orgId = org.id
    await payload.create({
      collection: 'organization-members',
      data: { organization: orgId, member: aliceMember.id, role: 'admin' },
    })
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'organization-members', where: { organization: { equals: orgId } } })
    await payload.delete({ collection: 'organizations', where: { id: { equals: orgId } } })
    await payload.delete({ collection: 'members', where: { lastName: { equals: TAG } } })
    await payload.delete({ collection: 'users', where: { email: { like: TAG } } })
  })

  it('builds fullName from the name fields', () => {
    expect(aliceMember.fullName).toBe(`Alice ${TAG}`)
  })

  it('a member only sees their own profile, including their private fields', async () => {
    const { docs } = await payload.find({
      collection: 'members',
      where: { lastName: { equals: TAG } },
      user: alice,
      overrideAccess: false,
    })
    expect(docs.map((d) => d.id)).toEqual([aliceMember.id])
    expect(docs[0].billing?.iban).toBe('AT00TEST')
    expect(docs[0].birthdate).toBeTruthy()
  })

  it('staff see every profile', async () => {
    const { totalDocs } = await payload.find({
      collection: 'members',
      where: { lastName: { equals: TAG } },
      user: staff,
      overrideAccess: false,
    })
    expect(totalDocs).toBe(2)
  })

  it('a member cannot edit profiles, organisations or events', async () => {
    await expect(
      payload.update({ collection: 'members', id: bobMember.id, data: { motto: 'x' }, user: alice, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      payload.update({ collection: 'organizations', id: orgId, data: { about: 'x' }, user: alice, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'events',
        data: { title: 'x', startsAt: new Date().toISOString(), type: 'internal', visibility: 'everywhere' },
        user: alice,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('a member cannot give themselves another role', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: alice.id,
      data: { roles: ['admin'] },
      user: alice,
      overrideAccess: false,
    })
    expect(updated.roles).toEqual(['member'])
  })

  it('never exposes the legacy password hash', async () => {
    await payload.update({ collection: 'users', id: bob.id, data: { legacyPasswordHash: '$P$Bsecret' } })
    const asStaff = await payload.findByID({ collection: 'users', id: bob.id, user: staff, overrideAccess: false })
    const asSystem = await payload.findByID({ collection: 'users', id: bob.id })
    expect(asStaff).not.toHaveProperty('legacyPasswordHash')
    expect(asSystem).not.toHaveProperty('legacyPasswordHash')
  })

  it('allows one membership row per (organisation, member)', async () => {
    await expect(
      payload.create({
        collection: 'organization-members',
        data: { organization: orgId, member: aliceMember.id, role: 'member' },
      }),
    ).rejects.toThrow()
  })

  it('joins: user → member profile, member → organisations, organisation → people', async () => {
    const user = await payload.findByID({ collection: 'users', id: alice.id, depth: 1 })
    expect(user.member?.docs?.map((d) => (typeof d === 'object' ? d.id : d))).toEqual([aliceMember.id])

    const member = await payload.findByID({ collection: 'members', id: aliceMember.id, depth: 1 })
    const link = member.organizations?.docs?.[0]
    expect(typeof link === 'object' && link.role).toBe('admin')

    const org = await payload.findByID({ collection: 'organizations', id: orgId, depth: 0 })
    expect(org.people?.docs).toHaveLength(1)
  })

  it('a login can be linked to only one member profile', async () => {
    await expect(
      payload.create({ collection: 'members', data: { firstName: 'Dup', lastName: TAG, profileStatus: 'draft', user: alice.id } }),
    ).rejects.toThrow()
  })
})
