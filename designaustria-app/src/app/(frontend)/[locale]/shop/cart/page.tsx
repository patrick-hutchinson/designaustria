import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { Cart } from '@/components/Shop/Cart'
import { isLocale } from '@/i18n'
import { ACTIVE_ORDER_FIELDS, shopQuery } from '@/lib/vendure'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  return {
    title: locale === 'de' ? 'Warenkorb' : 'Cart',
    robots: { index: false }, // personal page, keep it out of search engines
  }
}

// /de/shop/cart
export default async function CartPage(props: Props) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()

  const { activeOrder } = await shopQuery(`{ activeOrder { ${ACTIVE_ORDER_FIELDS} } }`, {}, { locale })

  return (
    <>
      <h1>{locale === 'de' ? 'Warenkorb' : 'Cart'}</h1>
      <Cart order={activeOrder} locale={locale} />
    </>
  )
}
