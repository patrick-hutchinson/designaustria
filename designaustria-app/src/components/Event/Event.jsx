import { RichText } from '@payloadcms/richtext-lexical/react'
import { Media } from '@/components/Media/Media'

import styles from './Event.module.scss'

export function Event({ event, locale = 'de' }) {
  const date = new Date(event.date).toLocaleString(locale === 'de' ? 'de-AT' : 'en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  return (
    <article className="event">
      {/* height={200} matches `.media { height: 200px }` in Event.module.scss */}
      <Media media={event.media} className={styles.media} height={200} />
      <h2>{event.title}</h2>
      <p>
        <time dateTime={event.date}>{date}</time>
        {event.location && <> · {event.location}</>}
      </p>
      {/* Turns the Lexical JSON into HTML elements (paragraphs, headings, links, lists…) */}
      {event.description && <RichText data={event.description} />}
    </article>
  )
}
