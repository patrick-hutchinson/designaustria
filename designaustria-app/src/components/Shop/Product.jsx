import { assetUrl } from '@/lib/vendure-format'

import { AddToCart } from './AddToCart'
import styles from './Shop.module.scss'

/**
 * Product detail: image, name, description and the add-to-cart form.
 * @param {{ product: object, locale: string }} props
 */
export function Product({ product, locale = 'de' }) {
  return (
    <article className={styles.product}>
      {product.featuredAsset && (
        <img src={assetUrl(product.featuredAsset, 'large')} alt={product.name} />
      )}
      <div>
        <h1>{product.name}</h1>
        {/* The description is HTML from Vendure's rich-text editor (written by staff in the dashboard) */}
        {product.description && (
          <div dangerouslySetInnerHTML={{ __html: product.description }} />
        )}
        <AddToCart variants={product.variants} locale={locale} />
      </div>
    </article>
  )
}
