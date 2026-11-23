import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { Product } from '@/components/Shop/Product'
import { getAlternates, isLocale } from '@/i18n'
import { shopQuery } from '@/lib/vendure'

type Props = { params: Promise<{ locale: string; slug: string }> }

const PRODUCT_QUERY = `
  query Product($slug: String!) {
    product(slug: $slug) {
      id
      name
      slug
      description
      featuredAsset { preview }
      variants { id name priceWithTax currencyCode stockLevel }
    }
  }
`

async function getProduct(slug: string, locale: string) {
  const { product } = await shopQuery(PRODUCT_QUERY, { slug }, { locale })
  return product
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const product = await getProduct(slug, locale).catch(() => null)
  return { title: product?.name ?? 'Shop', alternates: getAlternates(locale, `/shop/${slug}`) }
}

// /de/shop/<product-slug> – the slug is set per product in the Vendure dashboard.
export default async function ProductPage(props: Props) {
  const { locale, slug } = await props.params
  if (!isLocale(locale)) notFound()

  const product = await getProduct(slug, locale)
  if (!product) notFound()

  return <Product product={product} locale={locale} />
}
