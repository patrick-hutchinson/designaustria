// What a verify step is, and the helpers every step uses. One step per entity, in steps/<name>.ts.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CollectionSlug, Payload } from 'payload'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const EXTRACT_DIR = path.resolve(HERE, '../../../../.data/wp-extract')
export const readExtract = <T>(file: string): T[] => JSON.parse(readFileSync(path.join(EXTRACT_DIR, file), 'utf8'))

export type Doc = Record<string, unknown> & { id: number }

export interface VerifyContext {
  payload: Payload
  /** All documents of a collection (DE locale), loaded once per run. */
  docs(collection: CollectionSlug): Promise<Doc[]>
  /** Payload id → legacyWpId of a collection. */
  legacyOf(collection: CollectionSlug): Promise<Map<number, number>>
}

export interface VerifyStep {
  /** Matches the import step, for --only. */
  name: string
  run(ctx: VerifyContext): Promise<void>
}

export const errors: string[] = []
export const check = (ok: boolean, message: string) => {
  console.log(`${ok ? '✓' : '✗'} ${message}`)
  if (!ok) errors.push(message)
}

export function createContext(payload: Payload): VerifyContext {
  const loaded = new Map<CollectionSlug, Promise<Doc[]>>()
  const docs = (collection: CollectionSlug) => {
    if (!loaded.has(collection)) {
      loaded.set(collection, payload.find({ collection, pagination: false, depth: 0, locale: 'de' }).then((r) => r.docs as unknown as Doc[]))
    }
    return loaded.get(collection)!
  }
  const legacyOf = async (collection: CollectionSlug) => new Map((await docs(collection)).map((doc) => [doc.id, doc.legacyWpId as number]))
  return { payload, docs, legacyOf }
}

/** Compares the set of legacy keys. Extra docs fail too: a full import wipes first, so leftovers are records that must not be kept (plan §3.1). */
export function compareKeys(name: string, expected: (number | string)[], docs: Doc[], keyField = 'legacyWpId') {
  const actual = new Set(docs.map((doc) => doc[keyField]).filter((key) => key !== null && key !== undefined))
  const missing = expected.filter((key) => !actual.has(key))
  const expectedSet = new Set(expected)
  const extra = [...actual].filter((key) => !expectedSet.has(key as number | string))
  check(missing.length === 0, `${name}: all ${expected.length} extracted records exist in Payload${missing.length ? ` (missing: ${missing.slice(0, 10).join(', ')}…)` : ''}`)
  check(extra.length === 0, `${name}: no documents that aren't in this extract${extra.length ? ` (${extra.length}, e.g. ${extra.slice(0, 10).join(', ')}; run a full import, which wipes first)` : ''}`)
}

/**
 * Checks `sample` field by field against the documents (matched by legacyWpId). Fields in `skip` are relations or
 * keys that the step checks itself.
 */
export function spotCheck<T extends { legacyWpId: number }>(name: string, sample: T[], docs: Doc[], skip: Set<string>) {
  const byLegacy = new Map(docs.map((doc) => [doc.legacyWpId as number, doc]))
  const normalize = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value ?? null, (key, v) => (key === 'id' ? undefined : v === undefined ? null : v)))
  let fieldErrors = 0
  for (const record of sample) {
    const doc = byLegacy.get(record.legacyWpId)
    for (const [field, expected] of Object.entries(record)) {
      if (skip.has(field)) continue
      const actual = normalize(doc?.[field])
      const want = normalize(expected)
      // Payload returns empty arrays for array fields and drops unset keys in groups; compare loosely on those.
      const same = JSON.stringify(actual) === JSON.stringify(want) || (Array.isArray(want) && want.length === 0 && actual === null)
      if (!same && !(typeof want === 'object' && want !== null && !Array.isArray(want) && subsetEqual(want, actual))) {
        fieldErrors++
        if (fieldErrors <= 10) console.log(`  ${name} ${record.legacyWpId}.${field}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`)
      }
    }
  }
  check(fieldErrors === 0, `${sample.length} sampled ${name}s match field by field`)
}

/** Every `count`-th record, at most `count` of them. */
export const sampleOf = <T>(records: T[], count = 20): T[] => {
  const step = Math.max(1, Math.floor(records.length / count))
  return records.filter((_, index) => index % step === 0).slice(0, count)
}

/** Every key in `expected` has the same value in `actual` (Payload adds/omits nothing else we care about). */
function subsetEqual(expected: object, actual: unknown): boolean {
  if (typeof actual !== 'object' || actual === null) return false
  return Object.entries(expected).every(([key, value]) => {
    const other = (actual as Record<string, unknown>)[key]
    if (Array.isArray(value) && value.length === 0) return other == null || (Array.isArray(other) && other.length === 0)
    return JSON.stringify(value) === JSON.stringify(other ?? null)
  })
}
