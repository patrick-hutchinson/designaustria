// Posts (the news; WordPress post type `post`) with their ACF fields, categories, tags, DE/EN translations and redirects. Plan: docs/04-news-plan.md.

import { viennaToUtc } from '../../lib/dates'
import { mapVisibility } from '../../lib/event-mappers'
import type { ExtractedPost, ExtractedRedirect, Localized } from '../../lib/extract-types'
import { parseId, parseIdList } from '../../lib/ids'
import { cleanText } from '../../lib/mappers'
import { loadPostsWithMeta, query, type PostWithMeta, type WpConnection } from '../../lib/mysql'
import { mergeCategories, tagNames } from '../../lib/post-mappers'
import { loadPostLanguages, loadPostTranslations, loadTermTranslations, type Language } from '../../lib/polylang'
import { isEmptyRow, readRepeater } from '../../lib/repeater'
import type { Report } from '../../lib/report'
import { assignSlugs } from '../../lib/slugs'
import { cleanWpHtml, type CleanHtml } from '../../lib/wp-html'
import { attachmentLookup, loadContent, loadOldSlugs, pickDocuments } from '../../lib/wp-posts'

/** `pending` posts (the 2011–2020 old-site import) aren't public, so they aren't migrated (04-news-plan §4.1). */
const MIGRATED_STATUSES = new Set(['publish', 'private'])

/** Old and new URL paths (04-news-plan §4.6). */
const oldPath = (locale: Language, slug: string) => `${locale === 'en' ? '/en' : ''}/neues/${slug}`
const newPath = (locale: Language, slug: string) => `/${locale}/news/${slug}`

interface PostTexts {
  title: string | null
  excerpt: string | null
  body: CleanHtml
}

// Naming: `post` / `wpPosts` are WordPress rows, `posts` / `ExtractedPost` the extracted records.
export async function extractPosts(
  conn: WpConnection,
  report: Report,
): Promise<{ posts: ExtractedPost[]; redirects: ExtractedRedirect[]; source: number; notMigrated: Record<string, number> }> {
  const { posts: wpPosts, duplicateKeys } = await loadPostsWithMeta(conn, 'post')
  for (const { postId, key } of duplicateKeys) {
    if (!key.startsWith('_wp_old_')) report.warn('meta.duplicate-key', `post ${postId}`, `"${key}" stored more than once; newest value used`)
  }
  const content = await loadContent(conn, 'post')
  const excerpts = new Map(
    (await query<{ ID: number; post_excerpt: string }>(conn, `SELECT ID, post_excerpt FROM wp_posts WHERE post_type = 'post'`)).map((row) => [
      row.ID,
      row.post_excerpt,
    ]),
  )
  const terms = await loadTerms(conn)
  const languages = await loadPostLanguages(conn, 'post')
  const postTranslations = await loadPostTranslations(conn)
  const termTranslations = await loadTermTranslations(conn)
  const attachmentIdForUrl = await attachmentLookup(conn)

  // 1. German posts with their English partner, plus English ones without a migrated German partner (plan §4.2).
  const { documents, notMigrated } = pickDocuments(
    wpPosts,
    { statuses: MIGRATED_STATUSES, languages, translations: postTranslations, entity: 'post' },
    report,
  )

  // 2. Map each document
  const posts: ExtractedPost[] = []
  for (const { main, en } of documents) {
    const { post, meta } = main
    const ref = `post ${post.ID}`
    const englishOnly = languages.get(post.ID) === 'en'

    const publishedAt = report.mapped(ref, viennaToUtc(post.post_date))
    if (!publishedAt) {
      report.warn('post.no-date', ref, `no date ("${post.post_date}"); not migrated`)
      notMigrated['no date'] = (notMigrated['no date'] ?? 0) + 1
      continue
    }

    const texts = readTexts(main, content.get(post.ID), excerpts.get(post.ID), attachmentIdForUrl, report)
    const enTexts = en ? readTexts(en, content.get(en.post.ID), excerpts.get(en.post.ID), attachmentIdForUrl, report) : null
    if (en) compareWithEnglish(main, en, report)
    const pick = <T>(de: T | null, english: T | null): Localized<T> => (englishOnly ? { de, en: de } : { de, en: english })

    // Categories: ACF field and term links, of the German and the English post, mapped to German terms (plan §3.2).
    const categoriesOf = ({ post: p, meta: m }: PostWithMeta) => {
      const merged = mergeCategories(parseIdList(m.da_category), terms.categories.get(p.ID) ?? [])
      if (merged.differs) report.warn('post.categories-differ', `post ${p.ID}`, 'da_category and the term links differ; both used')
      return merged.ids
    }
    const categories = [...new Set([...categoriesOf(main), ...(en ? categoriesOf(en) : [])].map((id) => termTranslations.germanOf.get(id) ?? id))]

    posts.push({
      legacyWpId: post.ID,
      title: pick(texts.title, enTexts?.title ?? null),
      slug: { de: post.post_name || null, en: englishOnly ? post.post_name || null : (en?.post.post_name ?? null) }, // made unique below
      publishedAt,
      visibility: post.post_status === 'private' ? 'hidden' : report.mapped(ref, mapVisibility(meta.da_linked))!,
      categories,
      tags: tagNames([...(terms.tags.get(post.ID) ?? []), ...(en ? (terms.tags.get(en.post.ID) ?? []) : [])]),
      badge: cleanText(meta.da_badge_name),
      excerpt: pick(texts.excerpt, enTexts?.excerpt ?? null),
      body: pick(texts.body.html, enTexts?.body.html ?? null),
      legacy: {
        wpStatus: post.post_status as 'publish' | 'private',
        enWpId: englishOnly ? post.ID : (en?.post.ID ?? null),
        authorWpId: post.post_author || null,
        thumbnailWpId: parseId(meta._thumbnail_id),
        imageWpIds: parseIdList(meta.da_images),
        inlineImageWpIds: [...new Set([...texts.body.inlineImageWpIds, ...(enTexts?.body.inlineImageWpIds ?? [])])],
        documentWpIds: [
          ...new Set(readRepeater(meta, 'da_documents').flatMap((row) => (isEmptyRow(row) ? [] : (parseId(row.da_document) ?? [])))),
        ],
      },
    })
  }

  // 3. Unique slugs per locale, and redirects for what the pattern rules don't cover
  const redirects = assignSlugs(
    posts,
    {
      entity: 'post',
      oldPath,
      newPath,
      oldSlugs: await loadOldSlugs(conn, 'post'),
      englishOnly: new Set(posts.filter((p) => languages.get(p.legacyWpId) === 'en').map((p) => p.legacyWpId)),
    },
    report,
  )

  return { posts, redirects, source: wpPosts.length, notMigrated }
}

function readTexts(
  { post }: PostWithMeta,
  html: string | undefined,
  excerpt: string | undefined,
  attachmentIdForUrl: (url: string) => number | null,
  report: Report,
): PostTexts {
  const body = cleanWpHtml(html, { attachmentIdForUrl })
  for (const issue of body.issues) report.warn(`html.${issue.code}`, `post ${post.ID}`, issue.detail)
  return { title: cleanText(post.post_title), excerpt: cleanText(excerpt), body }
}

/** The English post's own date is ignored; a different one is logged so staff can check it (plan §4.2). */
function compareWithEnglish(de: PostWithMeta, en: PostWithMeta, report: Report) {
  const [a, b] = [de.post.post_date.slice(0, 10), en.post.post_date.slice(0, 10)]
  if (a !== b) report.warn('post.en-differs', `post ${de.post.ID}`, `date ${a} (de) vs ${b} (en ${en.post.ID}); German used`)
}

/** Category IDs and tag names per post, from the normal WordPress term links. */
async function loadTerms(conn: WpConnection) {
  const rows = await query<{ post_id: number; taxonomy: 'category' | 'post_tag'; term_id: number; name: string }>(
    conn,
    `SELECT r.object_id AS post_id, tt.taxonomy, t.term_id, t.name FROM wp_term_relationships r
     JOIN wp_posts p ON p.ID = r.object_id AND p.post_type = 'post'
     JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = r.term_taxonomy_id AND tt.taxonomy IN ('category', 'post_tag')
     JOIN wp_terms t ON t.term_id = tt.term_id
     ORDER BY r.object_id, r.term_order, t.term_id`,
  )
  const categories = new Map<number, number[]>()
  const tags = new Map<number, string[]>()
  for (const row of rows) {
    if (row.taxonomy === 'category') categories.set(row.post_id, [...(categories.get(row.post_id) ?? []), row.term_id])
    else tags.set(row.post_id, [...(tags.get(row.post_id) ?? []), cleanText(row.name) ?? ''])
  }
  return { categories, tags }
}
