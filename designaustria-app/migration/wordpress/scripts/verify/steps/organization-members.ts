import { EXTRACT_FILES, type ExtractedOrganizationMember } from '../../../lib/extract-types'
import { check, compareKeys, readExtract, type VerifyStep } from '../check'

export const organizationMembers: VerifyStep = {
  name: 'organization-members',
  async run({ docs, legacyOf }) {
    const links = readExtract<ExtractedOrganizationMember>(EXTRACT_FILES.organizationMembers)
    const pLinks = await docs('organization-members')
    const memberLegacy = await legacyOf('members')
    const orgLegacy = await legacyOf('organizations')
    compareKeys('organization-members', links.map((l) => l.legacyKey), pLinks, 'legacyKey')

    const linkErrors = links.filter((link) => {
      const doc = pLinks.find((d) => d.legacyKey === link.legacyKey)
      return (
        !doc ||
        doc.role !== link.role ||
        memberLegacy.get(doc.member as number) !== link.member ||
        orgLegacy.get(doc.organization as number) !== link.organization
      )
    })
    check(linkErrors.length === 0, `${links.length} links point to the right member and organisation, ${links.filter((l) => l.role === 'admin').length} admins`)
  },
}
