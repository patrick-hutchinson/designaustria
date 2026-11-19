import mysql from 'mysql2/promise'

import type { Meta } from './repeater'

// Read-only access to the WordPress dump loaded by scripts/00-load-dump.sh.
export const WP_MYSQL_URL = process.env.WP_MYSQL_URL ?? 'mysql://root:wp@127.0.0.1:3307/wordpress'

export type WpConnection = mysql.Connection

export const connectWp = (): Promise<WpConnection> =>
  mysql.createConnection({ uri: WP_MYSQL_URL, charset: 'utf8mb4', dateStrings: true })

export interface WpPost {
  ID: number
  post_type: string
  post_status: string
  post_name: string
  post_title: string
  post_date: string
  post_date_gmt: string
  post_modified_gmt: string
  post_author: number
}

export interface PostWithMeta {
  post: WpPost
  meta: Meta
}

export async function query<T>(conn: WpConnection, sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await conn.query(sql, params)
  return rows as T[]
}

/**
 * All posts of one type with their postmeta as a key → value map, ordered by ID (deterministic output).
 * If a key occurs more than once on a post (WordPress allows it), the newest row (highest meta_id) wins;
 * those keys are returned in `duplicateKeys` so the extract can report them.
 */
export async function loadPostsWithMeta(
  conn: WpConnection,
  postType: string,
): Promise<{ posts: PostWithMeta[]; duplicateKeys: { postId: number; key: string }[] }> {
  const posts = await query<WpPost>(
    conn,
    `SELECT ID, post_type, post_status, post_name, post_title, post_date, post_date_gmt, post_modified_gmt, post_author
     FROM wp_posts WHERE post_type = ? ORDER BY ID`,
    [postType],
  )
  const metaRows = await query<{ post_id: number; meta_key: string; meta_value: string | null }>(
    conn,
    `SELECT m.post_id, m.meta_key, m.meta_value FROM wp_postmeta m
     JOIN wp_posts p ON p.ID = m.post_id AND p.post_type = ?
     ORDER BY m.post_id, m.meta_id`,
    [postType],
  )

  const metaByPost = new Map<number, Meta>()
  const duplicateKeys: { postId: number; key: string }[] = []
  for (const row of metaRows) {
    const meta = metaByPost.get(row.post_id) ?? {}
    if (row.meta_key in meta) duplicateKeys.push({ postId: row.post_id, key: row.meta_key })
    meta[row.meta_key] = row.meta_value ?? ''
    metaByPost.set(row.post_id, meta)
  }
  return { posts: posts.map((post) => ({ post, meta: metaByPost.get(post.ID) ?? {} })), duplicateKeys }
}
