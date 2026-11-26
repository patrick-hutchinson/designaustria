import { RichText } from '@payloadcms/richtext-lexical/react'
import { Media } from '@/components/Media/Media'

import styles from './Event.module.scss'

// One event, as shown on its page at /<locale>/events/<slug>.
export function Event({ event, locale = 'de' }) {
  const de = locale === 'de'
  const venue = event.venue ?? {}
  const prices = event.admission?.show ? (event.admission.prices ?? []).filter((p) => p.amount) : []
  const admissionNote = event.admission?.show && event.admission.note
  const openingHours = event.openingHours?.show && event.openingHours.text
  const links = (event.links ?? []).filter((link) => link.url)
  const documents = (event.documents ?? []).filter((doc) => typeof doc === 'object' && doc.url)
  const priceLabels = de
    ? { regular: 'Regulär', reduced: 'Ermäßigt', members: 'designaustria Mitglieder' }
    : { regular: 'Regular', reduced: 'Reduced', members: 'designaustria members' }

  return (
    <article className={styles.event}>
      <h1>{event.title}</h1>
      <p>
        <DateRange startsAt={event.startsAt} endsAt={event.endsAt} locale={locale} />
      </p>

      {/* height={200} matches `.media { height: 200px }` in Event.module.scss */}
      <Media media={event.gallery} className={styles.media} height={200} />

      {/* Turns the Lexical JSON into HTML elements (paragraphs, headings, links, lists…) */}
      {event.description && <RichText data={event.description} />}

      {(venue.name || venue.street || venue.city) && (
        <section>
          <h2>{de ? 'Ort' : 'Venue'}</h2>
          <address>
            {venue.name && <span className={styles.text}>{venue.name}</span>}
            {venue.street && (
              <>
                <br />
                {venue.street}
              </>
            )}
            {(venue.zip || venue.city) && (
              <>
                <br />
                {[venue.zip, venue.city].filter(Boolean).join(' ')}
                {venue.country && <>, {venue.country}</>}
              </>
            )}
          </address>
        </section>
      )}

      {openingHours && <TextSection title={de ? 'Öffnungszeiten' : 'Opening hours'} text={openingHours} />}

      {(prices.length > 0 || admissionNote) && (
        <section>
          <h2>{de ? 'Eintritt' : 'Admission'}</h2>
          {prices.length > 0 && (
            <ul>
              {prices.map((price) => (
                <li key={price.id}>
                  {price.label || priceLabels[price.kind]}: {price.amount}
                </li>
              ))}
            </ul>
          )}
          {admissionNote && <p className={styles.text}>{admissionNote}</p>}
        </section>
      )}

      {event.notes && <TextSection title={de ? 'Hinweise' : 'Notes'} text={event.notes} />}

      {(links.length > 0 || documents.length > 0) && (
        <section>
          <h2>{de ? 'Mehr dazu' : 'More'}</h2>
          <ul>
            {links.map((link) => (
              <li key={link.id}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label || link.url}
                </a>
              </li>
            ))}
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

// Stored in UTC; always shown in Vienna time.
function DateRange({ startsAt, endsAt, locale }) {
  const format = (value) =>
    new Date(value).toLocaleString(locale === 'de' ? 'de-AT' : 'en-GB', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Europe/Vienna',
    })

  return (
    <>
      <time dateTime={startsAt}>{format(startsAt)}</time>
      {endsAt && (
        <>
          {' – '}
          <time dateTime={endsAt}>{format(endsAt)}</time>
        </>
      )}
    </>
  )
}

function TextSection({ title, text }) {
  return (
    <section>
      <h2>{title}</h2>
      <p className={styles.text}>{text}</p>
    </section>
  )
}
