// Verify: compares the shop with the extract (designaustria-app/.data/wp-extract) and fails on any mismatch. Only reads.
// Plan: designaustria-app/migration/wordpress/docs/06-products-plan.md §5.3.
//
// Also the cross-check between the two sides: every `shopSku` in products.json (the Payload products) has a variant
// here. It reads the extract, so it doesn't need the app's database.
//
// Usage (from designaustria-shop/):
//   DATABASE_URL=postgres://vendure:vendure@127.0.0.1:5434/vendure npx tsx migration/wordpress/verify.ts [--allow-remote]

import { GlobalFlag, LanguageCode } from '@vendure/common/lib/generated-types'
import { ChannelService, Product, ProductVariant, TransactionalConnection } from '@vendure/core'
import { IsNull, Not } from 'typeorm'

import { EXTRACT_FILES, type ExtractedProduct, type ExtractedShopProduct } from '../../../designaustria-app/migration/wordpress/lib/extract-types'
import { check, errors, parseArgs, readExtract, startShop } from './lib-env'

type WithCustomFields<T> = T & { customFields: Record<string, unknown> }

async function main() {
  const args = parseArgs()
  const items = readExtract<ExtractedShopProduct>(EXTRACT_FILES.shopProducts)
  const products = readExtract<ExtractedProduct>(EXTRACT_FILES.products)
  const shop = await startShop(args)

  try {
    console.log('\nshop-products')
    const connection = shop.get(TransactionalConnection)
    const channel = await shop.get(ChannelService).getDefaultChannel(shop.ctx)
    const imported = (await connection.rawConnection.getRepository(Product).find({
      where: { customFields: { legacyWpId: Not(IsNull()) }, deletedAt: IsNull() } as never,
      relations: ['translations', 'variants', 'variants.translations', 'variants.productVariantPrices', 'variants.taxCategory', 'variants.stockLevels'],
    })) as WithCustomFields<Product>[]
    const byLegacy = new Map(imported.map((product) => [product.customFields.legacyWpId as number, product]))

    const missing = items.filter((item) => !byLegacy.has(item.legacyWpId))
    const expected = new Set(items.map((item) => item.legacyWpId))
    const extra = [...byLegacy.keys()].filter((id) => !expected.has(id))
    check(missing.length === 0, `shop-products: all ${items.length} extracted records exist in the shop${missing.length ? ` (missing: ${missing.slice(0, 10).map((m) => m.legacyWpId).join(', ')})` : ''}`)
    check(extra.length === 0, `shop-products: no imported products that aren't in this extract${extra.length ? ` (${extra.length}, e.g. ${extra.slice(0, 10).join(', ')}; run a full import)` : ''}`)

    // Field by field, per SKU
    const mismatches: string[] = []
    for (const item of items) {
      const product = byLegacy.get(item.legacyWpId)
      if (!product) continue
      const live = product.variants.filter((v) => !v.deletedAt) as WithCustomFields<ProductVariant>[]
      const variant = live.find((v) => v.sku === item.sku)
      const name = (language: LanguageCode) => product.translations.find((t) => t.languageCode === language)?.name ?? null
      const price = variant?.productVariantPrices.find((p) => p.channelId === channel.id && p.currencyCode === channel.defaultCurrencyCode)?.price
      const stock = variant?.stockLevels.reduce((sum, level) => sum + level.stockOnHand, 0)
      const actual = {
        variants: live.length,
        enabled: product.enabled,
        nameDe: name(LanguageCode.de),
        nameEn: item.name.en ? name(LanguageCode.en) : null,
        price,
        memberPrice: variant?.customFields.memberPrice ?? null,
        taxCategory: variant?.taxCategory?.name,
        trackInventory: variant?.trackInventory === GlobalFlag.TRUE,
        stockOnHand: stock,
        download: (variant?.customFields.legacyDownloadFiles as string | null) ?? null,
      }
      const want = {
        variants: 1,
        enabled: item.enabled,
        nameDe: item.name.de,
        nameEn: item.name.en,
        price: item.price,
        memberPrice: item.memberPrice,
        taxCategory: item.taxCategory,
        trackInventory: item.trackInventory,
        stockOnHand: item.trackInventory ? item.stockOnHand : stock, // untracked stock isn't compared
        download: item.download ? JSON.stringify(item.download) : null,
      }
      for (const key of Object.keys(want) as (keyof typeof want)[]) {
        if (actual[key] !== want[key]) mismatches.push(`${item.sku}.${key}: expected ${JSON.stringify(want[key])}, got ${JSON.stringify(actual[key])}`)
      }
    }
    mismatches.slice(0, 10).forEach((line) => console.log(`  ${line}`))
    check(
      mismatches.length === 0,
      `${items.length} shop products match field by field (name, price, member price, tax category, stock, downloads)` +
        (mismatches.length ? `: ${mismatches.length} differences` : ''),
    )
    check(items.every((item) => item.price >= (item.memberPrice ?? 0)), 'no member price above the normal price')

    // Cross-check with the Payload side (§3.3)
    const skus = new Set(imported.flatMap((product) => product.variants.filter((v) => !v.deletedAt).map((v) => v.sku)))
    const forSale = products.filter((product) => product.shopSku)
    const unmatched = forSale.filter((product) => !skus.has(product.shopSku!))
    check(
      unmatched.length === 0,
      `every shopSku of the ${forSale.length} products for sale has a variant${unmatched.length ? ` (${unmatched.length} don't, e.g. product ${unmatched[0].legacyWpId} ${unmatched[0].shopSku})` : ''}`,
    )
  } finally {
    await shop.close()
  }

  console.log(errors.length ? `\n${errors.length} check(s) failed` : '\nAll checks passed')
  process.exit(errors.length ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
