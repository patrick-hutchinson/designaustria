// @vitest-environment node
import { randomBytes } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import vectors from '../fixtures/wordpress-password-hashes.json'

// First login with a WordPress password (plan §6). Creates and deletes users, so local database only.
// Run: DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/payload npm run test:int
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')

const TAG = `legacy-login-${Date.now()}`
const phpass = vectors.find((v) => v.kind === 'phpass')!
const wpBcrypt = vectors.find((v) => v.kind === 'wp-bcrypt')!

describe.skipIf(!isLocalDb)('legacy WordPress login', () => {
  let payload: Payload
  let n = 0

  /** A user as the import creates it: random Payload password, WordPress hash stored. */
  const importedUser = async (hash: string) => {
    const email = `user${++n}-${TAG}@example.com`
    const user = await payload.create({
      collection: 'users',
      data: { email, password: randomBytes(32).toString('base64url'), roles: ['member'], legacyPasswordHash: hash },
      context: { isMigration: true },
    })
    return { email, id: user.id }
  }

  const stored = async (id: number) => {
    const { rows } = (await payload.db.drizzle.execute(
      sql`SELECT legacy_password_hash AS hash, legacy_password_retired_at AS retired, login_attempts AS attempts FROM users WHERE id = ${id}`,
    )) as unknown as { rows: { hash: string | null; retired: string | null; attempts: number | null }[] }
    return rows[0]
  }

  const login = (email: string, password: string) => payload.login({ collection: 'users', data: { email, password } })

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  afterAll(async () => {
    if (payload) await payload.delete({ collection: 'users', where: { email: { like: TAG } } })
  })

  it('logs in with a phpass password, then moves it to Payload and clears the hash', async () => {
    const { email, id } = await importedUser(phpass.hash)
    const result = await login(email, phpass.password)
    expect(result.user?.id).toBe(id)
    expect(result.token).toBeTruthy()

    const row = await stored(id)
    expect(row.hash).toBeNull()
    expect(row.retired).toBeTruthy()

    // Second login: plain Payload password now.
    expect((await login(email, phpass.password)).user?.id).toBe(id)
  })

  it('logs in with a WordPress ≥ 6.8 ($wp$ bcrypt) password', async () => {
    const { email, id } = await importedUser(wpBcrypt.hash)
    expect((await login(email, wpBcrypt.password)).user?.id).toBe(id)
    expect((await stored(id)).hash).toBeNull()
  })

  it('matches the email case-insensitively, like Payload', async () => {
    const { email, id } = await importedUser(phpass.hash)
    expect((await login(`  ${email.toUpperCase()} `, phpass.password)).user?.id).toBe(id)
  })

  it('a wrong password changes nothing and counts as a failed attempt', async () => {
    const { email, id } = await importedUser(phpass.hash)
    await expect(login(email, 'wrong password')).rejects.toThrow()
    const row = await stored(id)
    expect(row.hash).toBe(phpass.hash)
    expect(row.retired).toBeNull()
    expect(Number(row.attempts)).toBe(1) // numeric column, returned as a string
  })

  it('a locked account is not upgraded, even with the right password', async () => {
    const { email, id } = await importedUser(phpass.hash)
    for (let i = 0; i < 5; i++) await expect(login(email, `wrong ${i}`)).rejects.toThrow()
    await expect(login(email, phpass.password)).rejects.toThrow(/locked/i)
    expect((await stored(id)).hash).toBe(phpass.hash)
  })

  it('a password change retires the WordPress password', async () => {
    const { email, id } = await importedUser(phpass.hash)
    await payload.update({ collection: 'users', id, data: { password: 'new-site-password' } })
    expect((await stored(id)).hash).toBeNull()
    await expect(login(email, phpass.password)).rejects.toThrow()
    expect((await login(email, 'new-site-password')).user?.id).toBe(id)
  })

  it('"forgot password" retires the WordPress password', async () => {
    const { email, id } = await importedUser(phpass.hash)
    const token = await payload.forgotPassword({ collection: 'users', data: { email }, disableEmail: true })
    await payload.resetPassword({ collection: 'users', data: { token, password: 'reset-password' }, overrideAccess: true })
    const row = await stored(id)
    expect(row.hash).toBeNull()
    expect(row.retired).toBeTruthy()
    await expect(login(email, phpass.password)).rejects.toThrow()
  })

  it('a member cannot set or read the hash or the retired date', async () => {
    const { id } = await importedUser(phpass.hash)
    const self = await payload.findByID({ collection: 'users', id, overrideAccess: true })
    await payload.update({
      collection: 'users',
      id,
      data: { legacyPasswordHash: 'x', legacyPasswordRetiredAt: '2020-01-01T00:00:00.000Z' } as never,
      user: self,
      overrideAccess: false,
    })
    const row = await stored(id)
    expect(row.hash).toBe(phpass.hash)
    expect(row.retired).toBeNull()

    const read = await payload.findByID({ collection: 'users', id, user: self, overrideAccess: false })
    expect(read).not.toHaveProperty('legacyPasswordHash')
    expect(read).not.toHaveProperty('legacyPasswordRetiredAt')
  })
})
