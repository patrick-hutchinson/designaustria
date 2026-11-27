import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPayload } from 'payload'
import React, { cache } from 'react'

import config from '@/payload.config'
import { Product } from '@/components/Product/Product'
import { defaultLocale, getAlternates, isLocale, locales, type Locale } from '@/i18n'
import { findVariantBySku } from '@/lib/vendure'

// Render on every request: prices and stock come from the shop and change all the time.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ locale: string; slug: string }> }

// Same lookup as the news and event pages: `slug` is localized, and the language switcher keeps the slug when it swaps
// /de/ <-> /en/. So a slug not found in the current language is looked up in the other languages too; the page then
// redirects to the current language's slug. A product without an English slug is shown in English under its German slug.
// `cache` makes generateMetadata and the page share the database queries.
const getProduct = cache(async (slug: string, locale: Locale) => {
  const payload = await getPayload({ config })
  for (const lookupLocale of new Set([locale, defaultLocale, ...locales])) {
    const { docs } = await payload.find({
      collection: 'products',
      where: { slug: { equals: slug }, visibility: { not_equals: 'hidden' } }, // hidden products stay in the admin only
      select: {},
      depth: 0,
      limit: 1,
      locale: lookupLocale,
    })
    if (docs[0]) {
      return payload.findByID({ collection: 'products', id: docs[0].id, depth: 1, locale })
    }
  }
  return null
})

// The product's path in every language, for hreflang. Empty English slugs fall back to German.
async function getPaths(id: number | string) {
  const payload = await getPayload({ config })
  const { slug } = (await payload.findByID({
    collection: 'products',
    id,
    select: { slug: true },
    depth: 0,
    locale: 'all',
  })) as unknown as { slug?: Partial<Record<Locale, string | null>> }
  return Object.fromEntries(locales.map((l) => [l, `/products/${slug?.[l] || slug?.[defaultLocale]}`])) as Record<Locale, string>
}

// Authors with a member profile. Members aren't readable by visitors and the Local API skips access checks, so only
// published profiles and only the fields the page shows (as on the members list).
async function getAuthors(ids: number[], locale: Locale) {
  if (ids.length === 0) return []
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'members',
    where: { id: { in: ids }, profileStatus: { equals: 'publish' }, slug: { exists: true } },
    select: { fullName: true, slug: true },
    pagination: false,
    depth: 0,
    locale,
  })
  return docs
}

// Price, member price and stock from the shop, by SKU (06-products-plan §3.3).
async function getShopVariant(sku: string | null | undefined, locale: Locale) {
  if (!sku) return { variant: null, unavailable: false }
  try {
    return { variant: await findVariantBySku(sku, locale), unavailable: false }
  } catch (error) {
    console.error('Vendure Shop API error:', error)
    return { variant: null, unavailable: true }
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const product = await getProduct(slug, locale)
  if (!product) return {}
  return {
    title: product.title,
    description: product.subtitle ?? undefined,
    alternates: getAlternates(locale, await getPaths(product.id)),
  }
}

// Visit /de/products/<slug> or /en/products/<slug> to see this page.
export default async function ProductPage(props: Props) {
  const { locale, slug } = await props.params
  if (!isLocale(locale)) notFound()

  const product = await getProduct(slug, locale)
  if (!product) notFound()
  // Found under another language's slug: go to this language's slug.
  if (product.slug && product.slug !== slug) permanentRedirect(`/${locale}/products/${product.slug}`)

  const authorIds = (product.details ?? []).flatMap((block) =>
    block.blockType === 'publicationDetails' ? (block.authors ?? []).map((a) => (typeof a === 'object' ? a.id : a)) : [],
  )
  const [authors, shop] = await Promise.all([getAuthors(authorIds, locale), getShopVariant(product.shopSku, locale)])

  return (
    <div className="product">
      <Product product={product} authors={authors} shop={shop} locale={locale} />
    </div>
  )
}
