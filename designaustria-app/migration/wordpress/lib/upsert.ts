import type { CollectionSlug, Payload, Where } from 'payload'

// Idempotent write: find the document by its legacy key, update it if it exists, create it otherwise.
// A rerun therefore never duplicates; it brings existing documents up to date.

export type UpsertAction = 'created' | 'updated' | 'would-create' | 'would-update'

export interface UpsertArgs {
  payload: Payload
  collection: CollectionSlug
  /** Legacy key field, `legacyWpId` for most collections. */
  keyField?: string
  key: number | string
  data: Record<string, unknown>
  dryRun?: boolean
}

/** Marks writes coming from the migration; hooks that send email or call external services must skip when set. */
export const MIGRATION_CONTEXT = { isMigration: true } as const

export async function upsertByLegacyKey({
  payload,
  collection,
  keyField = 'legacyWpId',
  key,
  data,
  dryRun = false,
}: UpsertArgs): Promise<{ action: UpsertAction; id: number | string | null }> {
  const where: Where = { [keyField]: { equals: key } }
  const existing = await payload.find({ collection, where, limit: 2, depth: 0, pagination: false, select: {} })
  if (existing.docs.length > 1) throw new Error(`${collection}: more than one document with ${keyField}=${key}`)

  const found = existing.docs[0]
  const body = { ...data, [keyField]: key } as never

  if (dryRun) return { action: found ? 'would-update' : 'would-create', id: found?.id ?? null }

  if (found) {
    await payload.update({ collection, id: found.id, data: body, depth: 0, context: MIGRATION_CONTEXT })
    return { action: 'updated', id: found.id }
  }
  const created = await payload.create({
    collection,
    data: body,
    depth: 0,
    context: MIGRATION_CONTEXT,
    // Imported logins must not receive a verification or welcome mail.
    ...(collection === 'users' ? { disableVerificationEmail: true } : {}),
  })
  return { action: 'created', id: created.id }
}
