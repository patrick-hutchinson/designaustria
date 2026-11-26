import { EXTRACT_FILES, type ExtractedMember } from '../../../lib/extract-types'
import { check, compareKeys, readExtract, sampleOf, spotCheck, type VerifyStep } from '../check'

export const members: VerifyStep = {
  name: 'members',
  async run({ docs, legacyOf }) {
    const items = readExtract<ExtractedMember>(EXTRACT_FILES.members)
    const pMembers = await docs('members')
    const userLegacy = await legacyOf('users')
    const categoryLegacy = await legacyOf('categories')
    compareKeys('members', items.map((m) => m.legacyWpId), pMembers)

    const byLegacy = new Map(pMembers.map((doc) => [doc.legacyWpId as number, doc]))
    const userLinkErrors = items.filter((m) => {
      const doc = byLegacy.get(m.legacyWpId)
      const actual = doc?.user ? userLegacy.get(doc.user as number) : null
      return (actual ?? null) !== m.user
    })
    check(userLinkErrors.length === 0, `login links match (${items.filter((m) => m.user).length} members with a login)`)
    const merged = items.flatMap((m) => m.legacy.mergedFromWpIds)
    const mergedInPayload = pMembers.flatMap((doc) => ((doc.legacy as { mergedFromWpIds?: number[] })?.mergedFromWpIds ?? []))
    check(
      merged.length === mergedInPayload.length && merged.every((id) => mergedInPayload.includes(id)),
      `${merged.length} merged duplicates recorded in legacy.mergedFromWpIds`,
    )
    const categoryErrors = items.filter((m) => {
      const doc = byLegacy.get(m.legacyWpId)
      const actual = ((doc?.categories as number[]) ?? []).map((id) => categoryLegacy.get(id)).sort()
      return JSON.stringify(actual) !== JSON.stringify([...m.categories].sort())
    })
    check(categoryErrors.length === 0, 'member categories match')

    console.log('Spot check (20 members, every field from the extract)')
    spotCheck('member', sampleOf(items), pMembers, new Set(['legacyWpId', 'user', 'categories']))
  },
}
