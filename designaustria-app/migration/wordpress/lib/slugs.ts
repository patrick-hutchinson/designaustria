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

// ── Slugs and redirects of a translated content type (03-events-plan §4.7) ──

export type Locale = 'de' | 'en'

/** The fields of an extracted document that slugs and redirects need. */
export interface SlugDocument {
  legacyWpId: number
  title: { de: string | null; en: string | null }
  slug: { de: string | null; en: string | null }
  visibility: string
  legacy: { enWpId: number | null }
}

export interface Redirect<E extends string = string> {
  entity: E
  legacyWpId: number
  locale: Locale
  from: string
  to: string
  reason: 'old-slug' | 'slug-changed'
}

export interface SlugOptions<E extends string> {
  /** Redirect entity and warning prefix, e.g. `event` → `event.slug-changed` */
  entity: E
  /** Old URL path on the WordPress site, without trailing slash, e.g. /veranstaltung/<slug> */
  oldPath: (locale: Locale, slug: string) => string
  /** New URL path, e.g. /de/events/<slug> */
  newPath: (locale: Locale, slug: string) => string
  /** `_wp_old_slug` rows, oldest first per post */
  oldSlugs: { post_id: number; slug: string }[]
  /** IDs of documents made from an English post (no German partner) */
  englishOnly: Set<number>
}

/**
 * Makes the slugs unique per locale (in place) and returns the redirects the pattern rules don't cover: slugs the
 * extract changed, and `_wp_old_slug` values. Hidden documents get none. Documents without an English post keep an
 * empty English slug (the page uses the German one).
 */
export function assignSlugs<E extends string>(
  docs: SlugDocument[],
  { entity, oldPath, newPath, oldSlugs, englishOnly }: SlugOptions<E>,
  report: { warn: (code: string, ref: string, detail: string) => void },
): Redirect<E>[] {
  const redirects: Redirect<E>[] = []
  for (const locale of ['de', 'en'] as const) {
    const withSlug = docs.filter((doc) => locale === 'de' || doc.legacy.enWpId !== null)
    const slugs = uniqueSlugs(withSlug.map((doc) => ({ id: doc.legacyWpId, slug: doc.slug[locale], title: doc.title[locale] })))
    for (const doc of withSlug) {
      const { slug, changedFrom } = slugs.get(doc.legacyWpId)!
      doc.slug[locale] = slug
      if (changedFrom === undefined) continue
      report.warn(`${entity}.slug-changed`, `${entity} ${doc.legacyWpId}`, `${locale} slug "${changedFrom ?? ''}" → "${slug}"`)
      if (changedFrom && doc.visibility !== 'hidden') {
        redirects.push({ entity, legacyWpId: doc.legacyWpId, locale, from: oldPath(locale, changedFrom), to: newPath(locale, slug), reason: 'slug-changed' })
      }
    }
  }

  const docOfPost = new Map<number, { doc: SlugDocument; locale: Locale }>()
  for (const doc of docs) {
    const isEnglishOnly = englishOnly.has(doc.legacyWpId)
    docOfPost.set(doc.legacyWpId, { doc, locale: isEnglishOnly ? 'en' : 'de' })
    if (!isEnglishOnly && doc.legacy.enWpId) docOfPost.set(doc.legacy.enWpId, { doc, locale: 'en' })
  }
  const current = { de: new Set(docs.map((d) => d.slug.de)), en: new Set(docs.map((d) => d.slug.en)) }
  const seen = new Set<string>()
  for (const { post_id, slug: old } of oldSlugs) {
    const target = docOfPost.get(post_id)
    if (!target || target.doc.visibility === 'hidden') continue
    const { doc, locale } = target
    const slug = doc.slug[locale]!
    const key = `${locale}:${old}`
    if (old === slug || seen.has(key)) continue
    if (current[locale].has(old)) {
      report.warn(`${entity}.old-slug-taken`, `${entity} ${doc.legacyWpId}`, `old ${locale} slug "${old}" is now another ${entity}'s slug; no redirect`)
      continue
    }
    seen.add(key)
    redirects.push({ entity, legacyWpId: doc.legacyWpId, locale, from: oldPath(locale, old), to: newPath(locale, slug), reason: 'old-slug' })
  }
  return redirects.sort((a, b) => a.locale.localeCompare(b.locale) || a.from.localeCompare(b.from))
}
