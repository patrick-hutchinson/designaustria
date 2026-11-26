import { EXTRACT_FILES, type ExtractedOrganization } from '../../../lib/extract-types'
import { compareKeys, readExtract, type VerifyStep } from '../check'

export const organizations: VerifyStep = {
  name: 'organizations',
  async run({ docs }) {
    const items = readExtract<ExtractedOrganization>(EXTRACT_FILES.organizations)
    compareKeys('organizations', items.map((o) => o.legacyWpId), await docs('organizations'))
  },
}
