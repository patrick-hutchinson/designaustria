import { EXTRACT_FILES, type ExtractedOrganizationMember } from '../../../lib/extract-types'
import { upsertByLegacyKey } from '../../../lib/upsert'
import { idMap, readExtract, runItems, type ImportStep } from '../step'

export const organizationMembers: ImportStep = {
  name: 'organization-members',
  wipe: { table: 'organization_members' },
  async run({ payload, report, dryRun, resolve }) {
    const organizationIds = await idMap(payload, 'organizations')
    const memberIds = await idMap(payload, 'members')
    const links = readExtract<ExtractedOrganizationMember>(EXTRACT_FILES.organizationMembers)
    return runItems('organization-members', links, report, async (link) => {
      const [organization] = resolve(organizationIds, [link.organization], link.legacyKey, 'organization')
      const [member] = resolve(memberIds, [link.member], link.legacyKey, 'member')
      if (!dryRun && (!organization || !member)) throw new Error('organization or member missing in Payload')
      return upsertByLegacyKey({
        payload,
        collection: 'organization-members',
        keyField: 'legacyKey',
        key: link.legacyKey,
        data: { organization, member, role: link.role },
        dryRun,
      })
    }, (link) => `link ${link.legacyKey}`)
  },
}
