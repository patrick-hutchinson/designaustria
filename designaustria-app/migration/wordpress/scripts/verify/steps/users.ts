import { sql } from '@payloadcms/db-postgres'

import { EXTRACT_FILES, type ExtractedUser } from '../../../lib/extract-types'
import { check, compareKeys, readExtract, type VerifyStep } from '../check'

export const users: VerifyStep = {
  name: 'users',
  async run({ payload, docs }) {
    const items = readExtract<ExtractedUser>(EXTRACT_FILES.users)
    const pUsers = await docs('users')
    compareKeys('users', items.map((u) => u.legacyWpId), pUsers)

    const roleMismatch = items.filter((u) => {
      const doc = pUsers.find((d) => d.legacyWpId === u.legacyWpId)
      return doc && JSON.stringify(doc.roles) !== JSON.stringify(u.roles)
    })
    check(roleMismatch.length === 0, `roles match WordPress (admins: ${items.filter((u) => u.roles.includes('admin')).length})`)
    // legacyPasswordHash is hidden from the API, so count it in the database directly.
    // Users with a password on the new site (legacy_password_retired_at) must not have a WordPress hash any more.
    const hashRows = (await payload.db.drizzle.execute(
      sql`SELECT legacy_wp_id AS id, legacy_password_hash IS NOT NULL AS has_hash, legacy_password_retired_at IS NOT NULL AS retired
          FROM users WHERE legacy_wp_id IS NOT NULL`,
    )) as unknown as { rows: { id: number; has_hash: boolean; retired: boolean }[] }
    const retired = new Set(hashRows.rows.filter((r) => r.retired).map((r) => Number(r.id))) // numeric column: string
    const withHash = hashRows.rows.filter((r) => r.has_hash).length
    const expectedHashes = items.filter((u) => u.legacyPasswordHash && !retired.has(u.legacyWpId)).length
    check(withHash === expectedHashes, `WordPress password hash stored for ${withHash}/${expectedHashes} users`)
    const retiredWithHash = hashRows.rows.filter((r) => r.retired && r.has_hash).length
    check(retiredWithHash === 0, `no WordPress hash on the ${retired.size} users who already have a password on the new site`)
  },
}
