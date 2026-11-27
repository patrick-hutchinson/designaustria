// Value mappers for posts (the news; WordPress post type `post`). Plan: docs/04-news-plan.md §3–4.

/**
 * WordPress's default category (term 1, "Design", and its English partner 187). WordPress adds it to every post saved
 * without a category, so on its own it says nothing about the post (04-news-plan §3.2).
 */
export const DEFAULT_CATEGORY_IDS = new Set([1, 187])

/**
 * A post's categories: the ACF field `da_category` and the normal term links (`wp_term_relationships`) together,
 * without the default category that WordPress adds by itself. `differs` is true when the two lists disagree
 * (ignoring that default), for the report.
 */
export function mergeCategories(acf: number[], terms: number[]): { ids: number[]; differs: boolean } {
  const fromTerms = terms.filter((id) => !DEFAULT_CATEGORY_IDS.has(id))
  const ids = [...new Set([...acf, ...fromTerms])]
  const differs = acf.length !== fromTerms.length || !fromTerms.every((id) => acf.includes(id))
  return { ids, differs }
}

/** Tag names: trimmed, empty ones dropped, duplicates (case-insensitive) removed, first spelling kept. */
export function tagNames(names: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const name of names) {
    const tag = name?.trim()
    if (!tag || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    result.push(tag)
  }
  return result
}
