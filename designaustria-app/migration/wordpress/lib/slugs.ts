// URL slugs, shared by all migrated content types.

import { slugify } from '@/lib/slugify'

export { slugify }

export interface SlugInput {
  id: number
  slug: string | null
  /** Used when the slug is empty. */
  title: string | null
}

export interface SlugResult {
  slug: string
  /** Set when the slug had to change; the old one needs a redirect unless it was empty. */
  changedFrom?: string | null
}

/**
 * Makes the slugs of one locale unique. Empty slugs come from the title. Clashes keep the slug for the lowest id
 * and add `-<id>` to the others, so the result doesn't depend on input order.
 */
export function uniqueSlugs(items: SlugInput[]): Map<number, SlugResult> {
  const result = new Map<number, SlugResult>()
  const taken = new Set<string>()
  const sorted = [...items].sort((a, b) => a.id - b.id)
  const wanted = new Map(sorted.map((item) => [item.id, item.slug?.trim() || slugify(item.title ?? '') || `${item.id}`]))
  for (const item of sorted) {
    let slug = wanted.get(item.id)!
    if (taken.has(slug)) slug = `${slug}-${item.id}`
    taken.add(slug)
    const original = item.slug?.trim() || null
    result.set(item.id, slug === original ? { slug } : { slug, changedFrom: original })
  }
  return result
}
