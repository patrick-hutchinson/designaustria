import { EXTRACT_FILES, type ExtractedPost } from '../../../lib/extract-types'
import { IMAGE_PLACEHOLDER } from '../../../lib/wp-html'
import { check, compareKeys, inLocale, readExtract, sampleOf, spotCheck, type Doc, type VerifyStep } from '../check'

const placeholders = (docs: Doc[]) => docs.filter((doc) => JSON.stringify(doc.body ?? '').match(IMAGE_PLACEHOLDER)).length

export const posts: VerifyStep = {
  name: 'posts',
  async run({ payload, docs, legacyOf }) {
    const items = readExtract<ExtractedPost>(EXTRACT_FILES.posts)
    const pPosts = (await docs('posts')).filter((doc) => doc.legacyWpId != null) // posts written by staff aren't compared
    const categoryLegacy = await legacyOf('categories')
    compareKeys('posts', items.map((n) => n.legacyWpId), pPosts)
    const byLegacy = new Map(pPosts.map((doc) => [doc.legacyWpId as number, doc]))

    const privateIds = items.filter((n) => n.legacy.wpStatus === 'private').map((n) => n.legacyWpId)
    check(
      privateIds.every((id) => byLegacy.get(id)?.visibility === 'hidden'),
      `the ${privateIds.length} private WordPress posts are hidden`,
    )
    const dateErrors = items.filter((n) => byLegacy.get(n.legacyWpId)?.publishedAt !== n.publishedAt)
    check(dateErrors.length === 0, `dates match the extract${dateErrors.length ? ` (${dateErrors.length} differ, e.g. post ${dateErrors[0].legacyWpId})` : ''}`)
    const categoryErrors = items.filter((n) => {
      const actual = ((byLegacy.get(n.legacyWpId)?.categories as number[]) ?? []).map((id) => categoryLegacy.get(id)).sort()
      return JSON.stringify(actual) !== JSON.stringify([...n.categories].sort())
    })
    check(categoryErrors.length === 0, `categories match (${items.filter((n) => n.categories.length).length} posts with categories)`)
    const missingText = items.filter((n) => n.body.de && !byLegacy.get(n.legacyWpId)?.body)
    check(missingText.length === 0, `${items.filter((n) => n.body.de).length} posts with a text have one in Payload`)

    // English
    const { docs: english } = await payload.find({
      collection: 'posts',
      locale: 'en',
      fallbackLocale: false,
      pagination: false,
      depth: 0,
      where: { legacyWpId: { exists: true } },
    })
    const enDocs = english as unknown as Doc[]
    const translated = items.filter((n) => n.title.en)
    const enByLegacy = new Map(enDocs.map((doc) => [doc.legacyWpId as number, doc]))
    const enErrors = translated.filter((n) => {
      const doc = enByLegacy.get(n.legacyWpId)
      return doc?.title !== n.title.en || doc?.slug !== n.slug.en
    })
    check(enErrors.length === 0, `${translated.length} translated posts have their English title and slug`)
    check(enDocs.filter((doc) => doc.title).length === translated.length, 'no English titles on posts without an English post')

    // Not a failure yet: the media step (still to be built) replaces these (04-news-plan §6).
    console.log(`  info: image placeholders left in texts: ${placeholders(pPosts)} de, ${placeholders(enDocs)} en (must be 0 after the media step)`)

    console.log('Spot check (20 posts, every field from the extract, German and English)')
    const skip = new Set(['legacyWpId', 'categories', 'body'])
    spotCheck('post', sampleOf(items).map((n) => inLocale(n, 'de') as ExtractedPost), pPosts, skip)
    spotCheck('English post', sampleOf(translated, 10).map((n) => inLocale(n, 'en') as ExtractedPost), enDocs, skip)
  },
}
