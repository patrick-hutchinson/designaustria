import Link from 'next/link'

import styles from './Products.module.scss'

// List of products (for now the publications), each linking to its page at /<locale>/products/<slug>.
export function Products({ products, locale = 'de' }) {
  if (products.length === 0) {
    return <p>{locale === 'de' ? 'Noch keine Produkte.' : 'No products yet.'}</p>
  }

  return (
    <ul className={styles.list}>
      {products.map((product) => (
        <li key={product.id}>
          <Link href={`/${locale}/products/${product.slug}`}>{product.title}</Link>
        </li>
      ))}
    </ul>
  )
}
