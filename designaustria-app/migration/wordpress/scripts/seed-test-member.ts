// Test login that looks like it was just migrated from WordPress: test@test.test / test.
//
// The user gets an unusable random Payload password and a WordPress (phpass) hash of "test", like the import writes
// (plan §6). The first login checks that hash and moves the password to Payload. Run this again to reset the user to
// "just migrated" and test that again. Also links a draft member profile (/de/member/test-member, only visible to
// the user when logged in).
//
// A full import (wp:import) deletes this user and profile again: they have no WordPress id.
//
// Usage (from designaustria-app/):
//   DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/payload npx tsx migration/wordpress/scripts/seed-test-member.ts
//   npx tsx migration/wordpress/scripts/seed-test-member.ts --allow-remote   # the database in .env.local

import { createHash, randomBytes } from 'node:crypto'

import { verifyWordPressPassword } from '@/auth/wordpressPassword'

import { MIGRATION_CONTEXT } from '../lib/upsert'
import { parseArgs, startPayload } from './lib-env'

const EMAIL = 'test@test.test'
const PASSWORD = 'test'
const SLUG = 'test-member'

const payload = await startPayload(parseArgs())

const legacyPasswordHash = phpassHash(PASSWORD)
if (!(await verifyWordPressPassword(PASSWORD, legacyPasswordHash))) throw new Error('Generated hash does not verify')

const userData = {
  email: EMAIL,
  roles: ['member' as const],
  legacyPasswordHash,
  legacyPasswordRetiredAt: null,
  password: randomBytes(32).toString('base64url'), // unusable, like the import's
}

const existingUser = (await payload.find({ collection: 'users', where: { email: { equals: EMAIL } }, limit: 1, depth: 0 })).docs[0]
const user = existingUser
  ? await payload.update({ collection: 'users', id: existingUser.id, data: userData, depth: 0, context: MIGRATION_CONTEXT })
  : await payload.create({ collection: 'users', data: userData, depth: 0, context: MIGRATION_CONTEXT, disableVerificationEmail: true })
await payload.unlock({ collection: 'users', data: { email: EMAIL } }) // clear failed login attempts

const slugTaken = await payload.find({
  collection: 'members',
  where: { slug: { equals: SLUG }, user: { not_equals: user.id } },
  limit: 1,
  depth: 0,
})
if (slugTaken.docs.length) throw new Error(`Another member already uses the slug "${SLUG}"`)

const memberData = {
  firstName: 'Test',
  lastName: 'Member',
  slug: SLUG,
  profileStatus: 'draft' as const,
  user: user.id,
  companyName: 'Test Studio',
  jobTitle: 'Designer',
  motto: 'Test profile for member login. Feel free to edit.',
  about: null,
  education: null,
  contactEmail: EMAIL,
  contactEmailPublic: false,
}
const existingMember = (await payload.find({ collection: 'members', where: { user: { equals: user.id } }, limit: 1, depth: 0 })).docs[0]
const member = existingMember
  ? await payload.update({ collection: 'members', id: existingMember.id, data: memberData, depth: 0, context: MIGRATION_CONTEXT })
  : await payload.create({ collection: 'members', data: memberData, depth: 0, context: MIGRATION_CONTEXT })

console.log(`${existingUser ? 'Reset' : 'Created'} user ${EMAIL} (id ${user.id}) with a WordPress password hash`)
console.log(`${existingMember ? 'Reset' : 'Created'} member profile /de/member/${member.slug} (id ${member.id}, draft)`)
process.exit(0)

/** A WordPress < 6.8 password hash ($P$B: phpass portable, 2^13 rounds of salted MD5), as wp_hash_password() made. */
function phpassHash(password: string): string {
  const itoa64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const salt = Array.from(randomBytes(8), (byte) => itoa64[byte & 0x3f]).join('')
  const setting = `$P$B${salt}`
  const pw = Buffer.from(password, 'utf8')
  const md5 = (data: Buffer) => createHash('md5').update(data).digest()
  let digest = md5(Buffer.concat([Buffer.from(salt, 'latin1'), pw]))
  for (let count = 1 << itoa64.indexOf('B'); count > 0; count--) digest = md5(Buffer.concat([digest, pw]))

  // phpass encode64(): its own little-endian base64 variant.
  let output = ''
  let i = 0
  do {
    let value = digest[i++]
    output += itoa64[value & 0x3f]
    if (i < 16) value |= digest[i] << 8
    output += itoa64[(value >> 6) & 0x3f]
    if (i++ >= 16) break
    if (i < 16) value |= digest[i] << 16
    output += itoa64[(value >> 12) & 0x3f]
    if (i++ >= 16) break
    output += itoa64[(value >> 18) & 0x3f]
  } while (i < 16)
  return setting + output
}
