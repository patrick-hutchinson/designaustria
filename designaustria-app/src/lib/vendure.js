import { cookies } from 'next/headers'

// Talks to the Vendure Shop API (designaustria-shop). Server-side only:
// use it in server components, server actions and route handlers.
//
// The cart ("active order") lives in Vendure and belongs to a Vendure session.
// Vendure returns a session token in the `vendure-auth-token` response header;
// we keep it in an httpOnly cookie on our own domain and send it back as a
// Bearer token, so the browser never talks to Vendure directly.

const SHOP_API_URL = process.env.VENDURE_SHOP_API_URL || 'http://localhost:3001/shop-api'
const TOKEN_COOKIE = 'vendure-token'

/**
 * Runs a GraphQL query or mutation against the Vendure Shop API.
 *
 * @param {string} query GraphQL document
 * @param {object} [variables]
 * @param {object} [options]
 * @param {string} [options.locale] 'de' | 'en' – translated names/descriptions (falls back to the channel default)
 * @param {boolean} [options.saveToken] store a new session token in the cookie.
 *   Only allowed in server actions / route handlers (cookies can't be set while a page renders).
 */
export async function shopQuery(query, variables = {}, { locale, saveToken = false } = {}) {
  const cookieStore = await cookies()
  const token = cookieStore.get(TOKEN_COOKIE)?.value

  const url = locale ? `${SHOP_API_URL}?languageCode=${locale}` : SHOP_API_URL
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store', // prices, stock and the cart must always be fresh
  })

  // Vendure sends a token when it starts a new session (e.g. the first "add to cart").
  const newToken = response.headers.get('vendure-auth-token')
  if (saveToken && newToken && newToken !== token) {
    cookieStore.set(TOKEN_COOKIE, newToken, {
      httpOnly: true, // not readable from browser JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
  }

  const json = await response.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data
}

/**
 * Number of items in the visitor's cart, for the cart link in the header. Without a shop session (cookie) there's no
 * cart, so it doesn't ask the shop at all. 0 when the shop isn't reachable.
 */
export async function getCartCount() {
  if (!(await cookies()).has(TOKEN_COOKIE)) return 0
  try {
    const { activeOrder } = await shopQuery(`{ activeOrder { totalQuantity } }`)
    return activeOrder?.totalQuantity ?? 0
  } catch {
    return 0
  }
}

// Fields of the cart that the cart page needs.
export const ACTIVE_ORDER_FIELDS = `
  id
  code
  totalQuantity
  subTotalWithTax
  shippingWithTax
  totalWithTax
  currencyCode
  lines {
    id
    quantity
    unitPriceWithTax
    linePriceWithTax
    featuredAsset { preview }
    productVariant { id name sku }
  }
`

/**
 * The shop variant behind a Payload product, by its SKU (`products.shopSku`, 06-products-plan §3.3): live price, member
 * price and stock, and the id that "add to cart" needs. null when the shop has no enabled variant with that SKU.
 * Throws when the shop isn't reachable.
 */
export async function findVariantBySku(sku, locale) {
  // The Shop API can't filter products by SKU, but its search index has the SKU; the search is fuzzy, so match exactly.
  const { search } = await shopQuery(
    `query FindSku($term: String!) { search(input: { term: $term, groupByProduct: false, take: 10 }) { items { sku productId } } }`,
    { term: sku },
    { locale },
  )
  const hit = search.items.find((item) => item.sku === sku)
  if (!hit) return null

  const { product } = await shopQuery(
    `query Variant($id: ID!) {
      product(id: $id) { variants { id name sku priceWithTax currencyCode stockLevel customFields { memberPrice } } }
    }`,
    { id: hit.productId },
    { locale },
  )
  return product?.variants.find((variant) => variant.sku === sku) ?? null
}
