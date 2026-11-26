// Categories used by members, organisations and events (ACF taxonomy field da_category), plus their parents,
// with the English title from Polylang's term_translations where one exists.

import type { ExtractedCategory } from '../../lib/extract-types'
import { cleanText } from '../../lib/mappers'
import { query, type WpConnection } from '../../lib/mysql'
import { loadTermTranslations } from '../../lib/polylang'
import type { Report } from '../../lib/report'

interface TermRow {
  term_id: number
  name: string
  slug: string
  parent: number
}

export async function extractCategories(conn: WpConnection, usedTermIds: Set<number>, report: Report): Promise<ExtractedCategory[]> {
  const terms = await query<TermRow>(
    conn,
    `SELECT t.term_id, t.name, t.slug, tt.parent FROM wp_terms t
     JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id AND tt.taxonomy = 'category'`,
  )
  const byId = new Map(terms.map((term) => [term.term_id, term]))

  const { englishOf } = await loadTermTranslations(conn)

  // Used terms plus all their ancestors, so `parent` always resolves.
  const include = new Set<number>()
  for (const id of usedTermIds) {
    if (!byId.has(id)) {
      report.warn('category.missing-term', `term ${id}`, 'referenced by a member, organisation or event but no longer exists; dropped')
      continue
    }
    for (let current: number | undefined = id; current && !include.has(current); current = byId.get(current)?.parent) {
      if (!byId.has(current)) break
      include.add(current)
    }
  }

  return [...include]
    .sort((a, b) => a - b)
    .map((id) => {
      const term = byId.get(id)!
      const english = englishOf.get(id)
      return {
        legacyWpId: id,
        title: { de: cleanText(term.name) ?? term.slug, en: english ? cleanText(byId.get(english)?.name) : null },
        slug: term.slug || null,
        parent: term.parent && byId.has(term.parent) ? term.parent : null,
      }
    })
}
