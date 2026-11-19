// Import: .data/wp-extract/*.json → Payload (Local API). Upserts by legacy key, so it can be rerun safely.
//
// Usage (from designaustria-app/):
//   DATABASE_URL=postgres://payload:payload@127.0.0.1:5433/payload \
//     npx tsx migration/wordpress/scripts/import/run.ts [--dry-run] [--only=users,members] [--allow-remote]
//
// Collections, in dependency order: categories, users, organizations, members, organization-members.

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CollectionSlug, Payload, Where } from 'payload'

import {
  EXTRACT_FILES,
  type ExtractedCategory,
  type ExtractedContact,
  type ExtractedMember,
  type ExtractedOrganization,
  type ExtractedOrganizationMember,
  type ExtractedUser,
} from '../../lib/extract-types'
import { Report } from '../../lib/report'
import { upsertByLegacyKey, type UpsertAction } from '../../lib/upsert'
import { mapPool, parseArgs, startPayload } from '../lib-env'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(HERE, '../../../../.data')
const EXTRACT_DIR = path.join(DATA_DIR, 'wp-extract')
const CONCURRENCY = 4

const readExtract = <T>(file: string): T[] => JSON.parse(readFileSync(path.join(EXTRACT_DIR, file), 'utf8'))

type IdMap = Map<number | string, number>

/** legacy key → Payload id, for resolving relationships. */
async function idMap(payload: Payload, collection: CollectionSlug, keyField = 'legacyWpId', filter: Where = {}): Promise<IdMap> {
  const { docs } = await payload.find({
    collection,
    where: { and: [{ [keyField]: { exists: true } }, filter] },
    select: { [keyField]: true },
    pagination: false,
    depth: 0,
  })
  return new Map(docs.map((doc) => [(doc as unknown as Record<string, number | string>)[keyField], doc.id as number]))
}

interface StepResult {
  counts: Partial<Record<UpsertAction | 'failed', number>>
}

async function runStep<T>(
  name: string,
  items: T[],
  report: Report,
  run: (item: T) => Promise<{ action: UpsertAction }>,
  ref: (item: T) => string,
): Promise<StepResult> {
  const counts: StepResult['counts'] = {}
  const started = Date.now()
  await mapPool(items, CONCURRENCY, async (item) => {
    try {
      const { action } = await run(item)
      counts[action] = (counts[action] ?? 0) + 1
    } catch (error) {
      counts.failed = (counts.failed ?? 0) + 1
      report.warn(`import.${name}.failed`, ref(item), error instanceof Error ? error.message : String(error))
    }
  })
  console.log(`${name.padEnd(22)} ${JSON.stringify(counts)}  (${((Date.now() - started) / 1000).toFixed(1)}s)`)
  return { counts }
}

/** Resolves WordPress IDs; unknown IDs are dropped and reported (not in dry runs, where targets may not exist yet). */
const resolver = (report: Report, dryRun: boolean) => (map: IdMap, ids: number[], ref: string, what: string) =>
  ids.flatMap((id) => {
    const resolved = map.get(id)
    if (resolved === undefined && !dryRun) report.warn(`import.unresolved-${what}`, ref, `${what} ${id} not found in Payload; dropped`)
    return resolved === undefined ? [] : [resolved]
  })

const contactData = (record: ExtractedContact) => ({
  addresses: record.addresses,
  phones: record.phones,
  links: record.links,
  portfolio: record.portfolio,
  documents: record.documents,
})

async function main() {
  const args = parseArgs()
  const payload = await startPayload(args)
  const report = new Report()
  const resolve = resolver(report, args.dryRun)
  const wants = (name: string) => !args.only || args.only.has(name)
  const results: Record<string, StepResult> = {}
  console.log(args.dryRun ? 'DRY RUN: nothing is written\n' : '')

  // categories: two passes so parents exist before they're referenced
  if (wants('categories')) {
    const categories = readExtract<ExtractedCategory>(EXTRACT_FILES.categories)
    results.categories = await runStep('categories', categories, report, async (c) => {
      const result = await upsertByLegacyKey({
        payload,
        collection: 'categories',
        key: c.legacyWpId,
        data: { title: c.title.de, slug: c.slug },
        locale: 'de',
        dryRun: args.dryRun,
      })
      if (c.title.en && result.id && !args.dryRun) {
        await payload.update({ collection: 'categories', id: result.id, data: { title: c.title.en }, locale: 'en', depth: 0 })
      }
      return result
    }, (c) => `category ${c.legacyWpId}`)
    if (!args.dryRun) {
      const map = await idMap(payload, 'categories')
      await mapPool(categories.filter((c) => c.parent), CONCURRENCY, async (c) => {
        const [parent] = resolve(map, [c.parent!], `category ${c.legacyWpId}`, 'category')
        await payload.update({ collection: 'categories', id: map.get(c.legacyWpId)!, data: { parent: parent ?? null }, depth: 0 })
      })
    }
  }

  if (wants('users')) {
    const users = readExtract<ExtractedUser>(EXTRACT_FILES.users)
    // Users who already have a password on the new site (first login, change or reset) keep it: their WordPress
    // hash is never written again, or an old WordPress password could replace the new one (plan §6).
    const retired = await idMap(payload, 'users', 'legacyWpId', { legacyPasswordRetiredAt: { exists: true } })
    if (retired.size) console.log(`users: ${retired.size} already have a password on the new site; WordPress hash not written`)
    results.users = await runStep('users', users, report, (u) =>
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
        dryRun: args.dryRun,
      }), (u) => `user ${u.legacyWpId}`)
  }

  const categoryIds = await idMap(payload, 'categories')

  if (wants('organizations')) {
    const organizations = readExtract<ExtractedOrganization>(EXTRACT_FILES.organizations)
    results.organizations = await runStep('organizations', organizations, report, (o) =>
      upsertByLegacyKey({
        payload,
        collection: 'organizations',
        key: o.legacyWpId,
        data: {
          name: o.name,
          slug: o.slug,
          profileStatus: o.profileStatus,
          memberNumber: o.memberNumber,
          partnerStatus: o.partnerStatus,
          about: o.about,
          categories: resolve(categoryIds, o.categories, `organization ${o.legacyWpId}`, 'category'),
          ...contactData(o),
          legacy: o.legacy,
        },
        dryRun: args.dryRun,
      }), (o) => `organization ${o.legacyWpId}`)
  }

  if (wants('members')) {
    const userIds = await idMap(payload, 'users')
    const members = readExtract<ExtractedMember>(EXTRACT_FILES.members)
    results.members = await runStep('members', members, report, (m) => {
      const ref = `member ${m.legacyWpId}`
      const { legacyWpId, user, categories, ...rest } = m
      return upsertByLegacyKey({
        payload,
        collection: 'members',
        key: legacyWpId,
        data: {
          ...rest,
          user: user ? (resolve(userIds, [user], ref, 'user')[0] ?? null) : null,
          categories: resolve(categoryIds, categories, ref, 'category'),
        },
        dryRun: args.dryRun,
      })
    }, (m) => `member ${m.legacyWpId}`)
  }

  if (wants('organization-members')) {
    const organizationIds = await idMap(payload, 'organizations')
    const memberIds = await idMap(payload, 'members')
    const links = readExtract<ExtractedOrganizationMember>(EXTRACT_FILES.organizationMembers)
    results['organization-members'] = await runStep('organization-members', links, report, async (link) => {
      const [organization] = resolve(organizationIds, [link.organization], link.legacyKey, 'organization')
      const [member] = resolve(memberIds, [link.member], link.legacyKey, 'member')
      if (!args.dryRun && (!organization || !member)) throw new Error('organization or member missing in Payload')
      return upsertByLegacyKey({
        payload,
        collection: 'organization-members',
        keyField: 'legacyKey',
        key: link.legacyKey,
        data: { organization, member, role: link.role },
        dryRun: args.dryRun,
      })
    }, (link) => `link ${link.legacyKey}`)
  }

  const out = path.join(DATA_DIR, 'wp-import')
  mkdirSync(out, { recursive: true })
  writeFileSync(path.join(out, '_report.json'), `${JSON.stringify({ dryRun: args.dryRun, results, warnings: report.toJSON() }, null, 2)}\n`)
  const counts = report.counts()
  if (Object.keys(counts).length) {
    console.log('\nWarnings by type (details in .data/wp-import/_report.json):')
    console.table(counts)
  }
  const failed = Object.values(results).some((r) => r.counts.failed)
  if (failed) process.exitCode = 1
  process.exit()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
