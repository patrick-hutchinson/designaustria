import { RichText } from '@payloadcms/richtext-lexical/react'
import Link from 'next/link'

import { Media } from '@/components/Media/Media'
import { AddToCart } from '@/components/Shop/AddToCart'
import { formatPrice } from '@/lib/vendure-format'

import styles from './Product.module.scss'

/**
 * One product, as shown on its page at /<locale>/products/<slug>: the page from Payload, the price and cart from the shop.
 * @param {{ product: object, authors: Array<{ id: number, fullName?: string | null, slug?: string | null }>, shop: { variant: object | null, unavailable: boolean }, locale: string }} props
 */
export function Product({ product, authors, shop, locale = 'de' }) {
  const documents = (product.documents ?? []).filter((doc) => typeof doc === 'object' && doc.url)
  const gallery = product.gallery ?? []

  return (
    <article className={styles.product}>
      <h1>{product.title}</h1>
      {product.subtitle && <p className={styles.subtitle}>{product.subtitle}</p>}

      {/* height={400} matches `.cover { height: 400px }` in Product.module.scss */}
      {product.cover && <Media media={product.cover} className={styles.cover} height={400} />}

      {(product.details ?? []).map((block) =>
        block.blockType === 'publicationDetails' ? (
          <PublicationDetails key={block.id} details={block} authors={authors} locale={locale} />
        ) : null,
      )}

      {product.shopSku && <Price shop={shop} locale={locale} />}

      {/* Turns the Lexical JSON into HTML elements (paragraphs, headings, links, lists…) */}
      {product.body && <RichText data={product.body} />}

      {/* height={200} matches `.media { height: 200px }` */}
      {gallery.length > 0 && <Media media={gallery} className={styles.media} height={200} />}

      {documents.length > 0 && (
        <section>
          <h2>Downloads</h2>
          <ul>
            {documents.map((doc) => (
              <li key={doc.id}>
                <a href={doc.url} target="_blank" rel="noopener noreferrer">
                  {doc.alt || doc.filename}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

// Authors (members with a profile link, then the others), year, publisher, ISBN, pages and format.
function PublicationDetails({ details, authors, locale }) {
  const de = locale === 'de'
  const linked = (details.authors ?? []).flatMap((id) => authors.find((a) => a.id === (typeof id === 'object' ? id.id : id)) ?? [])
  const rows = [
    [de ? 'Jahr' : 'Year', details.year],
    [de ? 'Verlag' : 'Publisher', details.publisher],
    ['ISBN', details.isbn],
    [de ? 'Seiten' : 'Pages', details.pages],
    ['Format', details.format],
  ].filter(([, value]) => value)

  return (
    <dl className={styles.details}>
      {(linked.length > 0 || details.authorsText) && (
        <>
          <dt>{de ? 'Autor·innen' : 'Authors'}</dt>
          <dd>
            {linked.map((author, i) => (
              <span key={author.id}>
                {i > 0 && ', '}
                <Link href={`/${locale}/member/${author.slug}`}>{author.fullName}</Link>
              </span>
            ))}
            {linked.length > 0 && details.authorsText && ', '}
            {details.authorsText}
          </dd>
        </>
      )}
      {rows.map(([label, value]) => (
        <span key={label} className={styles.row}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </span>
      ))}
    </dl>
  )
}

// Price, member price and "add to cart", from the shop. The member price is only shown: checkout applies it once the
// shop has its member-price plugin (06-products-plan §4.4).
function Price({ shop, locale }) {
  const de = locale === 'de'
  if (shop.unavailable) return <p>{de ? 'Der Shop ist gerade nicht erreichbar.' : 'The shop is currently unavailable.'}</p>
  if (!shop.variant) return <p>{de ? 'Derzeit nicht erhältlich.' : 'Currently not available.'}</p>

  const { variant } = shop
  const memberPrice = variant.customFields?.memberPrice
  return (
    <section className={styles.buy}>
      {memberPrice != null && memberPrice < variant.priceWithTax && (
        <p>
          {de ? 'Für Mitglieder' : 'For members'}:{' '}
          {memberPrice === 0 ? (de ? 'kostenlos' : 'free') : formatPrice(memberPrice, variant.currencyCode, locale)}
        </p>
      )}
      <AddToCart variants={[variant]} locale={locale} />
    </section>
  )
}
