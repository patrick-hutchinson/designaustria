// Small helpers for Vendure data. No server-only imports here, so client
// components (e.g. <AddToCart>) can use them too.

/** Vendure prices are integers in cents: 1990 -> "€ 19,90" */
export function formatPrice(amount, currencyCode, locale = 'de') {
  return new Intl.NumberFormat(locale === 'de' ? 'de-AT' : 'en-GB', {
    style: 'currency',
    currency: currencyCode,
  }).format(amount / 100)
}

/** Vendure's asset server resizes images: preset = tiny | thumb | small | medium | large */
export function assetUrl(asset, preset = 'medium') {
  return asset?.preview ? `${asset.preview}?preset=${preset}` : null
}
