'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { addToCart } from '@/app/(frontend)/[locale]/cart/actions'
import { formatPrice } from '@/lib/vendure-format'

import styles from './Shop.module.scss'

/**
 * Variant picker + quantity + "add to cart" button.
 * Client component because it shows the selected price and the result of the action.
 */
export function AddToCart({ variants, locale = 'de' }) {
  const [variantId, setVariantId] = useState(variants[0]?.id)
  // state = what the server action returned last time ({ ok, message }), pending = while it runs
  const [state, formAction, pending] = useActionState(addToCart, null)

  const variant = variants.find((v) => v.id === variantId)
  if (!variant) return null
  const soldOut = variant.stockLevel === 'OUT_OF_STOCK'

  return (
    <form action={formAction} className={styles.addToCart}>
      {variants.length > 1 ? (
        <select
          name="variantId"
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          aria-label={locale === 'de' ? 'Variante' : 'Variant'}
        >
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="variantId" value={variantId} />
      )}

      <p className={styles.price}>{formatPrice(variant.priceWithTax, variant.currencyCode, locale)}</p>

      <input
        type="number"
        name="quantity"
        defaultValue={1}
        min={1}
        aria-label={locale === 'de' ? 'Menge' : 'Quantity'}
      />
      <button type="submit" disabled={pending || soldOut}>
        {soldOut
          ? locale === 'de' ? 'Ausverkauft' : 'Sold out'
          : locale === 'de' ? 'In den Warenkorb' : 'Add to cart'}
      </button>

      {state?.ok && (
        <p>
          {locale === 'de' ? 'Hinzugefügt. ' : 'Added. '}
          <Link href={`/${locale}/cart`}>{locale === 'de' ? 'Zum Warenkorb' : 'View cart'}</Link>
        </p>
      )}
      {state && !state.ok && <p role="alert">{state.message}</p>}
    </form>
  )
}
