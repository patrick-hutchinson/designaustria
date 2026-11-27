import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'

import { Cart } from '@/components/Shop/Cart'
import { isLocale } from '@/i18n'
import { ACTIVE_ORDER_FIELDS, shopQuery } from '@/lib/vendure'

// The cart lives in the shop (Vendure) and changes all the time: render on every request.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  return {
    title: locale === 'de' ? 'Warenkorb' : 'Cart',
    robots: { index: false }, // personal page, keep it out of search engines
  }
}

// /de/cart or /en/cart
export default async function CartPage(props: Props) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()

  const { activeOrder } = await shopQuery(`{ activeOrder { ${ACTIVE_ORDER_FIELDS} } }`, {}, { locale })

  // Each line links to its product page in Payload, found by SKU like the product page finds its price
  // (06-products-plan §3.3). Lines without a (visible) product aren't linked.
  const skus = [...new Set<string>((activeOrder?.lines ?? []).map((line: { productVariant: { sku: string } }) => line.productVariant.sku))]
  const payload = await getPayload({ config })
  const { docs } = skus.length
    ? await payload.find({
        collection: 'products',
        where: { shopSku: { in: skus }, visibility: { not_equals: 'hidden' } },
        select: { slug: true, shopSku: true },
        sort: 'id', // two products can share a SKU: always link the same one
        pagination: false,
        depth: 0,
        locale,
      })
    : { docs: [] }
  const productSlugs: Record<string, string> = {}
  for (const doc of docs) if (doc.shopSku && doc.slug && !productSlugs[doc.shopSku]) productSlugs[doc.shopSku] = doc.slug

  return (
    <>
      <h1>{locale === 'de' ? 'Warenkorb' : 'Cart'}</h1>
      <Cart order={activeOrder} productSlugs={productSlugs} locale={locale} />
    </>
  )
}
