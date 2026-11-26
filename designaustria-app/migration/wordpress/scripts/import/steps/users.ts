import { randomBytes } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'

import { EXTRACT_FILES, type ExtractedUser } from '../../../lib/extract-types'
import { upsertByLegacyKey } from '../../../lib/upsert'
import { idMap, readExtract, runItems, type ImportStep } from '../step'

export const users: ImportStep = {
  name: 'users',
  // Accounts made on the new site for the team (no legacyWpId, role admin or staff) are kept.
  wipe: {
    table: 'users',
    keep: sql`legacy_wp_id IS NULL AND EXISTS (
      SELECT 1 FROM users_roles r WHERE r.parent_id = users.id AND r.value IN ('admin', 'staff')
    )`,
  },
  async run({ payload, report, dryRun }) {
    const items = readExtract<ExtractedUser>(EXTRACT_FILES.users)
    // Users who already have a password on the new site (first login, change or reset) keep it: their WordPress
    // hash is never written again, or an old WordPress password could replace the new one (plan §6).
    const retired = await idMap(payload, 'users', 'legacyWpId', { legacyPasswordRetiredAt: { exists: true } })
    if (retired.size) console.log(`users: ${retired.size} already have a password on the new site; WordPress hash not written`)
    return runItems('users', items, report, (u) =>
      upsertByLegacyKey({
        payload,
        collection: 'users',
        key: u.legacyWpId,
        // Otherwise the WP hash is written on every run until go-live (WordPress stays the source of truth until cutover).
        data: {
          email: u.email,
          roles: u.roles,
          ...(retired.has(u.legacyWpId) ? {} : { legacyPasswordHash: u.legacyPasswordHash }),
        },
        // Unusable random password; the first login checks the WP hash instead (plan §6).
        createOnly: { password: randomBytes(32).toString('base64url') },
        dryRun,
      }), (u) => `user ${u.legacyWpId}`)
  },
}
