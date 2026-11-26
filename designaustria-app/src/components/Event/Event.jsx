import { RichText } from '@payloadcms/richtext-lexical/react'
import { Media } from '@/components/Media/Media'

import styles from './Event.module.scss'

export function Event({ event, locale = 'de' }) {
  const date = new Date(event.startsAt).toLocaleString(locale === 'de' ? 'de-AT' : 'en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Vienna', // stored in UTC; always show Vienna time
  })

  return (
    <article className="event">
      {/* First gallery item (image or Mux video) as the cover. height={200} matches `.media { height: 200px }` in Event.module.scss */}
      <Media media={event.gallery?.[0]} className={styles.media} height={200} />
      <h2>{event.title}</h2>
      <p>
        <time dateTime={event.startsAt}>{date}</time>
        {event.venue?.name && <> · {event.venue.name}</>}
      </p>
      {/* Turns the Lexical JSON into HTML elements (paragraphs, headings, links, lists…) */}
      {event.description && <RichText data={event.description} />}
    </article>
  )
}
