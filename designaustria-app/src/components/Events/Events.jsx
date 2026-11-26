import Link from 'next/link'

import styles from './Events.module.scss'

// List of events, each linking to its page at /<locale>/events/<slug>.
export function Events({ events, locale = 'de' }) {
  if (events.length === 0) {
    return <p>{locale === 'de' ? 'Noch keine Veranstaltungen.' : 'No events yet.'}</p>
  }

  return (
    <ul className={styles.list}>
      {events.map((event) => (
        <li key={event.id}>
          <Link href={`/${locale}/events/${event.slug}`}>{event.title}</Link>
        </li>
      ))}
    </ul>
  )
}
