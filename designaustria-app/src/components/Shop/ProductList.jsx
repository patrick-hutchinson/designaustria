import Link from 'next/link'

import { assetUrl, formatPrice } from '@/lib/vendure-format'

import styles from './Shop.module.scss'

/**
 * Grid of product cards.
 * @param {{ products: Array<{ id, name, slug, featuredAsset, variants }>, locale: string }} props
 */
export function ProductList({ products, locale = 'de' }) {
  return (
    <ul className={styles.grid}>
      {products.map((product) => (
        <li key={product.id}>
          <Link href={`/${locale}/shop/${product.slug}`} className={styles.card}>
            {product.featuredAsset && (
              // Plain <img>: Vendure's asset server already resizes (?preset=medium)
              <img src={assetUrl(product.featuredAsset)} alt={product.name} loading="lazy" />
            )}
            <h2>{product.name}</h2>
            <p>{getPriceLabel(product.variants, locale)}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// One variant: "€ 20,00". Several prices: "ab € 20,00" / "from € 20.00".
function getPriceLabel(variants, locale) {
  if (!variants?.length) return null
  const prices = variants.map((v) => v.priceWithTax)
  const lowest = Math.min(...prices)
  const price = formatPrice(lowest, variants[0].currencyCode, locale)
  const hasRange = prices.some((p) => p !== lowest)
  return hasRange ? `${locale === 'de' ? 'ab' : 'from'} ${price}` : price
}
