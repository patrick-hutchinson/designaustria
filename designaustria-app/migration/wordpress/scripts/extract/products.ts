// Products (Payload `products`), for now made from WordPress publications (post type `publication`) with their ACF
// fields, categories, authors, DE/EN translations and redirects. Plan: docs/06-products-plan.md.

import { viennaToUtc } from '../../lib/dates'
import { mapVisibility } from '../../lib/event-mappers'
import type { ExtractedProduct, ExtractedPublicationDetails, ExtractedRedirect, Localized } from '../../lib/extract-types'
import { parseId, parseIdList } from '../../lib/ids'
import { cleanText } from '../../lib/mappers'
import { loadPostsWithMeta, query, type PostWithMeta, type WpConnection } from '../../lib/mysql'
import { loadPostLanguages, loadPostTranslations, loadTermTranslations, type Language } from '../../lib/polylang'
import {
  authorsText,
  mapMembersAccess,
  memberName,
  normalizeIsbn,
  parsePages,
  parsePublicationYear,
  PUBLICATIONS_CATEGORY_ID,
  withPublicationsCategory,
} from '../../lib/product-mappers'
import { isEmptyRow, readRepeater } from '../../lib/repeater'
import type { Report } from '../../lib/report'
import { assignSlugs } from '../../lib/slugs'
import { cleanWpHtml, type CleanHtml } from '../../lib/wp-html'
import { attachmentLookup, loadContent, loadOldSlugs, pickDocuments } from '../../lib/wp-posts'

/** Drafts aren't migrated (06-products-plan §4.1). */
const MIGRATED_STATUSES = new Set(['publish', 'private'])

/** Old and new URL paths (06-products-plan §4.5). */
export const oldPath = (locale: Language, slug: string) => `${locale === 'en' ? '/en' : ''}/publikation/${slug}`
export const newPath = (locale: Language, slug: string) => `/${locale}/products/${slug}`

export interface MemberLookup {
  /** Every WordPress member post, also the unmigrated ones (for their names) */
  memberPosts: PostWithMeta[]
  /** WordPress member ID (also of a duplicate merged away) → the migrated member's legacyWpId */
  migratedMemberOf: Map<number, number>
}

// Naming: `publication` / `wpPublications` are WordPress rows, `products` / `ExtractedProduct` the extracted records.
export async function extractProducts(
  conn: WpConnection,
  { memberPosts, migratedMemberOf }: MemberLookup,
  report: Report,
): Promise<{ products: ExtractedProduct[]; redirects: ExtractedRedirect[]; source: number; notMigrated: Record<string, number> }> {
  const { posts: wpPublications, duplicateKeys } = await loadPostsWithMeta(conn, 'publication')
  for (const { postId, key } of duplicateKeys) {
    if (!key.startsWith('_wp_old_')) report.warn('meta.duplicate-key', `publication ${postId}`, `"${key}" stored more than once; newest value used`)
  }
  const content = await loadContent(conn, 'publication')
  const languages = await loadPostLanguages(conn, 'publication')
  const postTranslations = await loadPostTranslations(conn)
  const termTranslations = await loadTermTranslations(conn)
  const attachmentIdForUrl = await attachmentLookup(conn)
  const inPublicationsTree = await publicationsTree(conn)
  const memberById = new Map(memberPosts.map((m) => [m.post.ID, m]))
  const wcProductIds = new Set(
    (await query<{ ID: number }>(conn, `SELECT ID FROM wp_posts WHERE post_type = 'product'`)).map((row) => row.ID),
  )

  // 1. German publications with their English partner, plus English ones without a migrated German partner (plan §4.5).
  const { documents, notMigrated } = pickDocuments(
    wpPublications,
    { statuses: MIGRATED_STATUSES, languages, translations: postTranslations, entity: 'product' },
    report,
  )

  // 2. Map each document
  const products: ExtractedProduct[] = []
  for (const { main, en } of documents) {
    const { post, meta } = main
    const ref = `product ${post.ID}`
    const englishOnly = languages.get(post.ID) === 'en'

    const publishedAt = report.mapped(ref, viennaToUtc(post.post_date))
    if (!publishedAt) {
      report.warn('product.no-date', ref, `no date ("${post.post_date}"); not migrated`)
      notMigrated['no date'] = (notMigrated['no date'] ?? 0) + 1
      continue
    }

    const body = readBody(main, content.get(post.ID), attachmentIdForUrl, report)
    const enBody = en ? readBody(en, content.get(en.post.ID), attachmentIdForUrl, report) : null
    const pick = <T>(de: T | null, english: T | null): Localized<T> => (englishOnly ? { de, en: de } : { de, en: english })

    // Categories: the ACF field of the German and the English post (publications have no term links), mapped to German
    // terms, plus Publikationen where none is in its tree (§4.1).
    const acfCategories = [...parseIdList(meta.da_category), ...(en ? parseIdList(en.meta.da_category) : [])]
    const categories = withPublicationsCategory(
      [...new Set(acfCategories.map((id) => termTranslations.germanOf.get(id) ?? id))],
      inPublicationsTree,
    )
    if (categories.added) report.warn('product.category-added', ref, 'not in Publikationen or a subcategory; Publikationen added')

    const access = mapMembersAccess(meta.da_members_access)
    if (access.unknown.length) report.warn('value.members-access', ref, `da_members_access: unknown value(s) ${access.unknown.join(', ')}; ignored`)

    if (cleanText(meta.da_shop)) report.warn('product.da-shop-ignored', ref, `da_shop = ${meta.da_shop}; ignored (da_product is used)`)
    const wcProductWpId = parseId(meta.da_product)
    if (wcProductWpId && !wcProductIds.has(wcProductWpId)) {
      report.warn('product.wc-product-missing', ref, `da_product ${wcProductWpId} is not a WC product; not for sale`)
    }

    const memberAuthorWpIds = parseIdList(meta.da_publication_author)
    const details = publicationDetails(ref, main, memberAuthorWpIds, { memberById, migratedMemberOf }, report)

    products.push({
      legacyWpId: post.ID,
      title: pick(cleanText(post.post_title), en ? cleanText(en.post.post_title) : null),
      subtitle: pick(cleanText(meta.da_publication_subtitle), en ? cleanText(en.meta.da_publication_subtitle) : null),
      slug: { de: post.post_name || null, en: englishOnly ? post.post_name || null : (en?.post.post_name ?? null) }, // made unique below
      publishedAt,
      visibility: post.post_status === 'private' ? 'hidden' : report.mapped(ref, mapVisibility(meta.da_linked))!,
      categories: categories.ids,
      membersOnly: access.value,
      shopSku: null, // set by extractShopProducts for the WC products it migrates
      body: pick(body.html, enBody?.html ?? null),
      details: details ? [details] : [],
      legacy: {
        wpPostType: 'publication',
        wpStatus: post.post_status as 'publish' | 'private',
        enWpId: englishOnly ? post.ID : (en?.post.ID ?? null),
        wcProductWpId: wcProductWpId && wcProductIds.has(wcProductWpId) ? wcProductWpId : null,
        imageWpIds: parseIdList(meta.da_images),
        inlineImageWpIds: [...new Set([...body.inlineImageWpIds, ...(enBody?.inlineImageWpIds ?? [])])],
        documentWpIds: [
          ...new Set(readRepeater(meta, 'da_documents').flatMap((row) => (isEmptyRow(row) ? [] : (parseId(row.da_document) ?? [])))),
        ],
        memberAuthorWpIds,
      },
    })
  }

  // 3. Unique slugs per locale, and redirects for what the pattern rules don't cover
  const redirects = assignSlugs(
    products,
    {
      entity: 'product',
      oldPath,
      newPath,
      oldSlugs: await loadOldSlugs(conn, 'publication'),
      englishOnly: new Set(products.filter((p) => languages.get(p.legacyWpId) === 'en').map((p) => p.legacyWpId)),
    },
    report,
  )

  return { products, redirects, source: wpPublications.length, notMigrated }
}

/** The `publicationDetails` block, or null when the publication has none of its fields (§3.1, §4.2). */
function publicationDetails(
  ref: string,
  { meta }: PostWithMeta,
  memberAuthorWpIds: number[],
  { memberById, migratedMemberOf }: { memberById: Map<number, PostWithMeta>; migratedMemberOf: Map<number, number> },
  report: Report,
): ExtractedPublicationDetails | null {
  const authors: number[] = []
  const unmigratedNames: string[] = []
  for (const id of memberAuthorWpIds) {
    const migrated = migratedMemberOf.get(id)
    if (migrated) {
      if (!authors.includes(migrated)) authors.push(migrated)
      continue
    }
    const member = memberById.get(id)
    const name = member ? memberName(member.meta.da_member_firstname, member.meta.da_member_lastname, member.post.post_title) : null
    if (name) {
      unmigratedNames.push(name)
      report.warn('product.author-not-migrated', ref, `member ${id} is ${member!.post.post_status}; name added to authorsText`)
    } else {
      report.warn('product.author-missing', ref, `member ${id} ${member ? 'has no name' : 'does not exist'}; dropped`)
    }
  }
  if (cleanText(meta.da_publication_author_int)) report.warn('product.leftover-field', ref, 'da_publication_author_int is set; ignored')
  if (cleanText(meta.da_publication_scope)) report.warn('product.leftover-field', ref, `da_publication_scope "${cleanText(meta.da_publication_scope)}"; ignored`)

  const details: ExtractedPublicationDetails = {
    blockType: 'publicationDetails',
    authors,
    authorsText: authorsText(unmigratedNames, meta.da_publication_author_ext),
    year: report.mapped(ref, parsePublicationYear(meta.da_publication_year)),
    publisher: cleanText(meta.da_publication_publisher),
    isbn: normalizeIsbn(meta.da_publication_isbn),
    pages: report.mapped(ref, parsePages(meta.da_publication_sites)),
    format: cleanText(meta.da_publication_style),
  }
  const { blockType: _, authors: list, ...rest } = details
  return list.length || Object.values(rest).some((value) => value !== null) ? details : null
}

function readBody({ post }: PostWithMeta, html: string | undefined, attachmentIdForUrl: (url: string) => number | null, report: Report): CleanHtml {
  const body = cleanWpHtml(html, { attachmentIdForUrl })
  for (const issue of body.issues) report.warn(`html.${issue.code}`, `product ${post.ID}`, issue.detail)
  return body
}

/** Whether a category term is Publikationen or one of its descendants. */
async function publicationsTree(conn: WpConnection): Promise<(id: number) => boolean> {
  const rows = await query<{ term_id: number; parent: number }>(conn, `SELECT term_id, parent FROM wp_term_taxonomy WHERE taxonomy = 'category'`)
  const parentOf = new Map(rows.map((row) => [row.term_id, row.parent]))
  return (id) => {
    const seen = new Set<number>()
    for (let current: number | undefined = id; current && !seen.has(current); current = parentOf.get(current)) {
      if (current === PUBLICATIONS_CATEGORY_ID) return true
      seen.add(current)
    }
    return false
  }
}
