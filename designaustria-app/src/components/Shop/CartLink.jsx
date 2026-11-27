import Link from 'next/link'

import { getCartCount } from '@/lib/vendure'

const label = (locale) => (locale === 'de' ? 'Warenkorb' : 'Cart')

// Cart link with the item count, in the header. A server component: the layout renders it and hands it to <Header>,
// inside <Suspense>, so a slow shop never holds up the page.
export async function CartLink({ locale = 'de' }) {
  const count = await getCartCount()
  return (
    <Link href={`/${locale}/cart`}>
      {label(locale)} ({count})
    </Link>
  )
}

// Shown until the count has loaded.
export function CartLinkFallback({ locale = 'de' }) {
  return <Link href={`/${locale}/cart`}>{label(locale)}</Link>
}
