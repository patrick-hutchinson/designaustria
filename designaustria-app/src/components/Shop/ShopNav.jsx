import Link from 'next/link'

import styles from './Shop.module.scss'

// Shown above every shop page: link to all products and to the cart (with item count).
export function ShopNav({ locale = 'de', cartCount = 0 }) {
  return (
    <nav className={styles.nav}>
      <Link href={`/${locale}/shop`}>{locale === 'de' ? 'Alle Produkte' : 'All products'}</Link>
      <Link href={`/${locale}/shop/cart`}>
        {locale === 'de' ? 'Warenkorb' : 'Cart'} ({cartCount})
      </Link>
    </nav>
  )
}
