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
import { extractEvents } from './events'
import { extractMembers } from './members'
import { extractPosts } from './posts'
import { extractProducts } from './products'
import { extractShopProducts } from './shop-products'
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

    const { events, redirects: eventRedirects, source: eventPosts, notMigrated: eventsNotMigrated } = await extractEvents(conn, report)
    const { posts, redirects: postRedirects, source: wpPosts, notMigrated: postsNotMigrated } = await extractPosts(conn, report)
    // Products link to members (as authors), so they come after them. Merged-away duplicates point at the member they were merged into.
    const migratedMemberOf = new Map(members.flatMap((m) => [m.legacyWpId, ...m.legacy.mergedFromWpIds].map((id) => [id, m.legacyWpId] as const)))
    const {
      products,
      redirects: productRedirects,
      source: publicationPosts,
      notMigrated: productsNotMigrated,
    } = await extractProducts(conn, { memberPosts: memberPosts.posts, migratedMemberOf }, report)
    const { shopProducts, redirects: shopProductRedirects } = await extractShopProducts(conn, products, report)
    const redirects = [...eventRedirects, ...postRedirects, ...productRedirects, ...shopProductRedirects]

    // Categories last: they keep only the terms something migrated uses.
    const withCategories = [...organizations, ...members, ...events, ...posts, ...products]
    const usedTerms = new Set(withCategories.flatMap((record) => record.categories))
    const categories = await extractCategories(conn, usedTerms, report)
    const known = new Set(categories.map((c) => c.legacyWpId))
    for (const record of withCategories) record.categories = record.categories.filter((id) => known.has(id))

    mkdirSync(EXTRACT_DIR, { recursive: true })
    write(EXTRACT_FILES.categories, categories)
    write(EXTRACT_FILES.users, users)
    write(EXTRACT_FILES.organizations, organizations)
    write(EXTRACT_FILES.members, members)
    write(EXTRACT_FILES.organizationMembers, organizationMembers)
    write(EXTRACT_FILES.events, events)
    write(EXTRACT_FILES.posts, posts)
    write(EXTRACT_FILES.products, products)
    write(EXTRACT_FILES.shopProducts, shopProducts)
    write(EXTRACT_FILES.redirects, redirects)

    const summary = {
      source: {
        users: allUsers.length + report.entries.filter((e) => e.code === 'user.invalid-email').length,
        communityPosts: communities.posts.length,
        memberPosts: memberPosts.posts.length,
        eventPosts,
        wpPosts,
        publicationPosts,
      },
      extracted: {
        categories: categories.length,
        users: users.length,
        organizations: organizations.length,
        members: members.length,
        organizationMembers: organizationMembers.length,
        organizationAdmins: organizationMembers.filter((link) => link.role === 'admin').length,
        membersMergedAway: members.reduce((sum, m) => sum + m.legacy.mergedFromWpIds.length, 0),
        events: events.length,
        eventsTranslated: events.filter((e) => e.legacy.enWpId !== null).length,
        posts: posts.length,
        postsTranslated: posts.filter((p) => p.legacy.enWpId !== null).length,
        products: products.length,
        productsForSale: products.filter((p) => p.shopSku).length,
        shopProducts: shopProducts.length,
        redirects: redirects.length,
      },
      notMigrated: {
        organizations: organizationsNotMigrated,
        members: notMigrated.reduce((sum, m) => sum + 1 + m.legacy.mergedFromWpIds.length, 0),
        users: droppedUsers.length,
        eventPostsByReason: eventsNotMigrated,
        wpPostsByReason: postsNotMigrated,
        publicationPostsByReason: productsNotMigrated,
      },
    }
    write(EXTRACT_FILES.report, { ...summary, warnings: report.toJSON() })

    console.log(`Extracted to ${path.relative(process.cwd(), EXTRACT_DIR)}`)
    console.table(summary.extracted)
    console.log('Not migrated (not published on the current site, the login of such a profile, an event without a start date, a pending post or a draft publication):')
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
