// What an import step is, and the helpers every step uses. One step per entity, in steps/<name>.ts;
// steps/index.ts lists them in dependency order.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { sql } from '@payloadcms/db-postgres'
import type { CollectionSlug, Payload, Where } from 'payload'

import type { Report } from '../../lib/report'
import type { UpsertAction } from '../../lib/upsert'
import { mapPool } from '../lib-env'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.resolve(HERE, '../../../../.data')
const EXTRACT_DIR = path.join(DATA_DIR, 'wp-extract')
export const CONCURRENCY = 4

export const readExtract = <T>(file: string): T[] => JSON.parse(readFileSync(path.join(EXTRACT_DIR, file), 'utf8'))

type SQL = ReturnType<typeof sql>

export type IdMap = Map<number | string, number>

export interface StepResult {
  counts: Partial<Record<UpsertAction | 'failed', number>>
}

export interface StepContext {
  payload: Payload
  report: Report
  dryRun: boolean
  /** WordPress IDs → Payload IDs; unknown IDs are dropped and reported. */
  resolve: (map: IdMap, ids: number[], ref: string, what: string) => number[]
}

export interface ImportStep {
  /** Used by --only and in the reports. */
  name: string
  /**
   * What a full import deletes first (wipe.ts), so the database matches the extract exactly.
   * `keep` excludes rows that weren't imported, e.g. the team's own accounts.
   */
  wipe: { table: string; keep?: SQL }
  run(ctx: StepContext): Promise<StepResult>
}

/** legacy key → Payload id, for resolving relationships. */
export async function idMap(payload: Payload, collection: CollectionSlug, keyField = 'legacyWpId', filter: Where = {}): Promise<IdMap> {
  const { docs } = await payload.find({
    collection,
    where: { and: [{ [keyField]: { exists: true } }, filter] },
    select: { [keyField]: true },
    pagination: false,
    depth: 0,
  })
  return new Map(docs.map((doc) => [(doc as unknown as Record<string, number | string>)[keyField], doc.id as number]))
}

/** Runs `run` over `items` (a few at a time), counting actions and turning errors into report warnings. */
export async function runItems<T>(
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

/** Unknown IDs aren't reported in dry runs, where the targets may not exist yet. */
export const resolver = (report: Report, dryRun: boolean): StepContext['resolve'] => (map, ids, ref, what) =>
  ids.flatMap((id) => {
    const resolved = map.get(id)
    if (resolved === undefined && !dryRun) report.warn(`import.unresolved-${what}`, ref, `${what} ${id} not found in Payload; dropped`)
    return resolved === undefined ? [] : [resolved]
  })
