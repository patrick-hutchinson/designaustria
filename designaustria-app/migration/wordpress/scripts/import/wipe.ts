// Wipe before import: removes everything the WordPress import writes, so each run gives exactly the extract
// (records that are no longer migrated, e.g. pending profiles, don't linger). Plan §7.
//
// Each step declares what it wipes (steps/*.ts). Rows matched by its `keep` stay, e.g. accounts made on the new
// site for the team (no legacyWpId, role admin or staff). The child tables (arrays, rels, locales, sessions,
// preferences, locked documents) go with them via ON DELETE CASCADE. Tables are emptied in reverse step order,
// in one transaction: a failure leaves the database as it was.
//
// Never run this after go-live: it would delete everything members changed on the new site.

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { ImportStep } from './step'

type Counts = Record<string, number>

const kept = ({ keep }: ImportStep['wipe']) => keep ?? sql`false`

async function count(payload: Payload, steps: ImportStep[]): Promise<{ delete: Counts; keep: Counts }> {
  const result = { delete: {} as Counts, keep: {} as Counts }
  for (const step of steps) {
    const table = sql.identifier(step.wipe.table)
    const { rows } = await payload.db.drizzle.execute<{ wiped: string; kept: string }>(sql`SELECT
      count(*) FILTER (WHERE NOT (${kept(step.wipe)})) AS wiped,
      count(*) FILTER (WHERE ${kept(step.wipe)}) AS kept
      FROM ${table}`)
    result.delete[step.name] = Number(rows[0].wiped)
    if (step.wipe.keep) result.keep[step.name] = Number(rows[0].kept)
  }
  return result
}

export async function wipeImportedData(payload: Payload, steps: ImportStep[], { dryRun }: { dryRun: boolean }): Promise<void> {
  const reversed = [...steps].reverse()
  const before = await count(payload, reversed)
  console.log(`${dryRun ? 'Would wipe' : 'Wiping'} before import: ${JSON.stringify(before.delete)}`)
  if (before.keep.users !== undefined) {
    console.log(`Keeping ${before.keep.users} team account(s) made on the new site (no WordPress id, role admin or staff)`)
  }
  if (dryRun) return

  await payload.db.drizzle.transaction(async (tx) => {
    for (const step of reversed) {
      await tx.execute(sql`DELETE FROM ${sql.identifier(step.wipe.table)} WHERE NOT (${kept(step.wipe)})`)
    }
  })

  const after = await count(payload, reversed)
  const left = Object.entries(after.delete).filter(([, n]) => n > 0)
  if (left.length || JSON.stringify(after.keep) !== JSON.stringify(before.keep)) {
    throw new Error(`Wipe incomplete: ${JSON.stringify(after)}`)
  }
}
