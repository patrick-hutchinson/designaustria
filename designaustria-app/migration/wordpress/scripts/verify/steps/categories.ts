import { EXTRACT_FILES, type ExtractedCategory } from '../../../lib/extract-types'
import { compareKeys, readExtract, type VerifyStep } from '../check'

export const categories: VerifyStep = {
  name: 'categories',
  async run({ docs }) {
    const items = readExtract<ExtractedCategory>(EXTRACT_FILES.categories)
    compareKeys('categories', items.map((c) => c.legacyWpId), await docs('categories'))
  },
}
