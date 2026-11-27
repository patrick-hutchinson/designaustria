import { RichText } from '@payloadcms/richtext-lexical/react'
import { Media } from '@/components/Media/Media'
import { formatDate } from '@/components/Posts/Posts'

import styles from './Post.module.scss'

// One news post, as shown on its page at /<locale>/news/<slug>.
export function Post({ post, locale = 'de' }) {
  const documents = (post.documents ?? []).filter((doc) => typeof doc === 'object' && doc.url)
  const gallery = post.gallery ?? []

  return (
    <article className={styles.post}>
      <h1>{post.title}</h1>
      <p>
        <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale)}</time>
      </p>

      {/* height={400} matches `.cover { height: 400px }` in Post.module.scss */}
      {post.cover && <Media media={post.cover} className={styles.cover} height={400} />}

      {/* Turns the Lexical JSON into HTML elements (paragraphs, headings, links, lists…) */}
      {post.body && <RichText data={post.body} />}

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
