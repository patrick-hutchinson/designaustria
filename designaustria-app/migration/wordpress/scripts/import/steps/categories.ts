import { EXTRACT_FILES, type ExtractedCategory } from '../../../lib/extract-types'
import { upsertByLegacyKey } from '../../../lib/upsert'
import { mapPool } from '../../lib-env'
import { CONCURRENCY, idMap, readExtract, runItems, type ImportStep } from '../step'

// Two passes, so parents exist before they're referenced.
export const categories: ImportStep = {
  name: 'categories',
  wipe: { table: 'categories' },
  async run({ payload, report, dryRun, resolve }) {
    const items = readExtract<ExtractedCategory>(EXTRACT_FILES.categories)
    const result = await runItems('categories', items, report, async (c) => {
      const upserted = await upsertByLegacyKey({
        payload,
        collection: 'categories',
        key: c.legacyWpId,
        data: { title: c.title.de, slug: c.slug },
        locale: 'de',
        dryRun,
      })
      if (c.title.en && upserted.id && !dryRun) {
        await payload.update({ collection: 'categories', id: upserted.id, data: { title: c.title.en }, locale: 'en', depth: 0 })
      }
      return upserted
    }, (c) => `category ${c.legacyWpId}`)
    if (!dryRun) {
      const map = await idMap(payload, 'categories')
      await mapPool(items.filter((c) => c.parent), CONCURRENCY, async (c) => {
        const [parent] = resolve(map, [c.parent!], `category ${c.legacyWpId}`, 'category')
        await payload.update({ collection: 'categories', id: map.get(c.legacyWpId)!, data: { parent: parent ?? null }, depth: 0 })
      })
    }
    return result
  },
}
