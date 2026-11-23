import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { ProductList } from '@/components/Shop/ProductList'
import { getAlternates, isLocale } from '@/i18n'
import { shopQuery } from '@/lib/vendure'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: 'Shop', alternates: getAlternates(locale, '/shop') }
}

const PRODUCTS_QUERY = `
  query Products {
    products(options: { take: 100, sort: { name: ASC } }) {
      items {
        id
        name
        slug
        featuredAsset { preview }
        variants { priceWithTax currencyCode }
      }
    }
  }
`

// Visit /de/shop or /en/shop
export default async function ShopPage(props: Props) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()

  let products = null
  try {
    const data = await shopQuery(PRODUCTS_QUERY, {}, { locale })
    products = data.products.items
  } catch (error) {
    console.error('Vendure Shop API error:', error)
  }

  return (
    <>
      <h1>Shop</h1>
      {products === null && (
        <p>
          {locale === 'de'
            ? 'Der Shop ist gerade nicht erreichbar.'
            : 'The shop is currently unavailable.'}
        </p>
      )}
      {products?.length === 0 && (
        <p>{locale === 'de' ? 'Noch keine Produkte.' : 'No products yet.'}</p>
      )}
      {products && products.length > 0 && <ProductList products={products} locale={locale} />}
    </>
  )
}
