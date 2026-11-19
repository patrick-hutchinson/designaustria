// Login accounts (wp_users). Personal data lives on the member profile, so only email, role and hash are taken.

import type { ExtractedUser } from '../../lib/extract-types'
import { query, type WpConnection } from '../../lib/mysql'
import { tryUnserialize } from '../../lib/php-unserialize'
import type { Report } from '../../lib/report'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function extractUsers(conn: WpConnection, report: Report): Promise<ExtractedUser[]> {
  const rows = await query<{ ID: number; user_email: string; user_pass: string; capabilities: string | null }>(
    conn,
    `SELECT u.ID, u.user_email, u.user_pass, c.meta_value AS capabilities
     FROM wp_users u
     LEFT JOIN wp_usermeta c ON c.user_id = u.ID AND c.meta_key = 'wp_capabilities'
     ORDER BY u.ID`,
  )

  const users: ExtractedUser[] = []
  const seen = new Map<string, number>()
  for (const row of rows) {
    const ref = `user ${row.ID}`
    const email = row.user_email.trim().toLowerCase()
    if (!EMAIL.test(email)) {
      report.warn('user.invalid-email', ref, `invalid email "${row.user_email}"; user skipped`)
      continue
    }
    if (seen.has(email)) {
      throw new Error(`Two WordPress users share the email ${email} (users ${seen.get(email)} and ${row.ID}). Resolve before importing.`)
    }
    seen.set(email, row.ID)

    const caps = (tryUnserialize(row.capabilities ?? '') ?? {}) as Record<string, boolean>
    const roles: ExtractedUser['roles'] = caps.administrator ? ['admin'] : ['member']
    if (!caps.administrator && !caps.member) report.warn('user.no-role', ref, 'no WordPress role; imported as member')

    users.push({ legacyWpId: row.ID, email, roles, legacyPasswordHash: row.user_pass || null })
  }
  return users
}
