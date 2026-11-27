import { sql } from '@payloadcms/db-postgres'

import { EXTRACT_FILES, type ExtractedProduct } from '../../../lib/extract-types'
import { createHtmlToLexical } from '../../../lib/html-to-lexical'
import { MIGRATION_CONTEXT, upsertByLegacyKey } from '../../../lib/upsert'
import { idMap, readExtract, runItems, type ImportStep } from '../step'

// Products (for now the publications). The German texts are written with the document, the English ones in a second
// update in the `en` locale (06-products-plan §4.5). Shop products are imported in designaustria-shop; the two are
// linked by `shopSku` only (§3.3).
export const products: ImportStep = {
  name: 'products',
  // Products made by staff on the new site (no legacyWpId) are kept.
  wipe: { table: 'products', keep: sql`legacy_wp_id IS NULL` },
  async run({ payload, report, dryRun, resolve }) {
    const categoryIds = await idMap(payload, 'categories')
    const memberIds = await idMap(payload, 'members')
    const toLexical = await createHtmlToLexical(payload.config)
    const items = readExtract<ExtractedProduct>(EXTRACT_FILES.products)

    return runItems('products', items, report, async (product) => {
      const ref = `product ${product.legacyWpId}`
      const upserted = await upsertByLegacyKey({
        payload,
        collection: 'products',
        key: product.legacyWpId,
        locale: 'de',
        dryRun,
        data: {
          title: product.title.de,
          subtitle: product.subtitle.de,
          slug: product.slug.de,
          publishedAt: product.publishedAt,
          visibility: product.visibility,
          categories: resolve(categoryIds, product.categories, ref, 'category'),
          membersOnly: product.membersOnly,
          shopSku: product.shopSku,
          body: toLexical(product.body.de),
          details: product.details.map((block) => ({ ...block, authors: resolve(memberIds, block.authors, ref, 'member') })),
          legacy: product.legacy,
        },
      })
      if (dryRun || !upserted.id || !product.title.en) return upserted

      await payload.update({
        collection: 'products',
        id: upserted.id,
        locale: 'en',
        depth: 0,
        context: MIGRATION_CONTEXT,
        data: { title: product.title.en, subtitle: product.subtitle.en, slug: product.slug.en, body: toLexical(product.body.en) },
      })
      return upserted
    }, (product) => `product ${product.legacyWpId}`)
  },
}
