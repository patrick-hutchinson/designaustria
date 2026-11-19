// Verify: compares Payload with the extract (.data/wp-extract) and fails on any mismatch (plan §9). Read-only.
//
// Usage (from designaustria-app/):
//   DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/payload npx tsx migration/wordpress/scripts/verify/run.ts

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sql } from '@payloadcms/db-postgres'
import type { CollectionSlug, Payload } from 'payload'

import {
  EXTRACT_FILES,
  type ExtractedCategory,
  type ExtractedMember,
  type ExtractedOrganization,
  type ExtractedOrganizationMember,
  type ExtractedUser,
} from '../../lib/extract-types'
import { parseArgs, startPayload } from '../lib-env'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const EXTRACT_DIR = path.resolve(HERE, '../../../../.data/wp-extract')
const readExtract = <T>(file: string): T[] => JSON.parse(readFileSync(path.join(EXTRACT_DIR, file), 'utf8'))

const errors: string[] = []
const notes: string[] = []
const check = (ok: boolean, message: string) => {
  console.log(`${ok ? '✓' : '✗'} ${message}`)
  if (!ok) errors.push(message)
}

type Doc = Record<string, unknown> & { id: number }

async function all(payload: Payload, collection: CollectionSlug): Promise<Doc[]> {
  const { docs } = await payload.find({ collection, pagination: false, depth: 0, locale: 'de' })
  return docs as unknown as Doc[]
}

/** Compares the set of legacy keys; extra docs in Payload are listed (records removed in WordPress), not failed. */
function compareKeys(name: string, expected: (number | string)[], docs: Doc[], keyField = 'legacyWpId') {
  const actual = new Set(docs.map((doc) => doc[keyField]).filter((key) => key !== null && key !== undefined))
  const missing = expected.filter((key) => !actual.has(key))
  const expectedSet = new Set(expected)
  const extra = [...actual].filter((key) => !expectedSet.has(key as number | string))
  check(missing.length === 0, `${name}: all ${expected.length} extracted records exist in Payload${missing.length ? ` (missing: ${missing.slice(0, 10).join(', ')}…)` : ''}`)
  if (extra.length) notes.push(`${name}: ${extra.length} documents not in this extract (removed in WordPress?): ${extra.slice(0, 10).join(', ')}`)
}

async function main() {
  const payload = await startPayload(parseArgs())

  const categories = readExtract<ExtractedCategory>(EXTRACT_FILES.categories)
  const users = readExtract<ExtractedUser>(EXTRACT_FILES.users)
  const organizations = readExtract<ExtractedOrganization>(EXTRACT_FILES.organizations)
  const members = readExtract<ExtractedMember>(EXTRACT_FILES.members)
  const links = readExtract<ExtractedOrganizationMember>(EXTRACT_FILES.organizationMembers)

  const [pCategories, pUsers, pOrganizations, pMembers, pLinks] = await Promise.all(
    (['categories', 'users', 'organizations', 'members', 'organization-members'] as const).map((c) => all(payload, c)),
  )
  const legacyOf = (docs: Doc[]) => new Map(docs.map((doc) => [doc.id, doc.legacyWpId as number]))
  const userLegacy = legacyOf(pUsers)
  const memberLegacy = legacyOf(pMembers)
  const orgLegacy = legacyOf(pOrganizations)
  const categoryLegacy = legacyOf(pCategories)

  console.log('\nRecords')
  compareKeys('categories', categories.map((c) => c.legacyWpId), pCategories)
  compareKeys('users', users.map((u) => u.legacyWpId), pUsers)
  compareKeys('organizations', organizations.map((o) => o.legacyWpId), pOrganizations)
  compareKeys('members', members.map((m) => m.legacyWpId), pMembers)
  compareKeys('organization-members', links.map((l) => l.legacyKey), pLinks, 'legacyKey')

  console.log('\nUsers')
  const roleMismatch = users.filter((u) => {
    const doc = pUsers.find((d) => d.legacyWpId === u.legacyWpId)
    return doc && JSON.stringify(doc.roles) !== JSON.stringify(u.roles)
  })
  check(roleMismatch.length === 0, `roles match WordPress (admins: ${users.filter((u) => u.roles.includes('admin')).length})`)
  // legacyPasswordHash is hidden from the API, so count it in the database directly.
  const hashRows = (await payload.db.drizzle.execute(
    sql`SELECT count(*)::int AS n FROM users WHERE legacy_wp_id IS NOT NULL AND legacy_password_hash IS NOT NULL`,
  )) as unknown as { rows: { n: number }[] }
  const expectedHashes = users.filter((u) => u.legacyPasswordHash).length
  check(hashRows.rows[0].n === expectedHashes, `WordPress password hash stored for ${hashRows.rows[0].n}/${expectedHashes} users`)

  console.log('\nMembers')
  const byLegacy = new Map(pMembers.map((doc) => [doc.legacyWpId as number, doc]))
  const userLinkErrors = members.filter((m) => {
    const doc = byLegacy.get(m.legacyWpId)
    const actual = doc?.user ? userLegacy.get(doc.user as number) : null
    return (actual ?? null) !== m.user
  })
  check(userLinkErrors.length === 0, `login links match (${members.filter((m) => m.user).length} members with a login)`)
  const merged = members.flatMap((m) => m.legacy.mergedFromWpIds)
  const mergedInPayload = pMembers.flatMap((doc) => ((doc.legacy as { mergedFromWpIds?: number[] })?.mergedFromWpIds ?? []))
  check(
    merged.length === mergedInPayload.length && merged.every((id) => mergedInPayload.includes(id)),
    `${merged.length} merged duplicates recorded in legacy.mergedFromWpIds`,
  )
  const categoryErrors = members.filter((m) => {
    const doc = byLegacy.get(m.legacyWpId)
    const actual = ((doc?.categories as number[]) ?? []).map((id) => categoryLegacy.get(id)).sort()
    return JSON.stringify(actual) !== JSON.stringify([...m.categories].sort())
  })
  check(categoryErrors.length === 0, 'member categories match')

  console.log('\nOrganisation links')
  const linkErrors = links.filter((link) => {
    const doc = pLinks.find((d) => d.legacyKey === link.legacyKey)
    return (
      !doc ||
      doc.role !== link.role ||
      memberLegacy.get(doc.member as number) !== link.member ||
      orgLegacy.get(doc.organization as number) !== link.organization
    )
  })
  check(linkErrors.length === 0, `${links.length} links point to the right member and organisation, ${links.filter((l) => l.role === 'admin').length} admins`)

  console.log('\nSpot check (20 members, every field from the extract)')
  const step = Math.max(1, Math.floor(members.length / 20))
  const sample = members.filter((_, index) => index % step === 0).slice(0, 20)
  const skip = new Set(['legacyWpId', 'user', 'categories'])
  const normalize = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value ?? null, (key, v) => (key === 'id' ? undefined : v === undefined ? null : v)))
  let fieldErrors = 0
  for (const member of sample) {
    const doc = byLegacy.get(member.legacyWpId)
    for (const [field, expected] of Object.entries(member)) {
      if (skip.has(field)) continue
      const actual = normalize(doc?.[field])
      const want = normalize(expected)
      // Payload returns empty arrays for array fields and drops unset keys in groups; compare loosely on those.
      const same = JSON.stringify(actual) === JSON.stringify(want) || (Array.isArray(want) && want.length === 0 && actual === null)
      if (!same && !(typeof want === 'object' && want !== null && !Array.isArray(want) && subsetEqual(want, actual))) {
        fieldErrors++
        if (fieldErrors <= 10) console.log(`  member ${member.legacyWpId}.${field}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`)
      }
    }
  }
  check(fieldErrors === 0, `${sample.length} sampled members match field by field`)

  notes.forEach((note) => console.log(`ℹ ${note}`))
  console.log(errors.length ? `\n${errors.length} check(s) failed` : '\nAll checks passed')
  process.exit(errors.length ? 1 : 0)
}

/** Every key in `expected` has the same value in `actual` (Payload adds/omits nothing else we care about). */
function subsetEqual(expected: object, actual: unknown): boolean {
  if (typeof actual !== 'object' || actual === null) return false
  return Object.entries(expected).every(([key, value]) => {
    const other = (actual as Record<string, unknown>)[key]
    if (Array.isArray(value) && value.length === 0) return other == null || (Array.isArray(other) && other.length === 0)
    return JSON.stringify(value) === JSON.stringify(other ?? null)
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
