import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { applyMerges, loadMergeConfig, validateMergeConfig, type MergeConfig } from './merges'

const record = (legacyWpId: number, fields: Record<string, unknown> = {}) => ({
  legacyWpId,
  user: null as number | null,
  tier: null as string | null,
  honorary: null as string | null,
  firstName: `name-${legacyWpId}`,
  legacy: {},
  ...fields,
})

const config = (partial: Partial<MergeConfig>): MergeConfig => ({ merges: [], unlinkUser: [], ...partial })

describe('applyMerges', () => {
  it('bulk copy: keeps the original, takes login and tier from the copy', () => {
    const records = [
      record(3669, { tier: null, honorary: 'member' }),
      record(25022, { user: 1256, tier: 'standard', firstName: 'copy' }),
      record(1),
    ]
    const { records: out } = applyMerges(
      records,
      config({ merges: [{ keep: 3669, mergeFrom: [25022], takeFromMerged: ['user', 'tier'], reason: 'bulk copy' }] }),
    )
    expect(out.map((r) => r.legacyWpId)).toEqual([3669, 1])
    expect(out[0]).toMatchObject({
      user: 1256,
      tier: 'standard',
      honorary: 'member',
      firstName: 'name-3669',
      legacy: { mergedFromWpIds: [25022] },
    })
  })

  it('does not overwrite with empty values from the merged record', () => {
    const { records: out } = applyMerges(
      [record(1, { tier: 'retiree' }), record(2, { tier: null })],
      config({ merges: [{ keep: 1, mergeFrom: [2], takeFromMerged: ['tier'], reason: 'x' }] }),
    )
    expect(out[0].tier).toBe('retiree')
  })

  it('unlinks a wrongly copied login', () => {
    const { records: out } = applyMerges(
      [record(8597, { user: 231 }), record(31740, { user: 231 })],
      config({ unlinkUser: [{ member: 31740, reason: 'clone' }] }),
    )
    expect(out.find((r) => r.legacyWpId === 31740)?.user).toBeNull()
    expect(out.find((r) => r.legacyWpId === 8597)?.user).toBe(231)
  })

  it('fails when a login is still linked to two members', () => {
    expect(() => applyMerges([record(1, { user: 9 }), record(2, { user: 9 })], config({}))).toThrow(/user 9 → members 1, 2/)
  })

  it('fails when a rule refers to a member that is not in the extract', () => {
    expect(() => applyMerges([record(1)], config({ merges: [{ keep: 1, mergeFrom: [404], reason: 'x' }] }))).toThrow(/404/)
  })

  it('reports provisional rules as warnings', () => {
    const { warnings } = applyMerges(
      [record(1), record(2)],
      config({ merges: [{ keep: 1, mergeFrom: [2], reason: 'unsure', review: true }] }),
    )
    expect(warnings).toEqual(['merge 2 → 1 is provisional: unsure'])
  })

  it('does not mutate the input', () => {
    const input = [record(1), record(2, { user: 5 })]
    applyMerges(input, config({ merges: [{ keep: 1, mergeFrom: [2], takeFromMerged: ['user'], reason: 'x' }] }))
    expect(input[0].user).toBeNull()
    expect(input).toHaveLength(2)
  })
})

describe('validateMergeConfig', () => {
  it('rejects a post used in two rules', () => {
    expect(() =>
      validateMergeConfig({
        merges: [
          { keep: 1, mergeFrom: [2], reason: 'a' },
          { keep: 3, mergeFrom: [2], reason: 'b' },
        ],
        unlinkUser: [],
      }),
    ).toThrow(/post 2 appears in merges\[0\] and merges\[1\]/)
  })

  it('rejects missing fields', () => {
    expect(() => validateMergeConfig({ merges: [{ keep: 1, mergeFrom: [] }], unlinkUser: [] })).toThrow(/mergeFrom/)
    expect(() => validateMergeConfig({})).toThrow(/expected/)
  })

  it('accepts the committed config/merges.json', () => {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/merges.json')
    const loaded = loadMergeConfig(file)
    expect(loaded.merges.length).toBeGreaterThan(0)
  })
})
