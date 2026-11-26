import { EXTRACT_FILES, type ExtractedMember } from '../../../lib/extract-types'
import { upsertByLegacyKey } from '../../../lib/upsert'
import { idMap, readExtract, runItems, type ImportStep } from '../step'

export const members: ImportStep = {
  name: 'members',
  wipe: { table: 'members' },
  async run({ payload, report, dryRun, resolve }) {
    const userIds = await idMap(payload, 'users')
    const categoryIds = await idMap(payload, 'categories')
    const items = readExtract<ExtractedMember>(EXTRACT_FILES.members)
    return runItems('members', items, report, (m) => {
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
        dryRun,
      })
    }, (m) => `member ${m.legacyWpId}`)
  },
}
