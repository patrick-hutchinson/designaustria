// Only profiles that are visible on the current site are migrated (plan §3.1).
// designaustria: "pending" profiles are deactivated former members (and newsletter-only contacts), and keeping them
// is a data protection problem. Draft and private profiles aren't visible either.

import type { ProfileStatus } from './extract-types'

interface MemberLike {
  legacyWpId: number
  profileStatus: ProfileStatus
  user?: number | null
  legacy: { mergedFromWpIds: number[] }
}

/**
 * Keeps published profiles. Runs **after** the merges, so a published profile still gets the login and tier
 * that sat on its pending duplicate. Throws if a merge rule would drop a published profile (it was folded into
 * a profile that isn't published), because that profile is visible on the site today.
 */
export function keepPublishedMembers<T extends MemberLike>(
  records: T[],
  statusById: Map<number, ProfileStatus>,
): { kept: T[]; dropped: T[] } {
  const kept: T[] = []
  const dropped: T[] = []
  for (const record of records) {
    if (record.profileStatus === 'publish') {
      kept.push(record)
      continue
    }
    const published = record.legacy.mergedFromWpIds.filter((id) => statusById.get(id) === 'publish')
    if (published.length) {
      throw new Error(
        `merges.json: published member ${published.join(', ')} is merged into ${record.legacyWpId}, which isn't published, so it would not be migrated. Keep the published profile instead.`,
      )
    }
    dropped.push(record)
  }
  return { kept, dropped }
}

/**
 * Drops logins that only belong to profiles that aren't migrated (former members).
 * Logins without any profile (staff, some shop customers) and admins are kept.
 */
export function dropUsersOfUnmigratedMembers<T extends { legacyWpId: number; roles: string[] }>(
  users: T[],
  { linkedInWp, linkedAfterMigration }: { linkedInWp: Set<number>; linkedAfterMigration: Set<number> },
): { kept: T[]; dropped: T[] } {
  const kept: T[] = []
  const dropped: T[] = []
  for (const user of users) {
    const orphaned = linkedInWp.has(user.legacyWpId) && !linkedAfterMigration.has(user.legacyWpId)
    if (orphaned && !user.roles.includes('admin')) dropped.push(user)
    else kept.push(user)
  }
  return { kept, dropped }
}
