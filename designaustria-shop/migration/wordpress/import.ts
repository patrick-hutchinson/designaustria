// Import: designaustria-app/.data/wp-extract/shop-products.json → Vendure (in-process services, one transaction).
// Plan: designaustria-app/migration/wordpress/docs/06-products-plan.md §3.2, §5.3.
//
// One Product with one ProductVariant per WC product, keyed by the Product's `legacyWpId` and the variant SKU
// `WP-<id>`. Existing imported products are updated in place, so their ids (and carts on dev) survive a rerun.
// A full run also removes imported products that aren't in the extract any more, so the shop matches the extract;
// with --only=shop-products nothing is removed. Products made by staff (no legacyWpId) are never touched.
//
// Never run this on production after go-live: shop products are edited in Vendure from then on.
//
// Usage (from designaustria-shop/, after seed.ts):
//   DATABASE_URL=postgres://vendure:vendure@127.0.0.1:5434/vendure \
//     npx tsx migration/wordpress/import.ts [--dry-run] [--only=shop-products] [--allow-remote]

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { GlobalFlag, LanguageCode } from '@vendure/common/lib/generated-types'
import {
  ChannelService,
  Product,
  ProductService,
  ProductVariantService,
  TaxCategoryService,
  TransactionalConnection,
  type ID,
  type RequestContext,
} from '@vendure/core'
import { IsNull, Not } from 'typeorm'

import { EXTRACT_FILES, type ExtractedShopProduct } from '../../../designaustria-app/migration/wordpress/lib/extract-types'
import { Report } from '../../../designaustria-app/migration/wordpress/lib/report'
import { DATA_DIR, parseArgs, readExtract, startShop, type Shop } from './lib-env'

export const STEP = 'shop-products'

type Action = 'created' | 'updated' | 'removed' | 'would-create' | 'would-update' | 'would-remove'

async function main() {
  const args = parseArgs()
  const unknown = [...(args.only ?? [])].filter((name) => name !== STEP)
  if (unknown.length) throw new Error(`Unknown step(s) in --only: ${unknown.join(', ')}. Steps: ${STEP}`)

  const items = readExtract<ExtractedShopProduct>(EXTRACT_FILES.shopProducts)
  const shop = await startShop(args)
  const report = new Report()
  const counts: Partial<Record<Action | 'failed', number>> = {}
  const count = (action: Action | 'failed') => (counts[action] = (counts[action] ?? 0) + 1)
  console.log(args.dryRun ? 'DRY RUN: nothing is written\n' : '')
  if (args.only) console.log(`--only=${STEP}: upserting, nothing is removed\n`)

  let wrote = false
  try {
    const taxCategoryIds = await preconditions(shop, items, args.dryRun)
    const started = Date.now()

    await shop.get(TransactionalConnection).withTransaction(shop.ctx, async (ctx) => {
      const repo = shop.get(TransactionalConnection).getRepository(ctx, Product)
      // Imported products a staff member deleted in the dashboard keep their legacyWpId; free it so it can be reused.
      const deleted = await repo.find({ where: { customFields: { legacyWpId: Not(IsNull()) }, deletedAt: Not(IsNull()) } as never })
      for (const product of deleted) {
        report.warn('shop-product.deleted-in-shop', `shop-product ${(product.customFields as { legacyWpId: number }).legacyWpId}`, 'was deleted in Vendure; imported again')
        if (!args.dryRun) await repo.update(product.id, { customFields: { legacyWpId: null } } as never)
      }

      const existing = await repo.find({
        where: { customFields: { legacyWpId: Not(IsNull()) }, deletedAt: IsNull() } as never,
        relations: ['variants'],
      })
      const byLegacy = new Map(existing.map((product) => [(product.customFields as { legacyWpId: number }).legacyWpId, product]))

      for (const item of items) {
        const ref = `shop-product ${item.legacyWpId}`
        try {
          const found = byLegacy.get(item.legacyWpId)
          if (args.dryRun) count(found ? 'would-update' : 'would-create')
          else {
            await upsert(shop, ctx, item, found, taxCategoryIds.get(item.taxCategory)!, report)
            count(found ? 'updated' : 'created')
          }
        } catch (error) {
          // One transaction: any failure rolls everything back.
          count('failed')
          report.warn(`import.${STEP}.failed`, ref, error instanceof Error ? error.message : String(error))
          throw error
        }
      }

      if (!args.only) {
        const wanted = new Set(items.map((item) => item.legacyWpId))
        for (const [legacyWpId, product] of byLegacy) {
          if (wanted.has(legacyWpId)) continue
          if (args.dryRun) {
            count('would-remove')
            continue
          }
          await shop.get(ProductService).softDelete(ctx, product.id)
          await repo.update(product.id, { customFields: { legacyWpId: null } } as never)
          count('removed')
        }
      }
    })
    wrote = !args.dryRun
    console.log(`${STEP.padEnd(22)} ${JSON.stringify(counts)}  (${((Date.now() - started) / 1000).toFixed(1)}s)`)
  } finally {
    const out = path.join(DATA_DIR, 'wp-import')
    mkdirSync(out, { recursive: true })
    writeFileSync(path.join(out, '_shop-report.json'), `${JSON.stringify({ dryRun: args.dryRun, counts, warnings: report.toJSON() }, null, 2)}\n`)
    const warnings = report.counts()
    if (Object.keys(warnings).length) {
      console.log('\nWarnings by type (details in .data/wp-import/_shop-report.json):')
      console.table(warnings)
    }
    if (wrote) console.log('Updating the search index…')
    await shop.close({ waitForJobs: wrote })
  }
  process.exit(counts.failed ? 1 : 0)
}

/**
 * The channel, languages and tax categories the extract needs, from seed.ts. Stops with what's missing; a dry run only
 * warns, since the menu dry-runs the import before it runs the seed.
 */
async function preconditions(shop: Shop, items: ExtractedShopProduct[], dryRun: boolean): Promise<Map<string, ID>> {
  const problems: string[] = []
  const channel = await shop.get(ChannelService).getDefaultChannel(shop.ctx)
  if (!channel.pricesIncludeTax) problems.push('the default channel has prices without VAT (pricesIncludeTax = false)')
  if (channel.defaultCurrencyCode !== 'EUR') problems.push(`the default channel's currency is ${channel.defaultCurrencyCode}, not EUR`)
  if (!channel.availableLanguageCodes?.includes(LanguageCode.de)) problems.push('German (de) is not a language of the default channel')
  if (items.some((item) => item.name.en) && !channel.availableLanguageCodes?.includes(LanguageCode.en)) {
    problems.push('English (en) is not a language of the default channel')
  }
  const categories = (await shop.get(TaxCategoryService).findAll(shop.ctx)).items
  const ids = new Map(categories.map((c) => [c.name, c.id]))
  const missing = [...new Set(items.map((item) => item.taxCategory))].filter((name) => !ids.has(name))
  if (missing.length) problems.push(`tax categories missing: ${missing.join(', ')}`)
  const message = `The shop isn't set up for the import; run migration/wordpress/seed.ts first:\n- ${problems.join('\n- ')}`
  if (problems.length && !dryRun) throw new Error(message)
  if (problems.length) console.warn(`⚠ ${message}`)
  return ids
}

async function upsert(shop: Shop, ctx: RequestContext, item: ExtractedShopProduct, found: Product | undefined, taxCategoryId: ID, report: Report) {
  const products = shop.get(ProductService)
  const variants = shop.get(ProductVariantService)
  const languages = [LanguageCode.de, ...(item.name.en ? [LanguageCode.en] : [])]
  const productTranslations = languages.map((languageCode) => ({
    languageCode,
    name: (languageCode === LanguageCode.en ? item.name.en : item.name.de)!,
    slug: item.slug,
    description: '', // the text lives in Payload (§3.2)
  }))
  const variantFields = {
    sku: item.sku,
    price: item.price,
    taxCategoryId,
    trackInventory: item.trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE,
    stockOnHand: item.stockOnHand,
    enabled: true,
    translations: productTranslations.map(({ languageCode, name }) => ({ languageCode, name })),
    customFields: { memberPrice: item.memberPrice, legacyDownloadFiles: item.download ? JSON.stringify(item.download) : null },
  }

  if (!found) {
    const product = await products.create(ctx, { enabled: item.enabled, translations: productTranslations, customFields: { legacyWpId: item.legacyWpId } })
    await variants.create(ctx, [{ productId: product.id, ...variantFields }])
    return
  }

  await products.update(ctx, { id: found.id, enabled: item.enabled, translations: productTranslations, customFields: { legacyWpId: item.legacyWpId } })
  const live = found.variants.filter((variant) => !variant.deletedAt)
  const [variant, ...extra] = [...live.filter((v) => v.sku === item.sku), ...live.filter((v) => v.sku !== item.sku)]
  if (variant) await variants.update(ctx, [{ id: variant.id, ...variantFields }])
  else await variants.create(ctx, [{ productId: found.id, ...variantFields }])
  if (extra.length) {
    report.warn('shop-product.extra-variants', `shop-product ${item.legacyWpId}`, `${extra.length} variant(s) added in Vendure removed (${extra.map((v) => v.sku).join(', ')})`)
    await variants.softDelete(ctx, extra.map((v) => v.id))
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
