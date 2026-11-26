// Polylang (the WordPress translation plugin): which language a post or term is in, and which ones translate each other.
// Translation groups are serialized arrays in wp_term_taxonomy.description: a:2:{s:2:"de";i:202;s:2:"en";i:15400;}

import { query, type WpConnection } from './mysql'
import { tryUnserialize } from './php-unserialize'

export type Language = 'de' | 'en'

export interface Translations {
  /** German ID → English ID */
  englishOf: Map<number, number>
  /** English ID → German ID */
  germanOf: Map<number, number>
}

async function loadGroups(conn: WpConnection, taxonomy: 'post_translations' | 'term_translations'): Promise<Translations> {
  const groups = await query<{ description: string }>(conn, `SELECT description FROM wp_term_taxonomy WHERE taxonomy = ?`, [taxonomy])
  const englishOf = new Map<number, number>()
  const germanOf = new Map<number, number>()
  for (const { description } of groups) {
    const group = tryUnserialize(description) as Record<string, number> | undefined
    if (group?.de && group.en) {
      englishOf.set(Number(group.de), Number(group.en))
      germanOf.set(Number(group.en), Number(group.de))
    }
  }
  return { englishOf, germanOf }
}

export const loadTermTranslations = (conn: WpConnection) => loadGroups(conn, 'term_translations')
export const loadPostTranslations = (conn: WpConnection) => loadGroups(conn, 'post_translations')

/** Language of every post of a type. Posts without a language term are missing from the map. */
export async function loadPostLanguages(conn: WpConnection, postType: string): Promise<Map<number, Language>> {
  const rows = await query<{ ID: number; language: string }>(
    conn,
    `SELECT p.ID, t.slug AS language FROM wp_posts p
     JOIN wp_term_relationships r ON r.object_id = p.ID
     JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = r.term_taxonomy_id AND tt.taxonomy = 'language'
     JOIN wp_terms t ON t.term_id = tt.term_id
     WHERE p.post_type = ?`,
    [postType],
  )
  return new Map(rows.filter((row) => row.language === 'de' || row.language === 'en').map((row) => [row.ID, row.language as Language]))
}
