// Shop products (Vendure Product + ProductVariant) from WooCommerce products. For now only the WC products linked from a
// migrated product (a publication's `da_product`); the rest is 07-shop-plan. Plan: docs/06-products-plan.md §3.2–3.3, §4.4–4.6.
//
// Sets `shopSku` on the products it covers, and returns the redirects of the old WC product URLs (/produkt/<slug>).

import type { ExtractedProduct, ExtractedRedirect, ExtractedShopProduct } from '../../lib/extract-types'
import { cleanText } from '../../lib/mappers'
import { loadPostsWithMeta, query, type WpConnection } from '../../lib/mysql'
import type { Report } from '../../lib/report'
import {
  mapStock,
  mapTaxClass,
  parseDownloadFiles,
  parseDownloadLimit,
  priceToCents,
  shopProductName,
  shopSku,
} from '../../lib/shop-product-mappers'
import { loadOldSlugs } from '../../lib/wp-posts'
import { newPath } from './products'

const wcProductPath = (slug: string) => `/produkt/${slug}`

/** Titles compared without soft hyphens, case and spacing: only real differences are logged (§3.2). */
const comparable = (title: string | null) => shopProductName(title)?.toLowerCase().replace(/\s+/g, ' ') ?? ''

export async function extractShopProducts(
  conn: WpConnection,
  products: ExtractedProduct[],
  report: Report,
): Promise<{ shopProducts: ExtractedShopProduct[]; redirects: ExtractedRedirect[] }> {
  const { posts: wcProducts } = await loadPostsWithMeta(conn, 'product')
  const byId = new Map(wcProducts.map((p) => [p.post.ID, p]))
  const shippingClasses = await loadTermNames(conn, 'product_shipping_class')
  const productTypes = await loadTermNames(conn, 'product_type')

  // Products per WC product, lowest id first (one WC product is shared by two publications, §3.3).
  const productsOf = new Map<number, ExtractedProduct[]>()
  for (const product of [...products].sort((a, b) => a.legacyWpId - b.legacyWpId)) {
    const id = product.legacy.wcProductWpId
    if (id) productsOf.set(id, [...(productsOf.get(id) ?? []), product])
  }

  const shopProducts: ExtractedShopProduct[] = []
  for (const [wcId, linked] of [...productsOf].sort(([a], [b]) => a - b)) {
    const { post, meta } = byId.get(wcId)!
    const ref = `shop-product ${wcId}`
    const main = linked[0]
    if (linked.length > 1) report.warn('shop-product.shared', ref, `linked from products ${linked.map((p) => p.legacyWpId).join(', ')}; named after ${main.legacyWpId}`)

    const type = productTypes.get(wcId)?.[0] ?? 'simple'
    if (type !== 'simple') {
      report.warn('shop-product.not-migrated', ref, `type ${type}, only simple products are migrated here; products ${linked.map((p) => p.legacyWpId).join(', ')} not for sale`)
      continue
    }

    const price = report.mapped(ref, priceToCents(meta._regular_price))
    const taxCategory = report.mapped(ref, mapTaxClass(meta._tax_class))
    const stock = report.mapped(ref, mapStock({ manageStock: meta._manage_stock, stock: meta._stock, stockStatus: meta._stock_status }))
    if (price === null || !taxCategory || !stock) {
      report.warn('shop-product.not-migrated', ref, `no usable price, tax class or stock; products ${linked.map((p) => p.legacyWpId).join(', ')} not for sale`)
      continue
    }
    const memberPrice = report.mapped(ref, priceToCents(meta._sale_price))
    if (memberPrice !== null && memberPrice > price) report.warn('shop-product.member-price-higher', ref, `member price ${memberPrice} > price ${price}`)
    if (cleanText(meta._sale_price_dates_from) || cleanText(meta._sale_price_dates_to)) {
      report.warn('shop-product.sale-period', ref, 'has a sale period; migrated as a permanent member price')
    }

    const name = shopProductName(main.title.de)!
    if (comparable(cleanText(post.post_title)) !== comparable(main.title.de)) {
      report.warn('shop-product.title-differs', ref, `WC title "${cleanText(post.post_title)}", product ${main.legacyWpId} "${name}"; product title used`)
    }
    if (post.post_status !== 'publish') report.warn('shop-product.disabled', ref, `status ${post.post_status}; migrated disabled`)
    if (meta._sold_individually === 'yes') report.warn('shop-product.sold-individually', ref, 'sold individually in WooCommerce; not enforced in Vendure')
    for (const shippingClass of shippingClasses.get(wcId) ?? []) {
      report.warn('shop-product.shipping-class', ref, `shipping class "${shippingClass}"; not migrated (07-shop-plan §3)`)
    }

    const downloadable = meta._downloadable === 'yes'
    const { files, repaired } = parseDownloadFiles(meta._downloadable_files)
    if (repaired) report.warn('shop-product.download-files-repaired', ref, '_downloadable_files has wrong string lengths; read by pattern, check the file paths')
    if (downloadable && !files.length) report.warn('shop-product.no-download-file', ref, 'downloadable but no file; nothing to deliver')

    const sku = shopSku(wcId)
    for (const product of linked) product.shopSku = sku
    shopProducts.push({
      legacyWpId: wcId,
      sku,
      name: { de: name, en: main.legacy.enWpId ? shopProductName(main.title.en) : null },
      slug: main.slug.de!,
      enabled: post.post_status === 'publish',
      price,
      memberPrice,
      taxCategory,
      trackInventory: stock.trackInventory,
      stockOnHand: stock.stockOnHand,
      download: downloadable ? { files, limit: parseDownloadLimit(meta._download_limit) } : null,
      productWpIds: linked.map((p) => p.legacyWpId),
    })
  }

  // Old WC product URLs go to the product page (§4.5), with the WC product's old slugs.
  const redirects: ExtractedRedirect[] = []
  const oldSlugs = await loadOldSlugs(conn, 'product')
  for (const shopProduct of shopProducts) {
    const target = productsOf.get(shopProduct.legacyWpId)!.find((p) => p.visibility !== 'hidden')
    if (!target) continue
    const { post } = byId.get(shopProduct.legacyWpId)!
    const slugs = [post.post_name, ...oldSlugs.filter((row) => row.post_id === post.ID).map((row) => row.slug)].filter(Boolean)
    for (const slug of [...new Set(slugs)]) {
      redirects.push({
        entity: 'product',
        legacyWpId: target.legacyWpId,
        locale: 'de',
        from: wcProductPath(slug),
        to: newPath('de', target.slug.de!),
        reason: 'wc-product',
      })
    }
  }

  return { shopProducts, redirects: redirects.sort((a, b) => a.from.localeCompare(b.from)) }
}

/** Term names of one taxonomy per post (e.g. WooCommerce product type, shipping class). */
async function loadTermNames(conn: WpConnection, taxonomy: string): Promise<Map<number, string[]>> {
  const rows = await query<{ post_id: number; name: string }>(
    conn,
    `SELECT r.object_id AS post_id, t.name FROM wp_term_relationships r
     JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = r.term_taxonomy_id AND tt.taxonomy = ?
     JOIN wp_terms t ON t.term_id = tt.term_id ORDER BY r.object_id, t.term_id`,
    [taxonomy],
  )
  const result = new Map<number, string[]>()
  for (const row of rows) result.set(row.post_id, [...(result.get(row.post_id) ?? []), row.name])
  return result
}
