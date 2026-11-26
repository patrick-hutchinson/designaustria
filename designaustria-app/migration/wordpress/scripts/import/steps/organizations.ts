import { EXTRACT_FILES, type ExtractedOrganization } from '../../../lib/extract-types'
import { upsertByLegacyKey } from '../../../lib/upsert'
import { idMap, readExtract, runItems, type ImportStep } from '../step'
import { contactData } from './contact'

export const organizations: ImportStep = {
  name: 'organizations',
  wipe: { table: 'organizations' },
  async run({ payload, report, dryRun, resolve }) {
    const categoryIds = await idMap(payload, 'categories')
    const items = readExtract<ExtractedOrganization>(EXTRACT_FILES.organizations)
    return runItems('organizations', items, report, (o) =>
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
        dryRun,
      }), (o) => `organization ${o.legacyWpId}`)
  },
}
