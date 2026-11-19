import { readFileSync } from 'node:fs'

// Duplicate member profiles (plan §4). The decisions live in config/merges.json, reviewed and committed,
// so every run produces the same result. Nothing is merged automatically.

export interface MergeRule {
  /** WordPress member post that survives. */
  keep: number
  /** WordPress member posts folded into `keep` and not imported themselves. */
  mergeFrom: number[]
  /** Fields copied from the merged posts (first non-empty value wins); everything else comes from `keep`. */
  takeFromMerged?: string[]
  reason: string
  /** Provisional decision that still needs confirmation; reported as a warning on every run. */
  review?: boolean
}

export interface UnlinkRule {
  /** WordPress member post whose login link (da_member_user) is wrong and is dropped. */
  member: number
  reason: string
  review?: boolean
}

export interface MergeConfig {
  merges: MergeRule[]
  unlinkUser: UnlinkRule[]
}

export interface MergeableRecord {
  legacyWpId: number
  user?: number | null
  legacy?: { mergedFromWpIds?: number[] | null }
}

/** Field access by name (rules name fields as strings). */
const fields = (record: object) => record as Record<string, unknown>

const isPositiveInt = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0

export function validateMergeConfig(config: unknown): MergeConfig {
  const errors: string[] = []
  const c = config as Partial<MergeConfig>
  if (!c || !Array.isArray(c.merges) || !Array.isArray(c.unlinkUser)) {
    throw new Error('merges.json: expected { "merges": [...], "unlinkUser": [...] }')
  }
  const seen = new Map<number, string>()
  const claim = (id: number, where: string) => {
    if (seen.has(id)) errors.push(`post ${id} appears in ${seen.get(id)} and ${where}`)
    seen.set(id, where)
  }
  c.merges.forEach((rule, i) => {
    const where = `merges[${i}]`
    if (!isPositiveInt(rule.keep)) errors.push(`${where}.keep must be a post ID`)
    if (!Array.isArray(rule.mergeFrom) || rule.mergeFrom.length === 0 || !rule.mergeFrom.every(isPositiveInt)) {
      errors.push(`${where}.mergeFrom must be a non-empty list of post IDs`)
    }
    if (!rule.reason) errors.push(`${where}.reason is required`)
    if (rule.takeFromMerged && !rule.takeFromMerged.every((f) => typeof f === 'string' && f !== 'legacyWpId')) {
      errors.push(`${where}.takeFromMerged must list field names (not legacyWpId)`)
    }
    claim(rule.keep, where)
    rule.mergeFrom?.forEach((id) => claim(id, where))
  })
  c.unlinkUser.forEach((rule, i) => {
    if (!isPositiveInt(rule.member)) errors.push(`unlinkUser[${i}].member must be a post ID`)
    if (!rule.reason) errors.push(`unlinkUser[${i}].reason is required`)
  })
  if (errors.length) throw new Error(`merges.json is invalid:\n- ${errors.join('\n- ')}`)
  return c as MergeConfig
}

export const loadMergeConfig = (path: string): MergeConfig => validateMergeConfig(JSON.parse(readFileSync(path, 'utf8')))

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)

/**
 * Applies the merge and unlink rules. Throws if a rule points to a record that doesn't exist,
 * or if afterwards one login is still linked to more than one member (plan §2.2: one user ↔ one member).
 */
export function applyMerges<T extends MergeableRecord>(records: T[], config: MergeConfig): { records: T[]; warnings: string[] } {
  const warnings: string[] = []
  const byId = new Map(records.map((record) => [record.legacyWpId, structuredClone(record)]))
  const mustGet = (id: number, where: string): T => {
    const record = byId.get(id)
    if (!record) throw new Error(`merges.json: ${where} refers to member ${id}, which isn't in the extract`)
    return record
  }

  for (const rule of config.merges) {
    const keep = mustGet(rule.keep, `merge keep=${rule.keep}`)
    const merged = rule.mergeFrom.map((id) => mustGet(id, `merge keep=${rule.keep}`))
    for (const field of rule.takeFromMerged ?? []) {
      const source = merged.find((record) => !isEmpty(fields(record)[field]))
      if (source) fields(keep)[field] = fields(source)[field]
    }
    const previous = keep.legacy?.mergedFromWpIds ?? []
    keep.legacy = { ...keep.legacy, mergedFromWpIds: [...new Set([...previous, ...rule.mergeFrom])] } as T['legacy']
    rule.mergeFrom.forEach((id) => byId.delete(id))
    if (rule.review) warnings.push(`merge ${rule.mergeFrom.join(',')} → ${rule.keep} is provisional: ${rule.reason}`)
  }

  for (const rule of config.unlinkUser) {
    const record = mustGet(rule.member, `unlinkUser member=${rule.member}`)
    record.user = null
    if (rule.review) warnings.push(`unlink user from ${rule.member} is provisional: ${rule.reason}`)
  }

  const result = [...byId.values()]
  const byUser = new Map<number, number[]>()
  for (const record of result) {
    if (record.user) byUser.set(record.user, [...(byUser.get(record.user) ?? []), record.legacyWpId])
  }
  const conflicts = [...byUser].filter(([, members]) => members.length > 1)
  if (conflicts.length) {
    const list = conflicts.map(([user, members]) => `user ${user} → members ${members.join(', ')}`).join('; ')
    throw new Error(`A login is linked to more than one member after merging. Add a rule to merges.json: ${list}`)
  }

  return { records: result, warnings }
}
