// Wipe before import: removes everything the WordPress import writes, so each run gives exactly the extract
// (records that are no longer migrated, e.g. pending profiles, don't linger). Plan §7.
//
// Kept: accounts made on the new site for the team (no legacyWpId, role admin or staff).
// Everything else in users, members, organizations, organization-members and categories is deleted. The child
// tables (arrays, rels, locales, sessions, preferences, locked documents) go with them via ON DELETE CASCADE.
// One transaction: a failure leaves the database as it was.
//
// Never run this after go-live: it would delete everything members changed on the new site.

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

const KEEP_USER = sql`legacy_wp_id IS NULL AND EXISTS (
  SELECT 1 FROM users_roles r WHERE r.parent_id = users.id AND r.value IN ('admin', 'staff')
)`

type Counts = Record<string, number>

async function count(payload: Payload): Promise<{ delete: Counts; keptAccounts: number }> {
  const { rows } = await payload.db.drizzle.execute<Record<string, string>>(sql`SELECT
    (SELECT count(*) FROM organization_members) AS "organization-members",
    (SELECT count(*) FROM members) AS members,
    (SELECT count(*) FROM organizations) AS organizations,
    (SELECT count(*) FROM users WHERE NOT (${KEEP_USER})) AS users,
    (SELECT count(*) FROM categories) AS categories,
    (SELECT count(*) FROM users WHERE ${KEEP_USER}) AS kept`)
  const { kept, ...rest } = rows[0]
  return { delete: Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, Number(v)])), keptAccounts: Number(kept) }
}

export async function wipeImportedData(payload: Payload, { dryRun }: { dryRun: boolean }): Promise<void> {
  const before = await count(payload)
  console.log(`${dryRun ? 'Would wipe' : 'Wiping'} before import: ${JSON.stringify(before.delete)}`)
  console.log(`Keeping ${before.keptAccounts} team account(s) made on the new site (no WordPress id, role admin or staff)`)
  if (dryRun) return

  await payload.db.drizzle.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM organization_members`)
    await tx.execute(sql`DELETE FROM members`)
    await tx.execute(sql`DELETE FROM organizations`)
    await tx.execute(sql`DELETE FROM users WHERE NOT (${KEEP_USER})`)
    await tx.execute(sql`DELETE FROM categories`)
  })

  const after = await count(payload)
  const left = Object.entries(after.delete).filter(([, n]) => n > 0)
  if (left.length || after.keptAccounts !== before.keptAccounts) {
    throw new Error(`Wipe incomplete: ${JSON.stringify(after)}`)
  }
}
