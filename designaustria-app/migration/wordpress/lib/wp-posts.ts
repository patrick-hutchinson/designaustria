// Shared by the translated post types (events, posts, later publications and pages): which posts become documents, and
// how inline image URLs map to attachment IDs.

import { query, type PostWithMeta, type WpConnection } from './mysql'
import type { Language, Translations } from './polylang'
import type { Report } from './report'

export interface PostDocument {
  /** The post the document is made from: German, or English when there's no migrated German post. */
  main: PostWithMeta
  /** Its migrated English partner, whose texts go into the `en` locale. */
  en: PostWithMeta | null
}

/**
 * The posts to migrate as documents (03-events-plan §4.2): German posts with their English partner, plus English posts
 * without a migrated German partner. Posts whose status isn't in `statuses` are counted in `notMigrated` by status.
 * `entity` prefixes the warning codes, e.g. `event.english-only`.
 */
export function pickDocuments(
  posts: PostWithMeta[],
  { statuses, languages, translations, entity }: { statuses: Set<string>; languages: Map<number, Language>; translations: Translations; entity: string },
  report: Report,
): { documents: PostDocument[]; notMigrated: Record<string, number> } {
  const byId = new Map(posts.map((post) => [post.post.ID, post]))
  const migrated = (id: number | undefined) => (id ? statuses.has(byId.get(id)?.post.post_status ?? '') : false)
  const notMigrated: Record<string, number> = {}
  const documents: PostDocument[] = []
  for (const record of posts) {
    const { post } = record
    if (!statuses.has(post.post_status)) {
      notMigrated[post.post_status] = (notMigrated[post.post_status] ?? 0) + 1
      continue
    }
    const language = languages.get(post.ID) ?? 'de'
    if (!languages.has(post.ID)) report.warn(`${entity}.no-language`, `${entity} ${post.ID}`, 'no Polylang language; treated as German')
    if (language === 'de') {
      const enId = translations.englishOf.get(post.ID)
      if (enId && !migrated(enId)) {
        report.warn(`${entity}.en-not-migrated`, `${entity} ${post.ID}`, `English post ${enId} is ${byId.get(enId)?.post.post_status ?? 'missing'}; not used`)
      }
      documents.push({ main: record, en: enId && migrated(enId) ? byId.get(enId)! : null })
    } else if (!migrated(translations.germanOf.get(post.ID))) {
      report.warn(`${entity}.english-only`, `${entity} ${post.ID}`, 'no German post; the English texts are copied to German')
      documents.push({ main: record, en: null })
    }
  }
  return { documents, notMigrated }
}

/** post_content of every post of a type. */
export async function loadContent(conn: WpConnection, postType: string): Promise<Map<number, string>> {
  const rows = await query<{ ID: number; post_content: string }>(conn, `SELECT ID, post_content FROM wp_posts WHERE post_type = ?`, [postType])
  return new Map(rows.map((row) => [row.ID, row.post_content]))
}

/** `_wp_old_slug` values of a post type, oldest first per post. */
export function loadOldSlugs(conn: WpConnection, postType: string): Promise<{ post_id: number; slug: string }[]> {
  return query(
    conn,
    `SELECT m.post_id, m.meta_value AS slug FROM wp_postmeta m JOIN wp_posts p ON p.ID = m.post_id AND p.post_type = ?
     WHERE m.meta_key = '_wp_old_slug' AND m.meta_value <> '' ORDER BY m.post_id, m.meta_id`,
    [postType],
  )
}

/** Attachment ID for an uploads URL, via _wp_attached_file (also for resized copies like name-300x200.jpg). */
export async function attachmentLookup(conn: WpConnection): Promise<(url: string) => number | null> {
  const rows = await query<{ post_id: number; file: string }>(
    conn,
    `SELECT post_id, meta_value AS file FROM wp_postmeta WHERE meta_key = '_wp_attached_file' ORDER BY post_id`,
  )
  const byFile = new Map<string, number>()
  for (const { post_id, file } of rows) if (!byFile.has(file)) byFile.set(file, post_id)
  return (url) => {
    const path = /\/wp-content\/uploads\/(.+)$/.exec(url.split(/[?#]/)[0])?.[1]
    if (!path) return null
    const file = decodeURIComponent(path)
    return byFile.get(file) ?? byFile.get(file.replace(/-\d+x\d+(\.\w+)$/, '$1')) ?? byFile.get(file.replace(/-scaled(\.\w+)$/, '$1')) ?? null
  }
}
