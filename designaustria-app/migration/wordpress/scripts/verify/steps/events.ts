import { EXTRACT_FILES, type ExtractedEvent } from '../../../lib/extract-types'
import { IMAGE_PLACEHOLDER } from '../../../lib/wp-html'
import { check, compareKeys, readExtract, sampleOf, spotCheck, type Doc, type VerifyStep } from '../check'

const LOCALIZED = new Set(['de', 'en'])
const isLocalized = (value: unknown): value is { de: unknown; en: unknown } =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).every((key) => LOCALIZED.has(key))

/** The extract record as Payload returns it in one locale: every { de, en } replaced by that locale's value. */
function inLocale(value: unknown, locale: 'de' | 'en'): unknown {
  if (isLocalized(value)) return value[locale]
  if (Array.isArray(value)) return value.map((item) => inLocale(item, locale))
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, inLocale(v, locale)]))
  return value
}

const placeholders = (docs: Doc[]) => docs.filter((doc) => JSON.stringify(doc.description ?? '').match(IMAGE_PLACEHOLDER)).length

export const events: VerifyStep = {
  name: 'events',
  async run({ payload, docs, legacyOf }) {
    const items = readExtract<ExtractedEvent>(EXTRACT_FILES.events)
    const pEvents = (await docs('events')).filter((doc) => doc.legacyWpId != null) // staff-made events aren't compared
    const categoryLegacy = await legacyOf('categories')
    compareKeys('events', items.map((e) => e.legacyWpId), pEvents)
    const byLegacy = new Map(pEvents.map((doc) => [doc.legacyWpId as number, doc]))

    const privateIds = items.filter((e) => e.legacy.wpStatus === 'private').map((e) => e.legacyWpId)
    check(
      privateIds.every((id) => byLegacy.get(id)?.visibility === 'hidden'),
      `the ${privateIds.length} private WordPress events are hidden`,
    )
    const dateErrors = items.filter((e) => {
      const doc = byLegacy.get(e.legacyWpId)
      return !doc || doc.startsAt !== e.startsAt || (doc.endsAt ?? null) !== e.endsAt
    })
    check(dateErrors.length === 0, `start and end match the extract${dateErrors.length ? ` (${dateErrors.length} differ, e.g. event ${dateErrors[0].legacyWpId})` : ''}`)
    check(
      pEvents.every((doc) => !doc.endsAt || (doc.endsAt as string) >= (doc.startsAt as string)),
      'no event ends before it starts',
    )
    const categoryErrors = items.filter((e) => {
      const actual = ((byLegacy.get(e.legacyWpId)?.categories as number[]) ?? []).map((id) => categoryLegacy.get(id)).sort()
      return JSON.stringify(actual) !== JSON.stringify([...e.categories].sort())
    })
    check(categoryErrors.length === 0, `categories match (${items.filter((e) => e.categories.length).length} events with categories)`)
    const missingText = items.filter((e) => e.description.de && !byLegacy.get(e.legacyWpId)?.description)
    check(missingText.length === 0, `${items.filter((e) => e.description.de).length} events with a description have one in Payload`)

    // English
    const { docs: english } = await payload.find({
      collection: 'events',
      locale: 'en',
      fallbackLocale: false,
      pagination: false,
      depth: 0,
      where: { legacyWpId: { exists: true } },
    })
    const enDocs = english as unknown as Doc[]
    const translated = items.filter((e) => e.title.en)
    const enByLegacy = new Map(enDocs.map((doc) => [doc.legacyWpId as number, doc]))
    const enErrors = translated.filter((e) => {
      const doc = enByLegacy.get(e.legacyWpId)
      return doc?.title !== e.title.en || doc?.slug !== e.slug.en
    })
    check(enErrors.length === 0, `${translated.length} translated events have their English title and slug`)
    check(
      enDocs.filter((doc) => doc.title).length === translated.length,
      'no English titles on events without an English post',
    )

    // Not failures yet: the media step (still to be built) fills these in (03-events-plan §4.6, §6).
    const withPlace = items.filter((e) => e.legacy.rawPlace)
    const parsed = withPlace.filter((e) => e.venue.zip).length
    console.log(`  info: old place texts parsed into street/zip/city: ${parsed}/${withPlace.length} (${Math.round((parsed / withPlace.length) * 100)}%)`)
    console.log(`  info: image placeholders left in descriptions: ${placeholders(pEvents)} de, ${placeholders(enDocs)} en (must be 0 after the media step)`)

    console.log('Spot check (20 events, every field from the extract, German and English)')
    const skip = new Set(['legacyWpId', 'categories', 'description'])
    const sample = sampleOf(items)
    spotCheck('event', sample.map((e) => inLocale(e, 'de') as ExtractedEvent), pEvents, skip)
    const enSample = sampleOf(translated, 10).map((e) => inLocale(e, 'en') as ExtractedEvent)
    spotCheck('English event', enSample, enDocs, skip)
  },
}
