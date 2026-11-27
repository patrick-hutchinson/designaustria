import Link from 'next/link'

import styles from './Posts.module.scss'

// List of news posts, each with its date and a link to its page at /<locale>/news/<slug>.
export function Posts({ posts, locale = 'de' }) {
  if (posts.length === 0) {
    return <p>{locale === 'de' ? 'Noch keine Neuigkeiten.' : 'No news yet.'}</p>
  }

  return (
    <ul className={styles.list}>
      {posts.map((post) => (
        <li key={post.id}>
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale)}</time>{' '}
          <Link href={`/${locale}/news/${post.slug}`}>{post.title}</Link>
        </li>
      ))}
    </ul>
  )
}

// Stored in UTC; always shown as the date in Vienna.
export function formatDate(value, locale) {
  return new Date(value).toLocaleDateString(locale === 'de' ? 'de-AT' : 'en-GB', { dateStyle: 'long', timeZone: 'Europe/Vienna' })
}
