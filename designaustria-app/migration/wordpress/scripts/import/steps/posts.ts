import { sql } from '@payloadcms/db-postgres'

import { EXTRACT_FILES, type ExtractedPost } from '../../../lib/extract-types'
import { createHtmlToLexical } from '../../../lib/html-to-lexical'
import { MIGRATION_CONTEXT, upsertByLegacyKey } from '../../../lib/upsert'
import { idMap, readExtract, runItems, type ImportStep } from '../step'

// The German texts are written with the document, the English ones in a second update in the `en` locale
// (04-news-plan §4.2).
export const posts: ImportStep = {
  name: 'posts',
  // Posts written by staff on the new site (no legacyWpId) are kept.
  wipe: { table: 'posts', keep: sql`legacy_wp_id IS NULL` },
  async run({ payload, report, dryRun, resolve }) {
    const categoryIds = await idMap(payload, 'categories')
    const toLexical = await createHtmlToLexical(payload.config)
    const items = readExtract<ExtractedPost>(EXTRACT_FILES.posts)

    return runItems('posts', items, report, async (post) => {
      const ref = `post ${post.legacyWpId}`
      const upserted = await upsertByLegacyKey({
        payload,
        collection: 'posts',
        key: post.legacyWpId,
        locale: 'de',
        dryRun,
        data: {
          title: post.title.de,
          slug: post.slug.de,
          publishedAt: post.publishedAt,
          visibility: post.visibility,
          categories: resolve(categoryIds, post.categories, ref, 'category'),
          tags: post.tags,
          badge: post.badge,
          excerpt: post.excerpt.de,
          body: toLexical(post.body.de),
          legacy: post.legacy,
        },
      })
      if (dryRun || !upserted.id || !post.title.en) return upserted

      await payload.update({
        collection: 'posts',
        id: upserted.id,
        locale: 'en',
        depth: 0,
        context: MIGRATION_CONTEXT,
        data: { title: post.title.en, slug: post.slug.en, excerpt: post.excerpt.en, body: toLexical(post.body.en) },
      })
      return upserted
    }, (post) => `post ${post.legacyWpId}`)
  },
}
