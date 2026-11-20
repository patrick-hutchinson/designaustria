// Extract: WordPress dump (MySQL container) → .data/wp-extract/*.json
// Read-only on WordPress. Deterministic: the same dump always produces byte-identical files.
//
// Usage (from designaustria-app/): npx tsx migration/wordpress/scripts/extract/run.ts
// Env: WP_MYSQL_URL (default mysql://root:wp@127.0.0.1:3307/wordpress)

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { EXTRACT_FILES } from '../../lib/extract-types'
import { loadMergeConfig } from '../../lib/merges'
import { connectWp, loadPostsWithMeta } from '../../lib/mysql'
import { parseId } from '../../lib/ids'
import { dropUsersOfUnmigratedMembers } from '../../lib/published'
import { Report } from '../../lib/report'
import { extractCategories } from './categories'
import { extractMembers } from './members'
import { extractOrganizations } from './organizations'
import { extractUsers } from './users'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIGRATION_DIR = path.resolve(HERE, '../..')
export const EXTRACT_DIR = path.resolve(MIGRATION_DIR, '../../.data/wp-extract')

const write = (file: string, data: unknown) => writeFileSync(path.join(EXTRACT_DIR, file), `${JSON.stringify(data, null, 2)}\n`)

async function main() {
  const report = new Report()
  const merges = loadMergeConfig(path.join(MIGRATION_DIR, 'config/merges.json'))
  const conn = await connectWp()

  try {
    const allUsers = await extractUsers(conn, report)

    const communities = await loadPostsWithMeta(conn, 'community')
    const memberPosts = await loadPostsWithMeta(conn, 'member')
    for (const { postId, key } of [...communities.duplicateKeys, ...memberPosts.duplicateKeys]) {
      report.warn('meta.duplicate-key', `post ${postId}`, `"${key}" stored more than once; newest value used`)
    }

    const { organizations, notMigrated: organizationsNotMigrated } = extractOrganizations(communities.posts, report)
    const { members, organizationMembers, mergeWarnings, notMigrated } = extractMembers(
      memberPosts.posts,
      {
        organizationIds: new Set(organizations.map((o) => o.legacyWpId)),
        userIds: new Set(allUsers.map((u) => u.legacyWpId)),
        merges,
      },
      report,
    )
    mergeWarnings.forEach((warning) => report.warn('merge.provisional', 'config/merges.json', warning))

    // Logins of former members go with their profile (plan §3.1).
    const { kept: users, dropped: droppedUsers } = dropUsersOfUnmigratedMembers(allUsers, {
      linkedInWp: new Set(memberPosts.posts.flatMap(({ meta }) => parseId(meta.da_member_user) ?? [])),
      linkedAfterMigration: new Set(members.flatMap((m) => m.user ?? [])),
    })
    report.forget(
      new Set([
        ...notMigrated.flatMap((m) => [m.legacyWpId, ...m.legacy.mergedFromWpIds]).map((id) => `member ${id}`),
        ...droppedUsers.map((u) => `user ${u.legacyWpId}`),
      ]),
    )

    const usedTerms = new Set([...organizations, ...members].flatMap((record) => record.categories))
    const categories = await extractCategories(conn, usedTerms, report)
    const known = new Set(categories.map((c) => c.legacyWpId))
    for (const record of [...organizations, ...members]) record.categories = record.categories.filter((id) => known.has(id))

    mkdirSync(EXTRACT_DIR, { recursive: true })
    write(EXTRACT_FILES.categories, categories)
    write(EXTRACT_FILES.users, users)
    write(EXTRACT_FILES.organizations, organizations)
    write(EXTRACT_FILES.members, members)
    write(EXTRACT_FILES.organizationMembers, organizationMembers)

    const summary = {
      source: {
        users: allUsers.length + report.entries.filter((e) => e.code === 'user.invalid-email').length,
        communityPosts: communities.posts.length,
        memberPosts: memberPosts.posts.length,
      },
      extracted: {
        categories: categories.length,
        users: users.length,
        organizations: organizations.length,
        members: members.length,
        organizationMembers: organizationMembers.length,
        organizationAdmins: organizationMembers.filter((link) => link.role === 'admin').length,
        membersMergedAway: members.reduce((sum, m) => sum + m.legacy.mergedFromWpIds.length, 0),
      },
      notMigrated: {
        organizations: organizationsNotMigrated,
        members: notMigrated.reduce((sum, m) => sum + 1 + m.legacy.mergedFromWpIds.length, 0),
        users: droppedUsers.length,
      },
    }
    write(EXTRACT_FILES.report, { ...summary, warnings: report.toJSON() })

    console.log(`Extracted to ${path.relative(process.cwd(), EXTRACT_DIR)}`)
    console.table(summary.extracted)
    console.log('Not migrated (not published on the current site, or the login of such a profile):')
    console.table(summary.notMigrated)
    console.log('Warnings by type (details in _report.json):')
    console.table(report.counts())
    mergeWarnings.forEach((warning) => console.warn(`⚠ ${warning}`))
  } finally {
    await conn.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
