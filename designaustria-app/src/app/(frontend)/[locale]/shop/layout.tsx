import React from 'react'

import { ShopNav } from '@/components/Shop/ShopNav'
import { shopQuery } from '@/lib/vendure'

// Prices, stock and the cart change all the time -> render on every request.
export const dynamic = 'force-dynamic'

// Wraps every page under /[locale]/shop with the shop navigation (cart link with count).
export default async function ShopLayout(props: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await props.params

  let cartCount = 0
  try {
    const { activeOrder } = await shopQuery(`{ activeOrder { totalQuantity } }`)
    cartCount = activeOrder?.totalQuantity ?? 0
  } catch {
    // Shop backend not reachable: the pages show their own message.
  }

  return (
    <div className="shop">
      <ShopNav locale={locale} cartCount={cartCount} />
      {props.children}
    </div>
  )
}
