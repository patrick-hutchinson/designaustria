import Link from 'next/link'

import { removeCartLine, updateCartLine } from '@/app/(frontend)/[locale]/cart/actions'
import { assetUrl, formatPrice } from '@/lib/vendure-format'

import styles from './Shop.module.scss'

/**
 * Cart lines with quantity/remove forms and the totals.
 * The forms call server actions directly, so this works without client JavaScript.
 * @param {{ order: object | null, productSlugs: Record<string, string>, locale: string }} props
 *   order = Vendure's activeOrder; productSlugs = SKU → slug of the product page in Payload
 */
export function Cart({ order, productSlugs = {}, locale = 'de' }) {
  const de = locale === 'de'

  if (!order || order.lines.length === 0) {
    return (
      <p>
        {de ? 'Dein Warenkorb ist leer. ' : 'Your cart is empty. '}
        <Link href={`/${locale}/products`}>{de ? 'Zum Shop' : 'Go to the shop'}</Link>
      </p>
    )
  }

  const price = (amount) => formatPrice(amount, order.currencyCode, locale)

  return (
    <div className={styles.cart}>
      <ul>
        {order.lines.map((line) => (
          <li key={line.id} className={styles.line}>
            {line.featuredAsset && (
              <img src={assetUrl(line.featuredAsset, 'thumb')} alt="" width={80} height={80} />
            )}
            <div>
              {productSlugs[line.productVariant.sku] ? (
                <Link href={`/${locale}/products/${productSlugs[line.productVariant.sku]}`}>{line.productVariant.name}</Link>
              ) : (
                line.productVariant.name
              )}
              <p>{price(line.unitPriceWithTax)}</p>
            </div>

            <form action={updateCartLine} className={styles.quantity}>
              <input type="hidden" name="lineId" value={line.id} />
              <input
                type="number"
                name="quantity"
                defaultValue={line.quantity}
                min={0}
                aria-label={de ? 'Menge' : 'Quantity'}
              />
              <button type="submit">{de ? 'Aktualisieren' : 'Update'}</button>
            </form>

            <form action={removeCartLine}>
              <input type="hidden" name="lineId" value={line.id} />
              <button type="submit">{de ? 'Entfernen' : 'Remove'}</button>
            </form>

            <p className={styles.linePrice}>{price(line.linePriceWithTax)}</p>
          </li>
        ))}
      </ul>

      <dl className={styles.totals}>
        <dt>{de ? 'Zwischensumme' : 'Subtotal'}</dt>
        <dd>{price(order.subTotalWithTax)}</dd>
        <dt>{de ? 'Gesamt (inkl. MwSt.)' : 'Total (incl. VAT)'}</dt>
        <dd>{price(order.totalWithTax)}</dd>
      </dl>

      {/* Next step: checkout (customer details, shipping address, shipping method, payment) */}
      <p>{de ? 'Kasse folgt in Kürze.' : 'Checkout coming soon.'}</p>
    </div>
  )
}
