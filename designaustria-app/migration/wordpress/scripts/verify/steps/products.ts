import { EXTRACT_FILES, type ExtractedProduct } from '../../../lib/extract-types'
import { PUBLICATIONS_CATEGORY_ID } from '../../../lib/product-mappers'
import { IMAGE_PLACEHOLDER } from '../../../lib/wp-html'
import { check, compareKeys, inLocale, readExtract, sampleOf, spotCheck, type Doc, type VerifyStep } from '../check'

const placeholders = (docs: Doc[]) => docs.filter((doc) => JSON.stringify(doc.body ?? '').match(IMAGE_PLACEHOLDER)).length

type DetailsBlock = { authors?: number[]; authorsText?: string | null; isbn?: string | null; year?: number | null }

export const products: VerifyStep = {
  name: 'products',
  async run({ payload, docs, legacyOf }) {
    const items = readExtract<ExtractedProduct>(EXTRACT_FILES.products)
    const pProducts = (await docs('products')).filter((doc) => doc.legacyWpId != null) // products made by staff aren't compared
    const categoryLegacy = await legacyOf('categories')
    const memberLegacy = await legacyOf('members')
    compareKeys('products', items.map((p) => p.legacyWpId), pProducts)
    const byLegacy = new Map(pProducts.map((doc) => [doc.legacyWpId as number, doc]))
    const categoriesOf = (doc: Doc | undefined) => ((doc?.categories as number[]) ?? []).map((id) => categoryLegacy.get(id))

    const privateIds = items.filter((p) => p.legacy.wpStatus === 'private').map((p) => p.legacyWpId)
    check(privateIds.every((id) => byLegacy.get(id)?.visibility === 'hidden'), `the ${privateIds.length} private publication(s) are hidden`)
    const categoryErrors = items.filter((p) => {
      const actual = categoriesOf(byLegacy.get(p.legacyWpId)).sort()
      return JSON.stringify(actual) !== JSON.stringify([...p.categories].sort())
    })
    check(categoryErrors.length === 0, `categories match${categoryErrors.length ? ` (${categoryErrors.length} differ, e.g. product ${categoryErrors[0].legacyWpId})` : ''}`)

    // Every publication is in Publikationen or a subcategory (§4.1): walk up the parents in Payload.
    const { docs: categories } = await payload.find({ collection: 'categories', pagination: false, depth: 0, select: { parent: true, legacyWpId: true } })
    const parentOf = new Map(categories.map((c) => [c.id, (c.parent as number | null) ?? null]))
    const publikationen = categories.find((c) => c.legacyWpId === PUBLICATIONS_CATEGORY_ID)?.id
    const inTree = (id: number) => {
      for (let current: number | null = id, depth = 0; current && depth < 20; current = parentOf.get(current) ?? null, depth++) if (current === publikationen) return true
      return false
    }
    const outside = pProducts.filter((doc) => !((doc.categories as number[]) ?? []).some(inTree))
    check(publikationen !== undefined && outside.length === 0, `all products are in Publikationen${outside.length ? ` (${outside.length} aren't, e.g. ${outside[0].legacyWpId})` : ''}`)

    const skuErrors = items.filter((p) => (byLegacy.get(p.legacyWpId)?.shopSku ?? null) !== p.shopSku)
    check(skuErrors.length === 0, `shop SKUs match (${items.filter((p) => p.shopSku).length} for sale)`)

    // The publicationDetails block, with authors as members (§4.2)
    const detailErrors = items.filter((p) => {
      const blocks = (byLegacy.get(p.legacyWpId)?.details as DetailsBlock[]) ?? []
      if (blocks.length !== p.details.length) return true
      return p.details.some((expected, i) => {
        const actual = blocks[i]
        const authors = (actual.authors ?? []).map((id) => memberLegacy.get(id))
        return (
          JSON.stringify(authors) !== JSON.stringify(expected.authors) ||
          (actual.authorsText ?? null) !== expected.authorsText ||
          (actual.isbn ?? null) !== expected.isbn ||
          (actual.year ?? null) !== expected.year
        )
      })
    })
    const authorLinks = items.reduce((sum, p) => sum + (p.details[0]?.authors.length ?? 0), 0)
    check(
      detailErrors.length === 0,
      `publication details match (${items.filter((p) => p.details.length).length} blocks, ${authorLinks} member authors)${detailErrors.length ? `; ${detailErrors.length} differ, e.g. product ${detailErrors[0].legacyWpId}` : ''}`,
    )
    const missingText = items.filter((p) => p.body.de && !byLegacy.get(p.legacyWpId)?.body)
    check(missingText.length === 0, `${items.filter((p) => p.body.de).length} products with a text have one in Payload`)

    // English
    const { docs: english } = await payload.find({
      collection: 'products',
      locale: 'en',
      fallbackLocale: false,
      pagination: false,
      depth: 0,
      where: { legacyWpId: { exists: true } },
    })
    const enDocs = english as unknown as Doc[]
    const translated = items.filter((p) => p.title.en)
    const enByLegacy = new Map(enDocs.map((doc) => [doc.legacyWpId as number, doc]))
    const enErrors = translated.filter((p) => {
      const doc = enByLegacy.get(p.legacyWpId)
      return doc?.title !== p.title.en || doc?.slug !== p.slug.en
    })
    check(enErrors.length === 0, `${translated.length} translated products have their English title and slug`)
    check(enDocs.filter((doc) => doc.title).length === translated.length, 'no English titles on products without an English post')

    // Not a failure yet: the media step (still to be built) replaces these (06-products-plan §6).
    console.log(`  info: image placeholders left in texts: ${placeholders(pProducts)} de, ${placeholders(enDocs)} en (must be 0 after the media step)`)

    console.log('Spot check (20 products, every field from the extract, German and English)')
    const skip = new Set(['legacyWpId', 'categories', 'body', 'details'])
    spotCheck('product', sampleOf(items).map((p) => inLocale(p, 'de') as ExtractedProduct), pProducts, skip)
    spotCheck('English product', sampleOf(translated, 10).map((p) => inLocale(p, 'en') as ExtractedProduct), enDocs, skip)
  },
}
