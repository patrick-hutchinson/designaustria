import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import { Products } from '@/components/Products/Products'
import { getAlternates, isLocale } from '@/i18n'

// Render on every request, so new products from the admin show up immediately
// (and the build doesn't need to query the database).
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locale: string }> }

// <title>, canonical and hreflang tags for this page.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: 'Shop', alternates: getAlternates(locale, '/products') }
}

// Visit /de/products or /en/products to see this page.
export default async function ShopPage(props: Props) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()

  const payload = await getPayload({ config })

  // The products are the pages in Payload (06-products-plan §3.1); price, stock and cart come from the shop
  // (Vendure) on the product page. Local API: queries the database directly (no HTTP request).
  // Only the fields the list needs. Categories, filters and pagination are still to do.
  const { docs: products } = await payload.find({
    collection: 'products',
    // Hidden products stay in the admin only. No filter on slug: in English, an empty slug falls back to the German one.
    where: { visibility: { not_equals: 'hidden' } },
    select: { title: true, slug: true },
    sort: '-publishedAt', // newest first
    pagination: false, // all of them, not just the first 10
    depth: 0,
    locale, // 'de' or 'en', taken from the URL
  })

  return (
    <div className="products">
      <h1>Shop</h1>
      <Products products={products} locale={locale} />
    </div>
  )
}
