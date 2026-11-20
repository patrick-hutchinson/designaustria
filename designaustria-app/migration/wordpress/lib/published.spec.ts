import { describe, expect, it } from 'vitest'

import type { ProfileStatus } from './extract-types'
import { dropUsersOfUnmigratedMembers, keepPublishedMembers } from './published'

const member = (legacyWpId: number, profileStatus: ProfileStatus, mergedFromWpIds: number[] = []) => ({
  legacyWpId,
  profileStatus,
  user: null,
  legacy: { mergedFromWpIds },
})

describe('keepPublishedMembers', () => {
  it('keeps published profiles and drops pending, draft and private ones', () => {
    const records = [member(1, 'publish'), member(2, 'pending'), member(3, 'draft'), member(4, 'private')]
    const { kept, dropped } = keepPublishedMembers(records, new Map())
    expect(kept.map((m) => m.legacyWpId)).toEqual([1])
    expect(dropped.map((m) => m.legacyWpId)).toEqual([2, 3, 4])
  })

  it('keeps a published profile that absorbed a pending duplicate', () => {
    const statuses = new Map<number, ProfileStatus>([[25022, 'pending']])
    const { kept } = keepPublishedMembers([member(3926, 'publish', [25022])], statuses)
    expect(kept).toHaveLength(1)
  })

  it('drops a pending profile that absorbed another pending one', () => {
    const statuses = new Map<number, ProfileStatus>([[25022, 'pending']])
    const { dropped } = keepPublishedMembers([member(3669, 'pending', [25022])], statuses)
    expect(dropped).toHaveLength(1)
  })

  it('throws when a published profile was merged into one that is not migrated', () => {
    const statuses = new Map<number, ProfileStatus>([[3015, 'publish']])
    expect(() => keepPublishedMembers([member(32011, 'pending', [3015])], statuses)).toThrow(/published member 3015/)
  })
})

describe('dropUsersOfUnmigratedMembers', () => {
  const user = (legacyWpId: number, roles: string[] = ['member']) => ({ legacyWpId, roles })

  it('drops logins whose only profiles are not migrated, keeps the rest', () => {
    const users = [user(1), user(2), user(3), user(4, ['admin'])]
    const { kept, dropped } = dropUsersOfUnmigratedMembers(users, {
      linkedInWp: new Set([1, 2, 4]),
      linkedAfterMigration: new Set([1]),
    })
    // 1: migrated profile; 3: no profile at all; 4: admin
    expect(kept.map((u) => u.legacyWpId)).toEqual([1, 3, 4])
    expect(dropped.map((u) => u.legacyWpId)).toEqual([2])
  })
})
